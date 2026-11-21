package service

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"
	"strings"
	"time"

	"github.com/AIlord1501/taskflow/backend-go/internal/model"
	"github.com/AIlord1501/taskflow/backend-go/internal/repository"
	"github.com/redis/go-redis/v9"
	"golang.org/x/sync/singleflight"
)

const (
	// CacheKeyAllTasks holds the JSON-encoded result of GetAllTasks.
	CacheKeyAllTasks = "tasks:all"
	// CacheTTL bounds staleness if an invalidation is ever missed.
	CacheTTL = 30 * time.Second
	// AIJobsStream is the durable Redis Stream consumed by the FastAPI worker group.
	AIJobsStream = "taskflow:ai_jobs"

	redisOpTimeout = 500 * time.Millisecond
)

// Sentinel errors allow the HTTP layer to map domain failures to exact HTTP status codes.
var (
	ErrInvalidInput = errors.New("invalid task input")
	ErrTaskNotFound = repository.ErrTaskNotFound
)

type TaskService struct {
	repo  repository.TaskRepository
	redis *redis.Client
	// sf collapses concurrent cache misses on this replica into a single DB query,
	// preventing a thundering herd against Postgres when tasks:all expires.
	sf singleflight.Group
}

func NewTaskService(repo repository.TaskRepository, rdb *redis.Client) *TaskService {
	return &TaskService{repo: repo, redis: rdb}
}

// ---------------------------------------------------------------------------
// Commands
// ---------------------------------------------------------------------------

func (s *TaskService) CreateTask(ctx context.Context, input model.CreateTaskInput) (model.Task, error) {
	// Business rule 1: Normalize and validate title
	input.Title = strings.TrimSpace(input.Title)
	if input.Title == "" || len(input.Title) > 255 {
		return model.Task{}, ErrInvalidInput
	}
	input.Description = strings.TrimSpace(input.Description)

	// Business rule 2: Clean up tags (remove blank strings)
	input.Tags = cleanTags(input.Tags)

	task, err := s.repo.Create(ctx, input)
	if err != nil {
		return model.Task{}, err
	}

	s.invalidateCache(ctx)

	// Durable hand-off to the AI worker pool. The task row is already committed,
	// so a Redis failure degrades gracefully (task stays without ai_summary)
	// rather than failing the user's request.
	if err := s.enqueueAIJob(ctx, task); err != nil {
		slog.Error("failed to enqueue AI job", "task_id", task.ID, "error", err)
	}

	return task, nil
}

func (s *TaskService) UpdateStatus(ctx context.Context, id string, status model.TaskStatus) (model.Task, error) {
	id = strings.TrimSpace(id)
	if id == "" || !isValidTaskStatus(status) {
		return model.Task{}, ErrInvalidInput
	}

	task, err := s.repo.UpdateStatus(ctx, id, status)
	if err != nil {
		return model.Task{}, err
	}
	s.invalidateCache(ctx)
	return task, nil
}

func (s *TaskService) Delete(ctx context.Context, id string) error {
	id = strings.TrimSpace(id)
	if id == "" {
		return ErrInvalidInput
	}
	if err := s.repo.Delete(ctx, id); err != nil {
		return err
	}
	s.invalidateCache(ctx)
	return nil
}

// UpdateAIEnrichment is invoked by the internal callback endpoint once a
// FastAPI worker has analyzed a task pulled from the Redis Stream.
func (s *TaskService) UpdateAIEnrichment(ctx context.Context, id, summary string, tags []string) error {
	id = strings.TrimSpace(id)
	summary = strings.TrimSpace(summary)
	if id == "" || summary == "" {
		return ErrInvalidInput
	}
	if err := s.repo.UpdateAIEnrichment(ctx, id, summary, cleanTags(tags)); err != nil {
		return err
	}
	s.invalidateCache(ctx)
	return nil
}

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

// GetAllTasks is a read-through cache over Postgres. Redis outages fall back
// transparently to the database.
func (s *TaskService) GetAllTasks(ctx context.Context) ([]model.Task, error) {
	if tasks, ok := s.readCache(ctx); ok {
		return tasks, nil
	}

	v, err, _ := s.sf.Do(CacheKeyAllTasks, func() (any, error) {
		// Detach from the first caller's cancellation so one aborted request
		// doesn't fail every waiter sharing this flight.
		dbCtx, cancel := context.WithTimeout(context.WithoutCancel(ctx), 5*time.Second)
		defer cancel()

		tasks, err := s.repo.ListAll(dbCtx)
		if err != nil {
			return nil, err
		}
		s.writeCache(dbCtx, tasks)
		return tasks, nil
	})
	if err != nil {
		return nil, err
	}
	return v.([]model.Task), nil
}

// ---------------------------------------------------------------------------
// Redis helpers
// ---------------------------------------------------------------------------

func (s *TaskService) readCache(ctx context.Context) ([]model.Task, bool) {
	if s.redis == nil {
		return nil, false
	}
	rctx, cancel := context.WithTimeout(ctx, redisOpTimeout)
	defer cancel()

	raw, err := s.redis.Get(rctx, CacheKeyAllTasks).Bytes()
	if err != nil {
		if !errors.Is(err, redis.Nil) {
			slog.Warn("redis cache read failed; falling back to postgres", "error", err)
		}
		return nil, false
	}

	var tasks []model.Task
	if err := json.Unmarshal(raw, &tasks); err != nil {
		slog.Warn("corrupt tasks cache entry; ignoring", "error", err)
		return nil, false
	}
	return tasks, true
}

func (s *TaskService) writeCache(ctx context.Context, tasks []model.Task) {
	if s.redis == nil {
		return
	}
	payload, err := json.Marshal(tasks)
	if err != nil {
		slog.Warn("failed to marshal tasks for cache", "error", err)
		return
	}
	rctx, cancel := context.WithTimeout(ctx, redisOpTimeout)
	defer cancel()
	if err := s.redis.Set(rctx, CacheKeyAllTasks, payload, CacheTTL).Err(); err != nil {
		slog.Warn("redis cache write failed", "error", err)
	}
}

func (s *TaskService) invalidateCache(ctx context.Context) {
	if s.redis == nil {
		return
	}
	// Detached so a client disconnect right after a successful write can't skip invalidation.
	rctx, cancel := context.WithTimeout(context.WithoutCancel(ctx), redisOpTimeout)
	defer cancel()
	if err := s.redis.Del(rctx, CacheKeyAllTasks).Err(); err != nil {
		slog.Warn("redis cache invalidation failed; entry will expire via TTL", "error", err)
	}
}

func (s *TaskService) enqueueAIJob(ctx context.Context, task model.Task) error {
	if s.redis == nil {
		return errors.New("redis client not configured")
	}

	tags := task.Tags
	if tags == nil {
		tags = []string{}
	}
	tagsJSON, err := json.Marshal(tags)
	if err != nil {
		return fmt.Errorf("marshal tags: %w", err)
	}

	rctx, cancel := context.WithTimeout(context.WithoutCancel(ctx), 2*time.Second)
	defer cancel()

	// XADD taskflow:ai_jobs * task_id <id> title <title> description <desc> tags <json_tags>
	msgID, err := s.redis.XAdd(rctx, &redis.XAddArgs{
		Stream: AIJobsStream,
		ID:     "*",
		Values: []any{
			"task_id", task.ID,
			"title", task.Title,
			"description", task.Description,
			"tags", string(tagsJSON),
		},
	}).Result()
	if err != nil {
		return fmt.Errorf("xadd %s: %w", AIJobsStream, err)
	}

	slog.Info("AI job enqueued", "task_id", task.ID, "stream_id", msgID)
	return nil
}

// ---------------------------------------------------------------------------
// Validation helpers
// ---------------------------------------------------------------------------

func cleanTags(tags []string) []string {
	cleaned := make([]string, 0, len(tags))
	seen := make(map[string]struct{}, len(tags))
	for _, tag := range tags {
		t := strings.TrimSpace(tag)
		if t == "" {
			continue
		}
		if _, dup := seen[t]; dup {
			continue
		}
		seen[t] = struct{}{}
		cleaned = append(cleaned, t)
	}
	return cleaned
}

func isValidTaskStatus(status model.TaskStatus) bool {
	switch status {
	case model.StatusTodo, model.StatusInProgress, model.StatusDone:
		return true
	default:
		return false
	}
}
