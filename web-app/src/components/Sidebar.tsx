import { Flame, Hash, Layers, Sparkles } from 'lucide-react';
import type { ReactNode } from 'react';
import type { WorkspaceView } from '../types/task';

export interface TagCount {
  tag: string;
  count: number;
}

interface SidebarProps {
  activeView: WorkspaceView;
  onSelectView: (view: WorkspaceView) => void;
  selectedTag: string | null;
  onToggleTag: (tag: string) => void;
  onClearTag: () => void;
  counts: {
    all: number;
    aiEnriched: number;
    highPriority: number;
  };
  tags: TagCount[];
}

export function Sidebar({
  activeView,
  onSelectView,
  selectedTag,
  onToggleTag,
  onClearTag,
  counts,
  tags,
}: SidebarProps) {
  const navItems: Array<{
    id: WorkspaceView;
    label: string;
    count: number;
    icon: ReactNode;
  }> = [
    {
      id: 'all',
      label: 'All Tasks',
      count: counts.all,
      icon: <Layers className="h-3.5 w-3.5" />,
    },
    {
      id: 'ai_enriched',
      label: 'AI Enriched',
      count: counts.aiEnriched,
      icon: <Sparkles className="h-3.5 w-3.5 text-indigo-400" />,
    },
    {
      id: 'high_priority',
      label: 'High Priority',
      count: counts.highPriority,
      icon: <Flame className="h-3.5 w-3.5 text-amber-400/90" />,
    },
  ];

  return (
    <aside className="hidden w-60 shrink-0 flex-col justify-between border-r border-zinc-800/80 bg-[#09090B] md:flex">
      <div className="flex flex-col gap-6 overflow-y-auto p-3.5">
        {/* Workspace Views */}
        <div>
          <p className="mb-2 px-2 text-[10px] font-semibold tracking-wider text-zinc-500 uppercase">
            Workspace
          </p>
          <nav className="flex flex-col gap-0.5" aria-label="Workspace views">
            {navItems.map((item) => {
              const isActive = activeView === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => onSelectView(item.id)}
                  className={`flex w-full cursor-pointer items-center justify-between rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors ${
                    isActive
                      ? 'border border-zinc-800/90 bg-[#121215] text-zinc-100'
                      : 'border border-transparent text-zinc-400 hover:bg-[#121215]/60 hover:text-zinc-200'
                  }`}
                >
                  <span className="flex items-center gap-2">
                    {item.icon}
                    <span>{item.label}</span>
                  </span>
                  <span className="font-mono text-[11px] text-zinc-500">
                    {item.count}
                  </span>
                </button>
              );
            })}
          </nav>
        </div>

        {/* Dynamic #Tag Filters */}
        <div>
          <div className="mb-2 flex items-center justify-between px-2">
            <p className="text-[10px] font-semibold tracking-wider text-zinc-500 uppercase">
              Active Tags
            </p>
            {selectedTag && (
              <button
                type="button"
                onClick={onClearTag}
                className="cursor-pointer text-[10px] font-medium text-indigo-300 hover:text-indigo-200"
              >
                Clear
              </button>
            )}
          </div>

          {tags.length === 0 ? (
            <p className="px-2 text-xs text-zinc-600">No tags yet</p>
          ) : (
            <div className="flex flex-col gap-0.5">
              {tags.map(({ tag, count }) => {
                const isSelected = selectedTag === tag;
                return (
                  <button
                    key={tag}
                    type="button"
                    onClick={() => onToggleTag(tag)}
                    className={`flex w-full cursor-pointer items-center justify-between rounded-md px-2.5 py-1.5 text-xs transition-colors ${
                      isSelected
                        ? 'border border-indigo-500/35 bg-indigo-950/40 text-indigo-200'
                        : 'border border-transparent text-zinc-400 hover:bg-[#121215]/60 hover:text-zinc-200'
                    }`}
                  >
                    <span className="flex items-center gap-1.5 truncate">
                      <Hash className="h-3 w-3 shrink-0 opacity-60" />
                      <span className="truncate font-mono text-[11px]">{tag}</span>
                    </span>
                    <span className="font-mono text-[10px] text-zinc-500">
                      {count}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Keyboard Hint Footer */}
      <div className="border-t border-zinc-800/80 px-4 py-3 text-[11px] text-zinc-500">
        <div className="flex items-center justify-between">
          <span>Quick Create</span>
          <kbd className="rounded border border-zinc-800 bg-[#121215] px-1.5 py-0.5 font-mono text-[10px] text-zinc-400">
            C
          </kbd>
        </div>
        <div className="mt-1.5 flex items-center justify-between">
          <span>Instant Search</span>
          <kbd className="rounded border border-zinc-800 bg-[#121215] px-1.5 py-0.5 font-mono text-[10px] text-zinc-400">
            Ctrl K
          </kbd>
        </div>
      </div>
    </aside>
  );
}
