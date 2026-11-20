# TaskFlow

A full-stack, AI-enriched developer task & Kanban workspace built with **Go**, **FastAPI**, **PostgreSQL**, and **React + Tailwind CSS v4** in a monochrome obsidian aesthetic.

## Architecture

```mermaid
flowchart LR
    UI["React + Vite Dashboard<br/>(web-app · :5173)"] -->|REST + CORS| API["Go Core API<br/>(backend-go · :8080)"]
    API -->|pgxpool| DB[("PostgreSQL 16<br/>(Docker · :5433)")]
    API -.->|Async goroutine POST /api/v1/analyze| AI["FastAPI AI Worker<br/>(ai-worker · :8001)"]
    AI -.->|ai_summary + suggested_tags| API
```

### Services
- **`backend-go/`** — Standard-library `net/http` (Go 1.22+ routing) REST API structured in a clean `handler -> service -> repository` architecture with `pgxpool`, structured `slog` JSON logging, CORS middleware, graceful shutdown, and an async goroutine pipeline (`context.WithoutCancel`) that enriches newly created tasks via the AI worker.
- **`ai-worker/`** — Python **FastAPI** microservice (`POST /api/v1/analyze`) that generates concise task summaries, extracts domain `#tags`, and computes priority hints.
- **`web-app/`** — **React 19 + TypeScript + Vite + Tailwind CSS v4** Kanban dashboard featuring an obsidian `#09090B` / `#121215` developer theme, `Ctrl+K` instant search, `C` quick-create modal, slide-over task detail drawer, dynamic `#tag` filtering, automatic 3-second polling while AI summaries are pending, and a built-in **Design Preview Mode** fallback when the Go API is offline.

---

## Project Structure

```text
taskflow/
├── backend-go/
│   ├── cmd/api/main.go                      # Server bootstrap, CORS & slog middleware, graceful shutdown
│   ├── internal/handler/task_handler.go     # HTTP handlers (GET, POST, PATCH status, DELETE)
│   ├── internal/service/task_service.go     # Business validation & async AI enrichment goroutine
│   ├── internal/repository/task_repo.go     # PostgreSQL queries via pgxpool
│   ├── internal/model/task.go               # Domain models & DTOs
│   └── migrations/000001_create_tasks.up.sql
├── ai-worker/
│   └── main.py                              # FastAPI summarization & tag extraction service
├── web-app/
│   └── src/
│       ├── api/taskClient.ts                # REST client + Design Preview Mode fallback
│       ├── components/                      # Navbar, Sidebar, TaskCard, CreateTaskModal, TaskDetailDrawer
│       ├── types/task.ts                    # Shared TypeScript interfaces
│       └── App.tsx                          # 3-column Kanban board & 3s AI polling
└── docker-compose.yml                       # PostgreSQL 16 container (port 5433)
```

---

## Quick Start

### 1. Start PostgreSQL & Apply Migration
```bash
docker compose up -d
```

Apply the initial schema migration:
```bash
docker exec -i taskflow-db psql -U taskflow -d taskflow < backend-go/migrations/000001_create_tasks.up.sql
```

### 2. Start the FastAPI AI Worker (`:8001`)
```bash
cd ai-worker
python -m venv .venv
# Windows: .venv\Scripts\activate  |  macOS/Linux: source .venv/bin/activate
pip install fastapi uvicorn pydantic
uvicorn main:app --host 0.0.0.0 --port 8001 --reload
```

### 3. Start the Go Core API (`:8080`)
```bash
cd backend-go
go run ./cmd/api
```

### 4. Start the React Web Dashboard (`:5173`)
```bash
cd web-app
npm install
npm run dev
```

Open **http://localhost:5173** in your browser. The top bar displays **Connected to Go API** when `:8080` is reachable, or **Design Preview Mode** with pre-populated mock tasks if running standalone.

---

## API Reference

### Go Core API (`http://localhost:8080/api/v1`)

| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `GET` | `/api/v1/health` | Service health check |
| `GET` | `/api/v1/tasks` | List all tasks ordered by `created_at DESC` |
| `POST` | `/api/v1/tasks` | Create a task (`title`, `description`, `tags`) and trigger async AI enrichment |
| `PATCH` | `/api/v1/tasks/{id}/status` | Update task status (`todo`, `in_progress`, `done`) |
| `DELETE` | `/api/v1/tasks/{id}` | Delete a task by UUID (`204 No Content`) |

### FastAPI AI Worker (`http://localhost:8001/api/v1`)

| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `GET` | `/api/v1/health` | Worker health check |
| `POST` | `/api/v1/analyze` | Analyze task title/description and return `ai_summary`, `suggested_tags`, and `priority_hint` |

---

## Environment Variables (`backend-go`)

| Variable | Default | Description |
| :--- | :--- | :--- |
| `PORT` | `8080` | HTTP server port |
| `DATABASE_URL` | `postgres://taskflow:taskflowpassword@127.0.0.1:5433/taskflow?sslmode=disable` | PostgreSQL connection string |
| `AI_WORKER_URL` | `http://localhost:8001/api/v1/analyze` | FastAPI AI worker analyze endpoint |

---

## Keyboard Shortcuts (`web-app`)

- `Ctrl + K` / `Cmd + K` — Focus instant search
- `C` — Open Create Task modal
- `Ctrl + Enter` / `Cmd + Enter` — Submit Create Task modal
- `Esc` — Close modal, detail drawer, or clear search
