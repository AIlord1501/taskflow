export type TaskStatus = 'todo' | 'in_progress' | 'done';

export interface Task {
  id: string;
  title: string;
  description: string;
  status: TaskStatus;
  ai_summary: string | null;
  tags: string[];
  created_at: string;
  updated_at: string;
}

export interface CreateTaskInput {
  title: string;
  description: string;
  tags: string[];
}

export type ApiConnectionMode = 'live' | 'mock';

export type WorkspaceView = 'all' | 'ai_enriched' | 'high_priority';
