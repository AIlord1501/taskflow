import {
  ArrowRight,
  Calendar,
  Check,
  Clock,
  Hash,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react';
import { useEffect } from 'react';
import type { Task, TaskStatus } from '../types/task';
import { formatAbsoluteTime, formatRelativeTime } from '../utils/time';

interface TaskDetailDrawerProps {
  task: Task | null;
  onClose: () => void;
  onUpdateStatus: (id: string, status: TaskStatus) => void;
  onDelete: (id: string) => void;
  onTagClick: (tag: string) => void;
}

const STATUS_OPTIONS: Array<{ value: TaskStatus; label: string }> = [
  { value: 'todo', label: 'To Do' },
  { value: 'in_progress', label: 'In Progress' },
  { value: 'done', label: 'Done' },
];

export function TaskDetailDrawer({
  task,
  onClose,
  onUpdateStatus,
  onDelete,
  onTagClick,
}: TaskDetailDrawerProps) {
  useEffect(() => {
    if (!task) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [task, onClose]);

  if (!task) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex justify-end bg-black/70 backdrop-blur-xs"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="drawer-task-title"
    >
      <aside
        className="flex h-full w-full max-w-lg flex-col border-l border-zinc-800/80 bg-[#0D0D10] shadow-2xl shadow-black"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Top Bar */}
        <div className="flex h-14 shrink-0 items-center justify-between border-b border-zinc-800/80 px-5">
          <div className="flex items-center gap-2">
            <span className="rounded border border-zinc-800 bg-[#121215] px-2 py-0.5 font-mono text-[11px] text-zinc-400">
              {task.id}
            </span>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close detail drawer"
            className="cursor-pointer rounded p-1 text-zinc-500 transition-colors hover:bg-zinc-800 hover:text-zinc-200"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 space-y-6 overflow-y-auto p-5">
          {/* Title */}
          <div>
            <h2
              id="drawer-task-title"
              className="text-lg font-semibold leading-snug tracking-tight text-zinc-100"
            >
              {task.title}
            </h2>
          </div>

          {/* Status Selector */}
          <div className="space-y-2">
            <p className="text-[11px] font-medium tracking-wider text-zinc-500 uppercase">
              Status
            </p>
            <div className="inline-flex rounded-lg border border-zinc-800/80 bg-[#121215] p-1">
              {STATUS_OPTIONS.map((option) => {
                const isActive = task.status === option.value;
                return (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => onUpdateStatus(task.id, option.value)}
                    className={`cursor-pointer rounded-md px-3 py-1 text-xs font-medium transition-colors ${
                      isActive
                        ? 'bg-zinc-100 text-zinc-950'
                        : 'text-zinc-400 hover:text-zinc-200'
                    }`}
                  >
                    {option.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* AI Summary Box */}
          <div className="space-y-2">
            <p className="text-[11px] font-medium tracking-wider text-zinc-500 uppercase">
              AI Enrichment
            </p>
            {task.ai_summary ? (
              <div className="rounded-lg border border-indigo-500/30 bg-indigo-950/40 p-4 text-indigo-200 shadow-[0_0_32px_-12px_rgba(99,102,241,0.5)]">
                <div className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold tracking-wide text-indigo-300 uppercase">
                  <Sparkles className="h-3.5 w-3.5 text-indigo-400" />
                  <span>AI Summary</span>
                </div>
                <p className="text-xs leading-relaxed text-indigo-100/95">
                  {task.ai_summary}
                </p>
              </div>
            ) : (
              <div className="rounded-lg border border-indigo-500/25 bg-indigo-950/25 p-4">
                <div className="mb-2 flex items-center gap-1.5 text-xs font-medium text-indigo-300">
                  <Sparkles className="h-3.5 w-3.5 animate-pulse text-indigo-400" />
                  <span>Awaiting AI summary...</span>
                </div>
                <p className="mb-3 text-[11px] text-indigo-200/70">
                  TaskFlow automatically polls every 3 seconds until the background AI worker finishes enriching this task.
                </p>
                <div className="space-y-2">
                  <div className="ai-shimmer-bar h-2.5 w-full rounded-sm" />
                  <div className="ai-shimmer-bar h-2.5 w-5/6 rounded-sm" />
                </div>
              </div>
            )}
          </div>

          {/* Description */}
          <div className="space-y-2">
            <p className="text-[11px] font-medium tracking-wider text-zinc-500 uppercase">
              Description
            </p>
            <div className="rounded-lg border border-zinc-800/80 bg-[#121215] p-4">
              {task.description ? (
                <p className="whitespace-pre-wrap text-xs leading-relaxed text-zinc-300">
                  {task.description}
                </p>
              ) : (
                <p className="text-xs italic text-zinc-600">
                  No description provided.
                </p>
              )}
            </div>
          </div>

          {/* Tags */}
          <div className="space-y-2">
            <p className="flex items-center gap-1 text-[11px] font-medium tracking-wider text-zinc-500 uppercase">
              <Hash className="h-3 w-3" />
              <span>Tags</span>
            </p>
            {task.tags.length > 0 ? (
              <div className="flex flex-wrap gap-1.5">
                {task.tags.map((tag) => (
                  <button
                    key={tag}
                    type="button"
                    onClick={() => {
                      onTagClick(tag);
                      onClose();
                    }}
                    className="cursor-pointer rounded border border-zinc-800 bg-[#121215] px-2 py-1 font-mono text-[11px] text-zinc-300 transition-colors hover:border-indigo-500/40 hover:bg-indigo-950/40 hover:text-indigo-200"
                  >
                    #{tag}
                  </button>
                ))}
              </div>
            ) : (
              <p className="text-xs text-zinc-600">No tags attached</p>
            )}
          </div>

          {/* Timestamps */}
          <div className="grid grid-cols-2 gap-3 rounded-lg border border-zinc-800/80 bg-[#121215] p-3.5 text-xs">
            <div className="space-y-1">
              <span className="flex items-center gap-1.5 text-[10px] font-medium tracking-wider text-zinc-500 uppercase">
                <Calendar className="h-3 w-3" />
                Created
              </span>
              <p className="font-mono text-[11px] text-zinc-300">
                {formatAbsoluteTime(task.created_at)}
              </p>
            </div>
            <div className="space-y-1">
              <span className="flex items-center gap-1.5 text-[10px] font-medium tracking-wider text-zinc-500 uppercase">
                <Clock className="h-3 w-3" />
                Updated
              </span>
              <p className="font-mono text-[11px] text-zinc-300">
                {formatRelativeTime(task.updated_at)}
              </p>
            </div>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="flex shrink-0 items-center justify-between border-t border-zinc-800/80 px-5 py-3.5">
          <button
            type="button"
            onClick={() => {
              onDelete(task.id);
              onClose();
            }}
            className="inline-flex cursor-pointer items-center gap-1.5 rounded-md border border-zinc-800 bg-transparent px-3 py-1.5 text-xs font-medium text-zinc-400 transition-colors hover:border-red-500/40 hover:bg-red-950/30 hover:text-red-300"
          >
            <Trash2 className="h-3.5 w-3.5" />
            <span>Delete</span>
          </button>

          {task.status === 'todo' && (
            <button
              type="button"
              onClick={() => onUpdateStatus(task.id, 'in_progress')}
              className="inline-flex cursor-pointer items-center gap-1.5 rounded-md bg-zinc-100 px-3.5 py-1.5 text-xs font-medium text-zinc-950 transition-colors hover:bg-zinc-200"
            >
              <span>Move to In Progress</span>
              <ArrowRight className="h-3.5 w-3.5" />
            </button>
          )}

          {task.status === 'in_progress' && (
            <button
              type="button"
              onClick={() => onUpdateStatus(task.id, 'done')}
              className="inline-flex cursor-pointer items-center gap-1.5 rounded-md bg-zinc-100 px-3.5 py-1.5 text-xs font-medium text-zinc-950 transition-colors hover:bg-zinc-200"
            >
              <span>Mark as Done</span>
              <Check className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </aside>
    </div>
  );
}
