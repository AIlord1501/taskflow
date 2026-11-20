import { CornerDownLeft, Hash, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import type { CreateTaskInput } from '../types/task';

interface CreateTaskModalProps {
  isOpen: boolean;
  isSubmitting: boolean;
  onClose: () => void;
  onSubmit: (input: CreateTaskInput) => Promise<void>;
}

function parseTags(raw: string): string[] {
  const unique = new Set(
    raw
      .split(',')
      .map((t) => t.replace(/^#/, '').trim().toLowerCase())
      .filter(Boolean),
  );
  return Array.from(unique);
}

export function CreateTaskModal({
  isOpen,
  isSubmitting,
  onClose,
  onSubmit,
}: CreateTaskModalProps) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [tagsRaw, setTagsRaw] = useState('');
  const [error, setError] = useState<string | null>(null);
  const titleInputRef = useRef<HTMLInputElement | null>(null);

  const parsedTags = useMemo(() => parseTags(tagsRaw), [tagsRaw]);

  useEffect(() => {
    if (!isOpen) return;
    const frame = window.requestAnimationFrame(() => {
      titleInputRef.current?.focus();
    });

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  async function handleFormSubmit(e: FormEvent) {
    e.preventDefault();
    const trimmedTitle = title.trim();
    if (!trimmedTitle) {
      setError('Task title is required.');
      titleInputRef.current?.focus();
      return;
    }
    if (trimmedTitle.length > 255) {
      setError('Title must be 255 characters or fewer.');
      return;
    }

    setError(null);
    await onSubmit({
      title: trimmedTitle,
      description: description.trim(),
      tags: parsedTags,
    });
    setTitle('');
    setDescription('');
    setTagsRaw('');
    onClose();
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/75 px-4 pt-[12vh] backdrop-blur-xs"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="create-task-title"
    >
      <div
        className="w-full max-w-lg overflow-hidden rounded-xl border border-zinc-800 bg-[#121215] shadow-2xl shadow-black/70"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => {
          if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
            e.preventDefault();
            void handleFormSubmit(e as unknown as FormEvent);
          }
        }}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-zinc-800/80 px-5 py-3.5">
          <div className="flex items-center gap-2">
            <h2
              id="create-task-title"
              className="text-sm font-semibold text-zinc-100"
            >
              Create Task
            </h2>
            <span className="rounded border border-zinc-800 bg-[#09090B] px-1.5 py-0.5 font-mono text-[10px] text-zinc-500">
              To Do
            </span>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close modal"
            className="cursor-pointer rounded p-1 text-zinc-500 transition-colors hover:bg-zinc-800 hover:text-zinc-200"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleFormSubmit} className="space-y-4 p-5">
          <div>
            <label
              htmlFor="task-title"
              className="mb-1.5 block text-xs font-medium text-zinc-300"
            >
              Title <span className="text-zinc-500">*</span>
            </label>
            <input
              ref={titleInputRef}
              id="task-title"
              type="text"
              value={title}
              onChange={(e) => {
                setTitle(e.target.value);
                if (error) setError(null);
              }}
              placeholder="e.g., Add rate limiting middleware to Go API"
              maxLength={255}
              className="h-9 w-full rounded-md border border-zinc-800 bg-[#09090B] px-3 text-sm text-zinc-100 placeholder:text-zinc-600 focus:border-zinc-600 focus:outline-none"
            />
          </div>

          <div>
            <label
              htmlFor="task-description"
              className="mb-1.5 block text-xs font-medium text-zinc-300"
            >
              Description
            </label>
            <textarea
              id="task-description"
              rows={4}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Add technical context, acceptance criteria, or links. The AI worker will summarize this automatically."
              className="w-full resize-none rounded-md border border-zinc-800 bg-[#09090B] px-3 py-2 text-xs leading-relaxed text-zinc-100 placeholder:text-zinc-600 focus:border-zinc-600 focus:outline-none"
            />
          </div>

          <div>
            <label
              htmlFor="task-tags"
              className="mb-1.5 flex items-center gap-1 text-xs font-medium text-zinc-300"
            >
              <Hash className="h-3 w-3 text-zinc-500" />
              <span>Tags</span>
              <span className="font-normal text-zinc-500">(comma-separated)</span>
            </label>
            <input
              id="task-tags"
              type="text"
              value={tagsRaw}
              onChange={(e) => setTagsRaw(e.target.value)}
              placeholder="golang, high-priority, backend"
              className="h-9 w-full rounded-md border border-zinc-800 bg-[#09090B] px-3 font-mono text-xs text-zinc-100 placeholder:text-zinc-600 focus:border-zinc-600 focus:outline-none"
            />
            {parsedTags.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {parsedTags.map((tag) => (
                  <span
                    key={tag}
                    className="rounded border border-zinc-800 bg-[#09090B] px-1.5 py-0.5 font-mono text-[10px] text-zinc-300"
                  >
                    #{tag}
                  </span>
                ))}
              </div>
            )}
          </div>

          {error && (
            <p className="rounded-md border border-red-500/30 bg-red-950/30 px-3 py-2 text-xs text-red-300">
              {error}
            </p>
          )}

          {/* Footer */}
          <div className="flex items-center justify-between border-t border-zinc-800/80 pt-4">
            <span className="hidden items-center gap-1 text-[11px] text-zinc-500 sm:inline-flex">
              <kbd className="rounded border border-zinc-800 bg-[#09090B] px-1.5 py-0.5 font-mono text-[10px]">
                Ctrl
              </kbd>
              <span>+</span>
              <kbd className="inline-flex items-center rounded border border-zinc-800 bg-[#09090B] px-1.5 py-0.5 font-mono text-[10px]">
                <CornerDownLeft className="h-2.5 w-2.5" />
              </kbd>
              <span>to submit</span>
            </span>

            <div className="ml-auto flex items-center gap-2">
              <button
                type="button"
                onClick={onClose}
                className="h-8 cursor-pointer rounded-md border border-zinc-800 bg-transparent px-3 text-xs font-medium text-zinc-300 transition-colors hover:bg-zinc-900 hover:text-zinc-100"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSubmitting}
                className="h-8 cursor-pointer rounded-md bg-zinc-100 px-3.5 text-xs font-medium text-zinc-950 transition-colors hover:bg-zinc-200 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isSubmitting ? 'Creating...' : 'Create Task'}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
