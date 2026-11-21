import AsyncStorage from '@react-native-async-storage/async-storage';
import type { ApiConnectionMode, CreateTaskInput, Task, TaskStatus } from '../types/task';

/** Android Emulator alias for the host machine's localhost. */
export const DEFAULT_BASE_URL = 'http://10.0.2.2:8080/api/v1';

const STORAGE_KEY = 'taskflow.apiBaseUrl';
const REQUEST_TIMEOUT_MS = 3000;

let baseUrl = DEFAULT_BASE_URL;
let currentMode: ApiConnectionMode = 'live';

// ---------------------------------------------------------------------------
// Base URL configuration
// ---------------------------------------------------------------------------

export function normalizeBaseUrl(raw: string): string {
  let url = raw.trim().replace(/\/+$/, '');
  if (!/^https?:\/\//i.test(url)) {
    url = `http://${url}`;
  }
  if (!/\/api\/v1$/i.test(url)) {
    url = `${url}/api/v1`;
  }
  return url;
}

export function getBaseUrl(): string {
  return baseUrl;
}

export async function loadBaseUrl(): Promise<string> {
  try {
    const stored = await AsyncStorage.getItem(STORAGE_KEY);
    if (stored) baseUrl = stored;
  } catch {
    // Storage unavailable — keep default.
  }
  return baseUrl;
}

export async function setBaseUrl(raw: string): Promise<string> {
  baseUrl = normalizeBaseUrl(raw);
  currentMode = 'live'; // re-probe the new host on next request
  try {
    await AsyncStorage.setItem(STORAGE_KEY, baseUrl);
  } catch {
    // Non-fatal: setting still applies for this session.
  }
  return baseUrl;
}

/** Pings GET /health on a candidate URL without changing the active config. */
export async function testConnection(raw: string): Promise<boolean> {
  try {
    const res = await fetchWithTimeout(`${normalizeBaseUrl(raw)}/health`, { method: 'GET' });
    return res.ok;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Mock data (Design Preview Mode)
// ---------------------------------------------------------------------------

const minutesAgo = (m: number) => new Date(Date.now() - m * 60_000).toISOString();
const hoursAgo = (h: number) => new Date(Date.now() - h * 3_600_000).toISOString();

let mockStore: Task[] = [
  {
    id: 'tsk-9f4a21c0',
    title: 'Ship Android build of TaskFlow via EAS',
    description:
      'Configure eas.json with a preview profile, generate a signed APK, and distribute it to internal testers for real-device validation.',
    status: 'todo',
    ai_summary: 'Produces a signed preview APK through EAS Build for internal Android testing.',
    tags: ['android', 'devops', 'high-priority'],
    created_at: minutesAgo(22),
    updated_at: minutesAgo(22),
  },
  {
    id: 'tsk-7b2e88d4',
    title: 'Benchmark pgxpool saturation under burst load',
    description:
      'Run k6 with 250 virtual users against create/list endpoints and tune MaxConns and MaxConnIdleTime.',
    status: 'todo',
    ai_summary: null,
    tags: ['postgres', 'performance'],
    created_at: minutesAgo(3),
    updated_at: minutesAgo(3),
  },
  {
    id: 'tsk-3c1d90a7',
    title: 'Async FastAPI enrichment goroutine',
    description:
      'On task creation, POST to the AI worker with a 10s timeout using context.WithoutCancel and persist ai_summary + suggested tags.',
    status: 'in_progress',
    ai_summary: 'Decouples AI enrichment from the request lifecycle via a bounded background goroutine.',
    tags: ['golang', 'ai-ml', 'backend'],
    created_at: hoursAgo(3),
    updated_at: minutesAgo(40),
  },
  {
    id: 'tsk-1a6c33e9',
    title: 'Structured slog logging & graceful shutdown',
    description:
      'JSON request logs with latency, and drain connections on SIGINT/SIGTERM within 10 seconds.',
    status: 'done',
    ai_summary: 'Hardened the Go API with structured telemetry and clean signal-driven shutdown.',
    tags: ['golang', 'observability'],
    created_at: hoursAgo(20),
    updated_at: hoursAgo(6),
  },
];

const cloneTask = (t: Task): Task => ({ ...t, tags: [...t.tags] });

function buildMockSummary(title: string, description: string): string {
  const first = description.trim().split(/[.!?]/)[0]?.trim();
  if (first) {
    return `Actionable scope: ${first.length > 110 ? `${first.slice(0, 107)}...` : first}.`;
  }
  return `Queued engineering work item focused on "${title.trim()}".`;
}

// ---------------------------------------------------------------------------
// HTTP helpers
// ---------------------------------------------------------------------------

async function fetchWithTimeout(url: string, init: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    return await fetch(url, {
      ...init,
      headers: { Accept: 'application/json', ...(init.headers ?? {}) },
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }
}

function normalizeTask(raw: Partial<Task>): Task {
  const now = new Date().toISOString();
  const status: TaskStatus =
    raw.status === 'in_progress' || raw.status === 'done' ? raw.status : 'todo';
  return {
    id: raw.id ?? `tsk-${Math.random().toString(16).slice(2, 10)}`,
    title: raw.title ?? 'Untitled task',
    description: raw.description ?? '',
    status,
    // Go omits ai_summary when nil (omitempty) — treat missing as null.
    ai_summary:
      typeof raw.ai_summary === 'string' && raw.ai_summary.trim() ? raw.ai_summary : null,
    tags: Array.isArray(raw.tags) ? raw.tags.map((t) => String(t).trim()).filter(Boolean) : [],
    created_at: raw.created_at ?? now,
    updated_at: raw.updated_at ?? now,
  };
}

export function getConnectionMode(): ApiConnectionMode {
  return currentMode;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export async function listTasks(): Promise<{ tasks: Task[]; mode: ApiConnectionMode }> {
  try {
    const res = await fetchWithTimeout(`${baseUrl}/tasks`, { method: 'GET' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    const payload: unknown = await res.json();
    const list: Partial<Task>[] = Array.isArray(payload)
      ? payload
      : Array.isArray((payload as { tasks?: unknown })?.tasks)
        ? (payload as { tasks: Partial<Task>[] }).tasks
        : [];

    currentMode = 'live';
    return { tasks: list.map(normalizeTask), mode: 'live' };
  } catch {
    currentMode = 'mock';
    return { tasks: mockStore.map(cloneTask), mode: 'mock' };
  }
}

export async function createTask(
  input: CreateTaskInput,
): Promise<{ task: Task; mode: ApiConnectionMode }> {
  const body: CreateTaskInput = {
    title: input.title.trim(),
    description: input.description.trim(),
    tags: input.tags.map((t) => t.trim().toLowerCase()).filter(Boolean),
  };

  try {
    const res = await fetchWithTimeout(`${baseUrl}/tasks`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    currentMode = 'live';
    return { task: normalizeTask((await res.json()) as Partial<Task>), mode: 'live' };
  } catch {
    currentMode = 'mock';
    const now = new Date().toISOString();
    const task: Task = {
      id: `tsk-${Math.random().toString(16).slice(2, 10)}`,
      ...body,
      status: 'todo',
      ai_summary: null,
      created_at: now,
      updated_at: now,
    };
    mockStore = [task, ...mockStore];

    // Simulate the async AI worker so polling visibly resolves the shimmer.
    setTimeout(() => {
      mockStore = mockStore.map((t) =>
        t.id === task.id && t.ai_summary === null
          ? { ...t, ai_summary: buildMockSummary(t.title, t.description), updated_at: new Date().toISOString() }
          : t,
      );
    }, 4500);

    return { task: cloneTask(task), mode: 'mock' };
  }
}

export async function updateTaskStatus(
  id: string,
  status: TaskStatus,
): Promise<{ task?: Task; mode: ApiConnectionMode }> {
  if (currentMode === 'live') {
    try {
      const res = await fetchWithTimeout(`${baseUrl}/tasks/${encodeURIComponent(id)}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      });
      if (res.ok) {
        return { task: normalizeTask((await res.json()) as Partial<Task>), mode: 'live' };
      }
      throw new Error(`HTTP ${res.status}`);
    } catch {
      currentMode = 'mock';
    }
  }

  let updated: Task | undefined;
  mockStore = mockStore.map((t) => {
    if (t.id !== id) return t;
    updated = { ...t, status, updated_at: new Date().toISOString() };
    return updated;
  });
  return { task: updated ? cloneTask(updated) : undefined, mode: currentMode };
}

export async function deleteTask(id: string): Promise<{ mode: ApiConnectionMode }> {
  if (currentMode === 'live') {
    try {
      const res = await fetchWithTimeout(`${baseUrl}/tasks/${encodeURIComponent(id)}`, {
        method: 'DELETE',
      });
      if (res.ok || res.status === 404) return { mode: 'live' };
      throw new Error(`HTTP ${res.status}`);
    } catch {
      currentMode = 'mock';
    }
  }

  mockStore = mockStore.filter((t) => t.id !== id);
  return { mode: currentMode };
}
