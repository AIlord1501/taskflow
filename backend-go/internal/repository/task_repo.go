package repository

import (
	"context"
	"errors"
	"fmt"

	"github.com/AIlord1501/taskflow/backend-go/internal/model"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

var ErrTaskNotFound = errors.New("task not found")

type TaskRepository interface {
	Create(ctx context.Context, input model.CreateTaskInput) (model.Task, error)
	ListAll(ctx context.Context) ([]model.Task, error)
	UpdateStatus(ctx context.Context, id string, status model.TaskStatus) (model.Task, error)
	Delete(ctx context.Context, id string) error
	UpdateAIEnrichment(ctx context.Context, id string, summary string, tags []string) error
}

type PostgresTaskRepo struct {
	db *pgxpool.Pool
}

func NewPostgresTaskRepo(db *pgxpool.Pool) *PostgresTaskRepo {
	return &PostgresTaskRepo{db: db}
}

func (r *PostgresTaskRepo) Create(ctx context.Context, input model.CreateTaskInput) (model.Task, error) {
	tags := input.Tags
	if tags == nil {
		tags = []string{}
	}

	query := `
		INSERT INTO tasks (title, description, tags)
		VALUES ($1, $2, $3)
		RETURNING id, title, description, status, ai_summary, tags, created_at, updated_at
	`

	var t model.Task
	err := r.db.QueryRow(ctx, query, input.Title, input.Description, tags).Scan(
		&t.ID, &t.Title, &t.Description, &t.Status,
		&t.AISummary, &t.Tags, &t.CreatedAt, &t.UpdatedAt,
	)
	if err != nil {
		return model.Task{}, fmt.Errorf("insert task: %w", err)
	}
	return t, nil
}

func (r *PostgresTaskRepo) ListAll(ctx context.Context) ([]model.Task, error) {
	query := `
		SELECT id, title, description, status, ai_summary, tags, created_at, updated_at
		FROM tasks
		ORDER BY created_at DESC
	`

	rows, err := r.db.Query(ctx, query)
	if err != nil {
		return nil, fmt.Errorf("query tasks: %w", err)
	}
	defer rows.Close()

	tasks := make([]model.Task, 0)
	for rows.Next() {
		var t model.Task
		if err := rows.Scan(
			&t.ID, &t.Title, &t.Description, &t.Status,
			&t.AISummary, &t.Tags, &t.CreatedAt, &t.UpdatedAt,
		); err != nil {
			return nil, fmt.Errorf("scan task row: %w", err)
		}
		tasks = append(tasks, t)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iterate task rows: %w", err)
	}
	return tasks, nil
}

func (r *PostgresTaskRepo) UpdateStatus(ctx context.Context, id string, status model.TaskStatus) (model.Task, error) {
	query := `
		UPDATE tasks
		SET status = $1, updated_at = NOW()
		WHERE id = $2
		RETURNING id, title, description, status, ai_summary, tags, created_at, updated_at
	`

	var t model.Task
	err := r.db.QueryRow(ctx, query, status, id).Scan(
		&t.ID, &t.Title, &t.Description, &t.Status,
		&t.AISummary, &t.Tags, &t.CreatedAt, &t.UpdatedAt,
	)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return model.Task{}, ErrTaskNotFound
		}
		return model.Task{}, fmt.Errorf("update task status: %w", err)
	}
	return t, nil
}

func (r *PostgresTaskRepo) Delete(ctx context.Context, id string) error {
	query := `DELETE FROM tasks WHERE id = $1`

	cmdTag, err := r.db.Exec(ctx, query, id)
	if err != nil {
		return fmt.Errorf("delete task: %w", err)
	}
	if cmdTag.RowsAffected() == 0 {
		return ErrTaskNotFound
	}
	return nil
}

func (r *PostgresTaskRepo) UpdateAIEnrichment(ctx context.Context, id string, summary string, tags []string) error {
	if tags == nil {
		tags = []string{}
	}

	query := `
		UPDATE tasks
		SET ai_summary = $1, tags = $2, updated_at = NOW()
		WHERE id = $3
	`

	cmdTag, err := r.db.Exec(ctx, query, summary, tags, id)
	if err != nil {
		return fmt.Errorf("update task ai enrichment: %w", err)
	}
	if cmdTag.RowsAffected() == 0 {
		return ErrTaskNotFound
	}
	return nil
}
