package handler

import (
	"crypto/subtle"
	"encoding/json"
	"errors"
	"log/slog"
	"net/http"

	"github.com/AIlord1501/taskflow/backend-go/internal/model"
	"github.com/AIlord1501/taskflow/backend-go/internal/service"
)

// InternalSecretHeader authenticates service-to-service callbacks from the AI worker pool.
const InternalSecretHeader = "X-Internal-Secret"

type TaskHandler struct {
	svc            *service.TaskService
	internalSecret []byte
}

func NewTaskHandler(svc *service.TaskService, internalSecret string) *TaskHandler {
	return &TaskHandler{svc: svc, internalSecret: []byte(internalSecret)}
}

// RegisterRoutes attaches all task endpoints to the Go 1.22+ ServeMux.
func (h *TaskHandler) RegisterRoutes(mux *http.ServeMux) {
	mux.HandleFunc("POST /api/v1/tasks", h.CreateTask)
	mux.HandleFunc("GET /api/v1/tasks", h.ListTasks)
	mux.HandleFunc("PATCH /api/v1/tasks/{id}/status", h.UpdateTaskStatus)
	mux.HandleFunc("DELETE /api/v1/tasks/{id}", h.DeleteTask)

	// Internal: AI worker -> Go callback (never expose without the shared secret).
	mux.Handle("PATCH /api/v1/internal/tasks/{id}/ai", h.requireInternalSecret(http.HandlerFunc(h.UpdateTaskAI)))
}

// requireInternalSecret rejects requests lacking a matching X-Internal-Secret.
// If INTERNAL_SECRET is unset the endpoint is disabled entirely (fail closed).
func (h *TaskHandler) requireInternalSecret(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if len(h.internalSecret) == 0 {
			writeError(w, http.StatusServiceUnavailable, "internal endpoint disabled: INTERNAL_SECRET not configured")
			return
		}
		provided := []byte(r.Header.Get(InternalSecretHeader))
		if subtle.ConstantTimeCompare(provided, h.internalSecret) != 1 {
			writeError(w, http.StatusUnauthorized, "invalid internal secret")
			return
		}
		next.ServeHTTP(w, r)
	})
}

func (h *TaskHandler) UpdateTaskAI(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	r.Body = http.MaxBytesReader(w, r.Body, 1<<20)

	var payload struct {
		AISummary     string   `json:"ai_summary"`
		SuggestedTags []string `json:"suggested_tags"`
	}
	if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
		writeError(w, http.StatusBadRequest, "invalid JSON payload: "+err.Error())
		return
	}

	if err := h.svc.UpdateAIEnrichment(r.Context(), id, payload.AISummary, payload.SuggestedTags); err != nil {
		switch {
		case errors.Is(err, service.ErrInvalidInput):
			writeError(w, http.StatusBadRequest, "task id and non-empty ai_summary are required")
		case errors.Is(err, service.ErrTaskNotFound):
			writeError(w, http.StatusNotFound, "task not found")
		default:
			slog.Error("failed to persist AI enrichment", "task_id", id, "error", err)
			writeError(w, http.StatusInternalServerError, "internal server error")
		}
		return
	}

	w.WriteHeader(http.StatusNoContent)
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
