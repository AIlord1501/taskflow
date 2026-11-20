package model

import "time"

type TaskStatus string

const (
StatusTodo       TaskStatus = "todo"
StatusInProgress TaskStatus = "in_progress"
StatusDone       TaskStatus = "done"
)

type Task struct {
ID          string     `json:"id"`
Title       string     `json:"title"`
Description string     `json:"description"`
Status      TaskStatus `json:"status"`
AISummary   *string    `json:"ai_summary,omitempty"`
Tags        []string   `json:"tags"`
CreatedAt   time.Time  `json:"created_at"`
UpdatedAt   time.Time  `json:"updated_at"`
}

type CreateTaskInput struct {
Title       string   `json:"title"`
Description string   `json:"description"`
Tags        []string `json:"tags"`
}
