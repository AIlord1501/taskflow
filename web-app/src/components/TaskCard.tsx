import { ArrowRight, Check, Clock, Sparkles, Trash2 } from 'lucide-react';
import type { Task, TaskStatus } from '../types/task';
import { formatRelativeTime } from '../utils/time';

interface TaskCardProps {
  task: Task;
  selectedTag: string | null;
  onSelect: (task: Task) => void;
  onAdvanceStatus: (id: string, nextStatus: TaskStatus) => void;
  onDelete: (id: string) => void;
  onTagClick: (tag: string) => void;
}

export function TaskCard({
  task,
  selectedTag,
  onSelect,
  onAdvanceStatus,
  onDelete,
  onTagClick,
}: TaskCardProps) {
  const shortId = task.id.slice(0, 12);

  return (
    <article
      role="button"
      tabIndex={0}
      onClick={() => onSelect(task)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onSelect(task);
        }
      }}
      className="group flex cursor-pointer flex-col gap-3 rounded-lg border border-zinc-800/80 bg-[#121215] p-3.5 text-left transition-all duration-150 hover:border-zinc-700/90 hover:bg-[#151519] focus:border-zinc-600 focus:outline-none"
    >
      {/* Top Row: ID + Delete */}
      <div className="flex items-center justify-between gap-2">
        <span className="font-mono text-[10px] tracking-tight text-zinc-500">
          {shortId}
        </span>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onDelete(task.id);
          }}
          aria-label={`Delete ${task.title}`}
          title="Delete task"
          className="cursor-pointer rounded p-1 text-zinc-600 opacity-70 transition-colors hover:bg-red-950/50 hover:text-red-400 group-hover:opacity-100"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* Title & Description Preview */}
      <div className="space-y-1">
        <h3 className="text-[13px] font-medium leading-snug text-zinc-100">
          {task.title}
        </h3>
        {task.description && (
          <p className="line-clamp-2 text-xs leading-relaxed text-zinc-400">
            {task.description}
          </p>
        )}
      </div>

      {/* AI Summary Callout or Pulsing Shimmer */}
      {task.ai_summary ? (
        <div className="rounded-md border border-indigo-500/30 bg-indigo-950/40 px-2.5 py-2 text-indigo-200 shadow-[0_0_24px_-12px_rgba(99,102,241,0.45)]">
          <div className="mb-1 flex items-center gap-1.5 text-[10px] font-semibold tracking-wide text-indigo-300 uppercase">
            <Sparkles className="h-3 w-3 text-indigo-400" />
            <span>AI Summary</span>
          </div>
          <p className="text-[11px] leading-relaxed text-indigo-200/95">
            {task.ai_summary}
          </p>
        </div>
      ) : (
        <div className="rounded-md border border-indigo-500/20 bg-indigo-950/25 px-2.5 py-2">
          <div className="mb-1.5 flex items-center gap-1.5 text-[10px] font-medium text-indigo-300/80">
            <Sparkles className="h-3 w-3 animate-pulse text-indigo-400" />
            <span>Generating AI summary...</span>
          </div>
          <div className="space-y-1.5">
            <div className="ai-shimmer-bar h-2 w-full rounded-sm" />
            <div className="ai-shimmer-bar h-2 w-3/4 rounded-sm" />
          </div>
        </div>
      )}

      {/* Clickable #Tag Pills */}
      {task.tags.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {task.tags.map((tag) => {
            const isActive = selectedTag === tag;
            return (
              <button
                key={tag}
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onTagClick(tag);
                }}
                className={`cursor-pointer rounded border px-1.5 py-0.5 font-mono text-[10px] transition-colors ${
                  isActive
                    ? 'border-indigo-500/40 bg-indigo-950/50 text-indigo-200'
                    : 'border-zinc-800 bg-[#09090B] text-zinc-400 hover:border-zinc-700 hover:text-zinc-200'
                }`}
              >
                #{tag}
              </button>
            );
          })}
        </div>
      )}

      {/* Footer: Relative Timestamp + One-Click Status Advance */}
      <div className="flex items-center justify-between border-t border-zinc-800/70 pt-2.5">
        <span className="inline-flex items-center gap-1 text-[11px] text-zinc-500">
          <Clock className="h-3 w-3" />
          <span>{formatRelativeTime(task.updated_at || task.created_at)}</span>
        </span>

        {task.status === 'todo' && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onAdvanceStatus(task.id, 'in_progress');
            }}
            className="inline-flex cursor-pointer items-center gap-1 rounded border border-zinc-700/80 bg-zinc-900 px-2 py-0.5 text-[11px] font-medium text-zinc-200 transition-colors hover:border-zinc-600 hover:bg-zinc-800"
          >
            <span>Start</span>
            <ArrowRight className="h-3 w-3" />
          </button>
        )}

        {task.status === 'in_progress' && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onAdvanceStatus(task.id, 'done');
            }}
            className="inline-flex cursor-pointer items-center gap-1 rounded border border-emerald-500/30 bg-emerald-950/35 px-2 py-0.5 text-[11px] font-medium text-emerald-300 transition-colors hover:border-emerald-500/50 hover:bg-emerald-950/60"
          >
            <span>Done</span>
            <Check className="h-3 w-3" />
          </button>
        )}

        {task.status === 'done' && (
          <span className="inline-flex items-center gap-1 font-mono text-[10px] text-emerald-400/80">
            <Check className="h-3 w-3" />
            <span>Completed</span>
          </span>
        )}
      </div>
    </article>
  );
}
