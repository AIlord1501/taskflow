import type { ApiConnectionMode, CreateTaskInput, Task, TaskStatus } from '../types/task';

const API_BASE_URL = 'http://localhost:8080/api/v1';
const REQUEST_TIMEOUT_MS = 2500;

export interface TaskListResult {
  tasks: Task[];
  mode: ApiConnectionMode;
}

export interface TaskMutationResult {
  task: Task;
  mode: ApiConnectionMode;
}

const minutesAgo = (mins: number): string =>
  new Date(Date.now() - mins * 60_000).toISOString();

const hoursAgo = (hrs: number): string =>
  new Date(Date.now() - hrs * 3_600_000).toISOString();

const INITIAL_MOCK_TASKS: Task[] = [
  {
    id: 'tsk-9f4a21c0',
    title: 'Add CORS & PATCH /api/v1/tasks/:id handler in Go API',
    description:
      'Expose CORS middleware for local Vite dev origins and implement PATCH status updates plus DELETE endpoints in backend-go/internal/handler/task_handler.go with strict JSON validation.',
    status: 'todo',
    ai_summary:
      'Unblocks browser mutations by adding CORS headers and wiring PATCH/DELETE task routes in the Go HTTP handler.',
    tags: ['golang', 'backend', 'high-priority'],
    created_at: minutesAgo(18),
    updated_at: minutesAgo(18),
  },
  {
    id: 'tsk-7b2e88d4',
    title: 'Benchmark pgxpool connection saturation under burst load',
    description:
      'Run k6 load tests against PostgreSQL 16 with 250 concurrent virtual users creating and listing tasks. Capture p99 query latency and tune MaxConns / MaxConnIdleTime.',
    status: 'todo',
    ai_summary: null,
    tags: ['postgres', 'performance', 'backend'],
    created_at: minutesAgo(4),
    updated_at: minutesAgo(4),
  },
  {
    id: 'tsk-3c1d90a7',
    title: 'Implement async Gemini AI summarization worker queue',
    description:
      'Poll tasks where ai_summary IS NULL using SELECT ... FOR UPDATE SKIP LOCKED, invoke Gemini 2.5 Flash to synthesize a 1-sentence engineering summary, and persist atomically.',
    status: 'in_progress',
    ai_summary:
      'Builds a lock-safe background worker that enriches newly created tasks with concise Gemini-generated summaries.',
    tags: ['ai-worker', 'high-priority', 'python'],
    created_at: hoursAgo(3),
    updated_at: minutesAgo(42),
  },
  {
    id: 'tsk-5e8b44f1',
    title: 'Wire keyboard-first command palette & Kanban shortcuts',
    description:
      'Support Ctrl+K instant search focusing, C to open the task creation modal, and Escape to dismiss drawers/modals across the obsidian TaskFlow dashboard.',
    status: 'in_progress',
    ai_summary:
      'Adds Linear-style keyboard navigation (Ctrl+K search, quick create, Escape dismiss) to speed up developer triage.',
    tags: ['frontend', 'ux'],
    created_at: hoursAgo(6),
    updated_at: hoursAgo(1),
  },
  {
    id: 'tsk-1a6c33e9',
    title: 'Configure structured slog JSON logging & graceful shutdown',
    description:
      'Replace default net/http logs with structured JSON slog middleware recording method, path, and latency_ms, and drain active connections on SIGINT/SIGTERM.',
    status: 'done',
    ai_summary:
      'Production-hardened the Go API with structured request latency telemetry and clean 10-second signal shutdown.',
    tags: ['golang', 'observability'],
    created_at: hoursAgo(19),
    updated_at: hoursAgo(5),
  },
  {
    id: 'tsk-8d0f12b6',
    title: 'Author initial PostgreSQL tasks schema migration',
    description:
      'Create 000001_create_tasks.up.sql with UUID primary keys, task status enum constraint, nullable ai_summary text column, and GIN-indexed text[] tags.',
    status: 'done',
    ai_summary:
      'Established the core PostgreSQL tasks table with tag indexing and nullable AI summary storage.',
    tags: ['postgres', 'devops'],
    created_at: hoursAgo(30),
    updated_at: hoursAgo(14),
  },
];

let mockStore: Task[] = INITIAL_MOCK_TASKS.map((t) => ({ ...t, tags: [...t.tags] }));
let currentMode: ApiConnectionMode = 'live';

function normalizeTask(raw: Partial<Task> & { id?: string; title?: string }): Task {
  const now = new Date().toISOString();
  const validStatus: TaskStatus =
    raw.status === 'todo' || raw.status === 'in_progress' || raw.status === 'done'
      ? raw.status
      : 'todo';

  return {
    id: raw.id ?? `tsk-${crypto.randomUUID().slice(0, 8)}`,
    title: raw.title ?? 'Untitled task',
    description: raw.description ?? '',
    status: validStatus,
    ai_summary: typeof raw.ai_summary === 'string' && raw.ai_summary.trim().length > 0 ? raw.ai_summary : null,
    tags: Array.isArray(raw.tags)
      ? raw.tags.map((tag) => String(tag).trim().toLowerCase()).filter(Boolean)
      : [],
    created_at: raw.created_at ?? now,
    updated_at: raw.updated_at ?? now,
  };
}

function buildMockSummary(title: string, description: string): string {
  const trimmedDesc = description.trim();
  if (trimmedDesc.length > 0) {
    const firstClause = trimmedDesc.split(/[.!?]/)[0]?.trim() ?? trimmedDesc;
    const clipped = firstClause.length > 110 ? `${firstClause.slice(0, 107)}...` : firstClause;
    return `Actionable scope: ${clipped}.`;
  }
  return `Queued engineering work item focused on "${title.trim()}".`;
}

async function fetchWithTimeout(url: string, init: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    window.clearTimeout(timer);
  }
}

export function getConnectionMode(): ApiConnectionMode {
  return currentMode;
}

export async function listTasks(): Promise<TaskListResult> {
  try {
    const res = await fetchWithTimeout(`${API_BASE_URL}/tasks`, {
      method: 'GET',
      headers: { Accept: 'application/json' },
    });

    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`);
    }

    const payload: unknown = await res.json();
    const rawList: Array<Partial<Task>> = Array.isArray(payload)
      ? payload
      : typeof payload === 'object' &&
          payload !== null &&
          'tasks' in payload &&
          Array.isArray((payload as { tasks: unknown }).tasks)
        ? (payload as { tasks: Array<Partial<Task>> }).tasks
        : [];

    currentMode = 'live';
    return {
      tasks: rawList.map(normalizeTask),
      mode: 'live',
    };
  } catch {
    currentMode = 'mock';
    return {
      tasks: mockStore.map((t) => ({ ...t, tags: [...t.tags] })),
      mode: 'mock',
    };
  }
}

export async function createTask(input: CreateTaskInput): Promise<TaskMutationResult> {
  const cleanPayload: CreateTaskInput = {
    title: input.title.trim(),
    description: input.description.trim(),
    tags: input.tags.map((t) => t.trim().toLowerCase()).filter(Boolean),
  };

  try {
    const res = await fetchWithTimeout(`${API_BASE_URL}/tasks`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify(cleanPayload),
    });

    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`);
    }

    const data = (await res.json()) as Partial<Task>;
    currentMode = 'live';
    return {
      task: normalizeTask(data),
      mode: 'live',
    };
  } catch {
    currentMode = 'mock';
    const now = new Date().toISOString();
    const newTask: Task = {
      id: `tsk-${Math.random().toString(16).slice(2, 10)}`,
      title: cleanPayload.title,
      description: cleanPayload.description,
      status: 'todo',
      ai_summary: null,
      tags: cleanPayload.tags,
      created_at: now,
      updated_at: now,
    };
    mockStore = [newTask, ...mockStore];

    // Simulate async AI worker enrichment so 3s polling updates the card in Design Preview Mode
    const targetId = newTask.id;
    window.setTimeout(() => {
      mockStore = mockStore.map((item) =>
        item.id === targetId && item.ai_summary === null
          ? {
              ...item,
              ai_summary: buildMockSummary(item.title, item.description),
              updated_at: new Date().toISOString(),
            }
          : item,
      );
    }, 4500);

    return {
      task: { ...newTask, tags: [...newTask.tags] },
      mode: 'mock',
    };
  }
}

export async function updateTaskStatus(
  id: string,
  status: TaskStatus,
): Promise<{ mode: ApiConnectionMode; updated?: Task }> {
  if (currentMode === 'live') {
    try {
      const res = await fetchWithTimeout(`${API_BASE_URL}/tasks/${encodeURIComponent(id)}/status`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({ status }),
      });

      if (res.ok) {
        const data = (await res.json()) as Partial<Task>;
        return { mode: 'live', updated: normalizeTask(data) };
      }

      // If Go backend hasn't implemented PATCH yet (404/405), stay in live mode and allow optimistic UI update
      if (res.status === 404 || res.status === 405) {
        return { mode: 'live' };
      }
      throw new Error(`HTTP ${res.status}`);
    } catch {
      currentMode = 'mock';
    }
  }

  const now = new Date().toISOString();
  let updatedTask: Task | undefined;
  mockStore = mockStore.map((task) => {
    if (task.id !== id) return task;
    updatedTask = { ...task, status, updated_at: now };
    return updatedTask;
  });

  return {
    mode: currentMode,
    updated: updatedTask ? { ...updatedTask, tags: [...updatedTask.tags] } : undefined,
  };
}

export async function deleteTask(id: string): Promise<{ mode: ApiConnectionMode }> {
  if (currentMode === 'live') {
    try {
      const res = await fetchWithTimeout(`${API_BASE_URL}/tasks/${encodeURIComponent(id)}`, {
        method: 'DELETE',
        headers: { Accept: 'application/json' },
      });

      if (res.ok || res.status === 204 || res.status === 404 || res.status === 405) {
        return { mode: 'live' };
      }
      throw new Error(`HTTP ${res.status}`);
    } catch {
      currentMode = 'mock';
    }
  }

  mockStore = mockStore.filter((task) => task.id !== id);
  return { mode: currentMode };
}
