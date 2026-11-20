import {
  CheckCircle2,
  Circle,
  CircleDot,
  Plus,
  RefreshCw,
  Sparkles,
  X,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import {
  createTask,
  deleteTask,
  listTasks,
  updateTaskStatus,
} from './api/taskClient';
import { CreateTaskModal } from './components/CreateTaskModal';
import { Navbar } from './components/Navbar';
import { Sidebar } from './components/Sidebar';
import type { TagCount } from './components/Sidebar';
import { TaskCard } from './components/TaskCard';
import { TaskDetailDrawer } from './components/TaskDetailDrawer';
import type {
  ApiConnectionMode,
  CreateTaskInput,
  Task,
  TaskStatus,
  WorkspaceView,
} from './types/task';

const HIGH_PRIORITY_TAGS = new Set([
  'high-priority',
  'urgent',
  'critical',
  'p0',
  'p1',
]);

const KANBAN_COLUMNS: Array<{
  status: TaskStatus;
  title: string;
  icon: ReactNode;
}> = [
  {
    status: 'todo',
    title: 'To Do',
    icon: <Circle className="h-3.5 w-3.5 text-zinc-400" />,
  },
  {
    status: 'in_progress',
    title: 'In Progress',
    icon: <CircleDot className="h-3.5 w-3.5 text-indigo-400" />,
  },
  {
    status: 'done',
    title: 'Done',
    icon: <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />,
  },
];

const VIEW_LABELS: Record<WorkspaceView, string> = {
  all: 'All Tasks',
  ai_enriched: 'AI Enriched',
  high_priority: 'High Priority',
};

function isHighPriority(task: Task): boolean {
  return task.tags.some((tag) => HIGH_PRIORITY_TAGS.has(tag.toLowerCase()));
}

export default function App() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isCreating, setIsCreating] = useState(false);
  const [connectionMode, setConnectionMode] = useState<ApiConnectionMode>('mock');

  const [activeView, setActiveView] = useState<WorkspaceView>('all');
  const [selectedTag, setSelectedTag] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);

  const searchInputRef = useRef<HTMLInputElement | null>(null);

  const fetchTasks = useCallback(async () => {
    const result = await listTasks();
    setTasks(result.tasks);
    setConnectionMode(result.mode);
  }, []);

  // Initial load
  useEffect(() => {
    let cancelled = false;
    void listTasks().then((result) => {
      if (cancelled) return;
      setTasks(result.tasks);
      setConnectionMode(result.mode);
      setIsLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // Automatic 3-second polling when any task has ai_summary === null
  const pendingAiCount = useMemo(
    () => tasks.filter((t) => t.ai_summary === null).length,
    [tasks],
  );

  useEffect(() => {
    if (pendingAiCount === 0) return;

    const timer = window.setInterval(() => {
      void fetchTasks();
    }, 3000);

    return () => window.clearInterval(timer);
  }, [pendingAiCount, fetchTasks]);

  // Global keyboard shortcuts (Ctrl+K / Cmd+K for search, C for create)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        searchInputRef.current?.focus();
        searchInputRef.current?.select();
        return;
      }

      const target = e.target as HTMLElement | null;
      const isTyping =
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT' ||
          target.isContentEditable);

      if (
        !isTyping &&
        !e.ctrlKey &&
        !e.metaKey &&
        !e.altKey &&
        e.key.toLowerCase() === 'c' &&
        !isCreateModalOpen &&
        !selectedTaskId
      ) {
        e.preventDefault();
        setIsCreateModalOpen(true);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isCreateModalOpen, selectedTaskId]);

  const counts = useMemo(
    () => ({
      all: tasks.length,
      aiEnriched: tasks.filter((t) => t.ai_summary !== null).length,
      highPriority: tasks.filter(isHighPriority).length,
    }),
    [tasks],
  );

  const dynamicTags: TagCount[] = useMemo(() => {
    const freq = new Map<string, number>();
    for (const task of tasks) {
      for (const tag of task.tags) {
        freq.set(tag, (freq.get(tag) ?? 0) + 1);
      }
    }
    return Array.from(freq.entries())
      .map(([tag, count]) => ({ tag, count }))
      .sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag));
  }, [tasks]);

  const filteredTasks = useMemo(() => {
    const normalizedQuery = searchQuery.trim().toLowerCase();

    return tasks.filter((task) => {
      if (activeView === 'ai_enriched' && task.ai_summary === null) return false;
      if (activeView === 'high_priority' && !isHighPriority(task)) return false;
      if (selectedTag && !task.tags.includes(selectedTag)) return false;

      if (normalizedQuery) {
        const cleanQuery = normalizedQuery.replace(/^#/, '');
        const haystack = [
          task.id,
          task.title,
          task.description,
          task.ai_summary ?? '',
          ...task.tags,
        ]
          .join(' ')
          .toLowerCase();

        if (!haystack.includes(cleanQuery)) return false;
      }

      return true;
    });
  }, [tasks, activeView, selectedTag, searchQuery]);

  const tasksByStatus = useMemo(() => {
    const grouped: Record<TaskStatus, Task[]> = {
      todo: [],
      in_progress: [],
      done: [],
    };
    for (const task of filteredTasks) {
      grouped[task.status].push(task);
    }
    return grouped;
  }, [filteredTasks]);

  const selectedTask = useMemo(
    () => tasks.find((t) => t.id === selectedTaskId) ?? null,
    [tasks, selectedTaskId],
  );

  const handleCreateTask = useCallback(async (input: CreateTaskInput) => {
    setIsCreating(true);
    try {
      const result = await createTask(input);
      setConnectionMode(result.mode);
      setTasks((prev) => [result.task, ...prev]);
    } finally {
      setIsCreating(false);
    }
  }, []);

  const handleUpdateStatus = useCallback(
    async (id: string, nextStatus: TaskStatus) => {
      const now = new Date().toISOString();
      setTasks((prev) =>
        prev.map((task) =>
          task.id === id ? { ...task, status: nextStatus, updated_at: now } : task,
        ),
      );
      const result = await updateTaskStatus(id, nextStatus);
      setConnectionMode(result.mode);
      if (result.updated) {
        const updated = result.updated;
        setTasks((prev) =>
          prev.map((task) => (task.id === id ? updated : task)),
        );
      }
    },
    [],
  );

  const handleDeleteTask = useCallback(
    async (id: string) => {
      setTasks((prev) => prev.filter((task) => task.id !== id));
      if (selectedTaskId === id) {
        setSelectedTaskId(null);
      }
      const result = await deleteTask(id);
      setConnectionMode(result.mode);
    },
    [selectedTaskId],
  );

  const handleToggleTag = useCallback((tag: string) => {
    setSelectedTag((prev) => (prev === tag ? null : tag));
  }, []);

  const hasActiveFilters =
    activeView !== 'all' || selectedTag !== null || searchQuery.trim().length > 0;

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-[#09090B] text-zinc-100">
      <Navbar
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        searchInputRef={searchInputRef}
        connectionMode={connectionMode}
        onOpenCreateModal={() => setIsCreateModalOpen(true)}
      />

      <div className="flex min-h-0 flex-1 overflow-hidden">
        <Sidebar
          activeView={activeView}
          onSelectView={setActiveView}
          selectedTag={selectedTag}
          onToggleTag={handleToggleTag}
          onClearTag={() => setSelectedTag(null)}
          counts={counts}
          tags={dynamicTags}
        />

        {/* Main Workspace Canvas */}
        <main className="flex min-w-0 flex-1 flex-col overflow-hidden">
          {/* Sub-header / Filter Bar */}
          <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b border-zinc-800/80 px-4 py-3 lg:px-6">
            <div className="flex flex-wrap items-center gap-2.5">
              <h1 className="text-sm font-semibold tracking-tight text-zinc-100">
                {VIEW_LABELS[activeView]}
              </h1>
              <span className="rounded border border-zinc-800/80 bg-[#121215] px-1.5 py-0.5 font-mono text-[11px] text-zinc-400">
                {filteredTasks.length}
              </span>

              {selectedTag && (
                <button
                  type="button"
                  onClick={() => setSelectedTag(null)}
                  className="inline-flex cursor-pointer items-center gap-1 rounded-full border border-indigo-500/35 bg-indigo-950/40 px-2 py-0.5 font-mono text-[11px] text-indigo-200 transition-colors hover:bg-indigo-950/70"
                >
                  <span>#{selectedTag}</span>
                  <X className="h-3 w-3" />
                </button>
              )}

              {hasActiveFilters && (
                <button
                  type="button"
                  onClick={() => {
                    setActiveView('all');
                    setSelectedTag(null);
                    setSearchQuery('');
                  }}
                  className="cursor-pointer text-[11px] text-zinc-500 hover:text-zinc-300"
                >
                  Reset filters
                </button>
              )}
            </div>

            <div className="flex items-center gap-2">
              {pendingAiCount > 0 && (
                <div className="inline-flex items-center gap-1.5 rounded-full border border-indigo-500/30 bg-indigo-950/40 px-2.5 py-1 text-[11px] text-indigo-200">
                  <Sparkles className="h-3 w-3 animate-pulse text-indigo-400" />
                  <span>
                    Polling AI ({pendingAiCount} pending)
                  </span>
                </div>
              )}

              <button
                type="button"
                onClick={() => void fetchTasks()}
                title="Refresh tasks"
                aria-label="Refresh tasks"
                className="inline-flex h-7 w-7 cursor-pointer items-center justify-center rounded-md border border-zinc-800/80 bg-[#121215] text-zinc-400 transition-colors hover:border-zinc-700 hover:text-zinc-100"
              >
                <RefreshCw className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>

          {/* Mobile View Switcher */}
          <div className="flex items-center gap-1.5 overflow-x-auto border-b border-zinc-800/80 px-4 py-2 md:hidden">
            {(['all', 'ai_enriched', 'high_priority'] as WorkspaceView[]).map(
              (view) => (
                <button
                  key={view}
                  type="button"
                  onClick={() => setActiveView(view)}
                  className={`shrink-0 rounded-md px-2.5 py-1 text-xs font-medium ${
                    activeView === view
                      ? 'bg-zinc-100 text-zinc-950'
                      : 'border border-zinc-800 bg-[#121215] text-zinc-400'
                  }`}
                >
                  {VIEW_LABELS[view]}
                </button>
              ),
            )}
          </div>

          {/* 3-Column Kanban Board */}
          <div className="flex-1 overflow-x-auto overflow-y-auto p-4 lg:p-6">
            {isLoading ? (
              <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
                {KANBAN_COLUMNS.map((col) => (
                  <div
                    key={col.status}
                    className="space-y-3 rounded-xl border border-zinc-800/60 bg-[#0C0C0F] p-3"
                  >
                    <div className="h-5 w-24 animate-pulse rounded bg-zinc-800/70" />
                    <div className="h-32 animate-pulse rounded-lg border border-zinc-800/70 bg-[#121215]" />
                    <div className="h-28 animate-pulse rounded-lg border border-zinc-800/70 bg-[#121215]" />
                  </div>
                ))}
              </div>
            ) : (
              <div className="grid min-h-full grid-cols-1 items-start gap-5 lg:grid-cols-3">
                {KANBAN_COLUMNS.map((column) => {
                  const columnTasks = tasksByStatus[column.status];
                  return (
                    <section
                      key={column.status}
                      aria-label={column.title}
                      className="flex flex-col rounded-xl border border-zinc-800/70 bg-[#0C0C0F]/80 p-3"
                    >
                      {/* Column Header */}
                      <div className="mb-3 flex items-center justify-between px-1">
                        <div className="flex items-center gap-2">
                          {column.icon}
                          <h2 className="text-xs font-semibold tracking-tight text-zinc-200">
                            {column.title}
                          </h2>
                          <span className="rounded bg-zinc-900 px-1.5 py-0.5 font-mono text-[10px] text-zinc-500">
                            {columnTasks.length}
                          </span>
                        </div>

                        {column.status === 'todo' && (
                          <button
                            type="button"
                            onClick={() => setIsCreateModalOpen(true)}
                            title="New task"
                            aria-label="New task in To Do"
                            className="cursor-pointer rounded p-1 text-zinc-500 transition-colors hover:bg-zinc-800 hover:text-zinc-200"
                          >
                            <Plus className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </div>

                      {/* Column Cards */}
                      <div className="flex flex-col gap-2.5">
                        {columnTasks.length === 0 ? (
                          <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-zinc-800/80 px-4 py-8 text-center">
                            <p className="text-xs text-zinc-500">
                              No tasks in {column.title}
                            </p>
                          </div>
                        ) : (
                          columnTasks.map((task) => (
                            <TaskCard
                              key={task.id}
                              task={task}
                              selectedTag={selectedTag}
                              onSelect={(t) => setSelectedTaskId(t.id)}
                              onAdvanceStatus={handleUpdateStatus}
                              onDelete={handleDeleteTask}
                              onTagClick={handleToggleTag}
                            />
                          ))
                        )}
                      </div>
                    </section>
                  );
                })}
              </div>
            )}
          </div>
        </main>
      </div>

      {/* Create Task Modal */}
      <CreateTaskModal
        isOpen={isCreateModalOpen}
        isSubmitting={isCreating}
        onClose={() => setIsCreateModalOpen(false)}
        onSubmit={handleCreateTask}
      />

      {/* Task Detail Slide-Over Drawer */}
      <TaskDetailDrawer
        task={selectedTask}
        onClose={() => setSelectedTaskId(null)}
        onUpdateStatus={handleUpdateStatus}
        onDelete={handleDeleteTask}
        onTagClick={handleToggleTag}
      />
    </div>
  );
}
