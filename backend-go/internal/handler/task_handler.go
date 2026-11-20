package handler

import (
	"encoding/json"
	"errors"
	"log/slog"
	"net/http"

	"github.com/AIlord1501/taskflow/backend-go/internal/model"
	"github.com/AIlord1501/taskflow/backend-go/internal/service"
)

type TaskHandler struct {
	svc *service.TaskService
}

func NewTaskHandler(svc *service.TaskService) *TaskHandler {
	return &TaskHandler{svc: svc}
}

// RegisterRoutes attaches all task endpoints to the Go 1.22+ ServeMux.
func (h *TaskHandler) RegisterRoutes(mux *http.ServeMux) {
	mux.HandleFunc("POST /api/v1/tasks", h.CreateTask)
	mux.HandleFunc("GET /api/v1/tasks", h.ListTasks)
	mux.HandleFunc("PATCH /api/v1/tasks/{id}/status", h.UpdateTaskStatus)
	mux.HandleFunc("DELETE /api/v1/tasks/{id}", h.DeleteTask)
}

func (h *TaskHandler) CreateTask(w http.ResponseWriter, r *http.Request) {
	// Security best practice: Limit incoming request bodies to 1 MB
	r.Body = http.MaxBytesReader(w, r.Body, 1<<20)

	var input model.CreateTaskInput
	decoder := json.NewDecoder(r.Body)
	decoder.DisallowUnknownFields() // Reject typos in JSON keys strictly

	if err := decoder.Decode(&input); err != nil {
		writeError(w, http.StatusBadRequest, "invalid JSON payload: "+err.Error())
		return
	}

	task, err := h.svc.CreateTask(r.Context(), input)
	if err != nil {
		if errors.Is(err, service.ErrInvalidInput) {
			writeError(w, http.StatusBadRequest, "title is required and must be under 255 characters")
			return
		}
		slog.Error("failed to create task", "error", err)
		writeError(w, http.StatusInternalServerError, "internal server error")
		return
	}

	writeJSON(w, http.StatusCreated, task)
}

func (h *TaskHandler) ListTasks(w http.ResponseWriter, r *http.Request) {
	tasks, err := h.svc.GetAllTasks(r.Context())
	if err != nil {
		slog.Error("failed to list tasks", "error", err)
		writeError(w, http.StatusInternalServerError, "internal server error")
		return
	}

	writeJSON(w, http.StatusOK, map[string]any{
		"tasks": tasks,
		"count": len(tasks),
	})
}

func (h *TaskHandler) UpdateTaskStatus(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	r.Body = http.MaxBytesReader(w, r.Body, 1<<20)

	var payload struct {
		Status model.TaskStatus `json:"status"`
	}
	decoder := json.NewDecoder(r.Body)
	decoder.DisallowUnknownFields()

	if err := decoder.Decode(&payload); err != nil {
		writeError(w, http.StatusBadRequest, "invalid JSON payload: "+err.Error())
		return
	}

	task, err := h.svc.UpdateStatus(r.Context(), id, payload.Status)
	if err != nil {
		if errors.Is(err, service.ErrInvalidInput) {
			writeError(w, http.StatusBadRequest, "status must be one of: todo, in_progress, done")
			return
		}
		if errors.Is(err, service.ErrTaskNotFound) {
			writeError(w, http.StatusNotFound, "task not found")
			return
		}
		slog.Error("failed to update task status", "task_id", id, "error", err)
		writeError(w, http.StatusInternalServerError, "internal server error")
		return
	}

	writeJSON(w, http.StatusOK, task)
}

func (h *TaskHandler) DeleteTask(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")

	if err := h.svc.Delete(r.Context(), id); err != nil {
		if errors.Is(err, service.ErrInvalidInput) {
			writeError(w, http.StatusBadRequest, "task id is required")
			return
		}
		if errors.Is(err, service.ErrTaskNotFound) {
			writeError(w, http.StatusNotFound, "task not found")
			return
		}
		slog.Error("failed to delete task", "task_id", id, "error", err)
		writeError(w, http.StatusInternalServerError, "internal server error")
		return
	}

	w.WriteHeader(http.StatusNoContent)
}

func writeJSON(w http.ResponseWriter, status int, data any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	if err := json.NewEncoder(w).Encode(data); err != nil {
		slog.Error("failed to encode JSON response", "error", err)
	}
}

func writeError(w http.ResponseWriter, status int, message string) {
	writeJSON(w, status, map[string]string{"error": message})
}
