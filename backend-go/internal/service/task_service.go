package service

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"log/slog"
	"net/http"
	"os"
	"strings"
	"time"

	"github.com/AIlord1501/taskflow/backend-go/internal/model"
	"github.com/AIlord1501/taskflow/backend-go/internal/repository"
)

const defaultAIWorkerAnalyzeURL = "http://localhost:8001/api/v1/analyze"

// Sentinel errors allow the HTTP layer to map domain failures to exact HTTP status codes.
var (
	ErrInvalidInput = errors.New("invalid task input")
	ErrTaskNotFound = repository.ErrTaskNotFound
)

type aiAnalyzeRequest struct {
	TaskID       string   `json:"task_id"`
	Title        string   `json:"title"`
	Description  string   `json:"description"`
	ExistingTags []string `json:"existing_tags"`
}

type aiAnalyzeResponse struct {
	TaskID        string   `json:"task_id"`
	AISummary     string   `json:"ai_summary"`
	SuggestedTags []string `json:"suggested_tags"`
	PriorityHint  string   `json:"priority_hint"`
}

type TaskService struct {
	repo        repository.TaskRepository
	aiWorkerURL string
	httpClient  *http.Client
}

func NewTaskService(repo repository.TaskRepository) *TaskService {
	aiURL := strings.TrimSpace(os.Getenv("AI_WORKER_URL"))
	if aiURL == "" {
		aiURL = defaultAIWorkerAnalyzeURL
	}

	return &TaskService{
		repo:        repo,
		aiWorkerURL: aiURL,
		httpClient: &http.Client{
			Timeout: 10 * time.Second,
		},
	}
}

func (s *TaskService) CreateTask(ctx context.Context, input model.CreateTaskInput) (model.Task, error) {
	// Business rule 1: Normalize and validate title
	input.Title = strings.TrimSpace(input.Title)
	if input.Title == "" {
		return model.Task{}, ErrInvalidInput
	}
	if len(input.Title) > 255 {
		return model.Task{}, ErrInvalidInput
	}

	input.Description = strings.TrimSpace(input.Description)

	// Business rule 2: Clean up tags (remove blank strings)
	cleanedTags := make([]string, 0, len(input.Tags))
	for _, tag := range input.Tags {
		t := strings.TrimSpace(tag)
		if t != "" {
			cleanedTags = append(cleanedTags, t)
		}
	}
	input.Tags = cleanedTags

	task, err := s.repo.Create(ctx, input)
	if err != nil {
		return model.Task{}, err
	}

	// Launch async AI enrichment decoupled from the HTTP request cancellation.
	bgCtx := context.WithoutCancel(ctx)
	go s.enrichTaskWithAI(bgCtx, task)

	return task, nil
}

func (s *TaskService) GetAllTasks(ctx context.Context) ([]model.Task, error) {
	return s.repo.ListAll(ctx)
}

func (s *TaskService) UpdateStatus(ctx context.Context, id string, status model.TaskStatus) (model.Task, error) {
	id = strings.TrimSpace(id)
	if id == "" || !isValidTaskStatus(status) {
		return model.Task{}, ErrInvalidInput
	}
	return s.repo.UpdateStatus(ctx, id, status)
}

func (s *TaskService) Delete(ctx context.Context, id string) error {
	id = strings.TrimSpace(id)
	if id == "" {
		return ErrInvalidInput
	}
	return s.repo.Delete(ctx, id)
}

func (s *TaskService) enrichTaskWithAI(ctx context.Context, task model.Task) {
	enrichCtx, cancel := context.WithTimeout(ctx, 10*time.Second)
	defer cancel()

	existingTags := task.Tags
	if existingTags == nil {
		existingTags = []string{}
	}

	reqBody, err := json.Marshal(aiAnalyzeRequest{
		TaskID:       task.ID,
		Title:        task.Title,
		Description:  task.Description,
		ExistingTags: existingTags,
	})
	if err != nil {
		slog.Error("failed to marshal AI analyze request", "task_id", task.ID, "error", err)
		return
	}

	req, err := http.NewRequestWithContext(enrichCtx, http.MethodPost, s.aiWorkerURL, bytes.NewReader(reqBody))
	if err != nil {
		slog.Error("failed to construct AI analyze HTTP request", "task_id", task.ID, "error", err)
		return
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Accept", "application/json")

	resp, err := s.httpClient.Do(req)
	if err != nil {
		slog.Warn("AI worker request failed", "task_id", task.ID, "url", s.aiWorkerURL, "error", err)
		return
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		slog.Warn("AI worker returned non-200 status", "task_id", task.ID, "status_code", resp.StatusCode)
		return
	}

	var aiResp aiAnalyzeResponse
	if err := json.NewDecoder(resp.Body).Decode(&aiResp); err != nil {
		slog.Error("failed to decode AI worker response", "task_id", task.ID, "error", err)
		return
	}

	if err := s.repo.UpdateAIEnrichment(enrichCtx, task.ID, aiResp.AISummary, aiResp.SuggestedTags); err != nil {
		slog.Error("failed to persist AI enrichment", "task_id", task.ID, "error", err)
		return
	}

	slog.Info("task enriched with AI summary",
		"task_id", task.ID,
		"priority_hint", aiResp.PriorityHint,
		"tag_count", len(aiResp.SuggestedTags),
	)
}

func isValidTaskStatus(status model.TaskStatus) bool {
	switch status {
	case model.StatusTodo, model.StatusInProgress, model.StatusDone:
		return true
	default:
		return false
	}
}
