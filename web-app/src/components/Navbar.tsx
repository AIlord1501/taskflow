import { Plus, Search, Terminal, X } from 'lucide-react';
import type { RefObject } from 'react';
import type { ApiConnectionMode } from '../types/task';

interface NavbarProps {
  searchQuery: string;
  onSearchChange: (value: string) => void;
  searchInputRef: RefObject<HTMLInputElement | null>;
  connectionMode: ApiConnectionMode;
  onOpenCreateModal: () => void;
}

export function Navbar({
  searchQuery,
  onSearchChange,
  searchInputRef,
  connectionMode,
  onOpenCreateModal,
}: NavbarProps) {
  const isLive = connectionMode === 'live';

  return (
    <header className="sticky top-0 z-30 flex h-14 shrink-0 items-center justify-between gap-4 border-b border-zinc-800/80 bg-[#09090B]/90 px-4 backdrop-blur-md lg:px-6">
      {/* Brand */}
      <div className="flex items-center gap-2.5">
        <div className="flex h-7 w-7 items-center justify-center rounded-md border border-zinc-800 bg-[#121215] text-zinc-100 shadow-inner">
          <Terminal className="h-3.5 w-3.5" />
        </div>
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold tracking-tight text-zinc-100">
            TaskFlow
          </span>
          <span className="hidden rounded border border-zinc-800/80 bg-[#121215] px-1.5 py-0.5 font-mono text-[10px] text-zinc-500 sm:inline-block">
            v1
          </span>
        </div>
      </div>

      {/* Instant Search */}
      <div className="relative flex-1 max-w-md">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-zinc-500" />
        <input
          ref={searchInputRef}
          type="text"
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              onSearchChange('');
              e.currentTarget.blur();
            }
          }}
          placeholder="Search tasks, summaries, or #tags..."
          aria-label="Search tasks"
          className="h-8 w-full rounded-md border border-zinc-800/80 bg-[#121215] pl-8.5 pr-16 text-xs text-zinc-100 placeholder:text-zinc-500 transition-colors focus:border-zinc-600 focus:outline-none"
        />
        {searchQuery ? (
          <button
            type="button"
            onClick={() => onSearchChange('')}
            aria-label="Clear search"
            className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-0.5 text-zinc-500 hover:bg-zinc-800 hover:text-zinc-200"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        ) : (
          <kbd className="pointer-events-none absolute right-2 top-1/2 hidden -translate-y-1/2 items-center gap-0.5 rounded border border-zinc-800 bg-[#09090B] px-1.5 py-0.5 font-mono text-[10px] text-zinc-500 sm:inline-flex">
            Ctrl K
          </kbd>
        )}
      </div>

      {/* Status Pill + Primary Action */}
      <div className="flex items-center gap-2.5">
        <div
          title={
            isLive
              ? 'Synced with Go REST API at http://localhost:8080/api/v1'
              : 'Go API at localhost:8080 unreachable or CORS-blocked — using local preview dataset'
          }
          className={`hidden items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium lg:inline-flex ${
            isLive
              ? 'border-emerald-500/25 bg-emerald-950/30 text-emerald-300'
              : 'border-zinc-800/90 bg-[#121215] text-zinc-400'
          }`}
        >
          <span
            className={`h-1.5 w-1.5 rounded-full ${
              isLive ? 'bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.7)]' : 'bg-amber-400/90'
            }`}
          />
          <span>{isLive ? 'Connected to Go API' : 'Design Preview Mode'}</span>
        </div>

        <button
          type="button"
          onClick={onOpenCreateModal}
          className="inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-md bg-zinc-100 px-3 text-xs font-medium text-zinc-950 transition-colors hover:bg-zinc-200 active:bg-zinc-300"
        >
          <Plus className="h-3.5 w-3.5 stroke-[2.25]" />
          <span>New Task</span>
        </button>
      </div>
    </header>
  );
}
