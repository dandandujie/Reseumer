'use client';

import { useTranslations } from 'next-intl';
import { useRouter } from '@/i18n/routing';
import { useState, useRef, useEffect, useCallback } from 'react';
import { Copy, Trash2, MoreVertical, Pencil } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import type { Resume } from '@/types/resume';

interface ResumeCardProps {
  resume: Resume;
  onDelete: () => void;
  onDuplicate: () => void;
  onRename: (title: string) => void;
}

function MiniResumeThumb({ langCode }: { langCode: string }) {
  return (
    <div className="relative h-28 w-full overflow-hidden rounded-xl bg-[var(--whale-card)] ring-1 ring-[var(--whale-divider)] transition-transform duration-300 ease-out group-hover:scale-[1.02]">
      <div className="absolute inset-0 p-3">
        {/* Header block (avatar circle + name lines) */}
        <div className="flex items-center gap-1.5">
          <div className="h-3.5 w-3.5 rounded-full bg-[var(--whale-ink)]" />
          <div className="flex-1 space-y-0.5">
            <div className="h-1.5 w-3/5 rounded-full bg-[var(--whale-ink)]/80" />
            <div className="h-1 w-2/5 rounded-full bg-[var(--whale-ink-muted)]/40" />
          </div>
        </div>
        {/* divider */}
        <div className="mt-2 h-px w-full bg-[var(--whale-divider)]" />
        {/* paragraph lines */}
        <div className="mt-1.5 space-y-1">
          <div className="h-[3px] w-full rounded-full bg-[var(--whale-cream-deep)]" />
          <div className="h-[3px] w-11/12 rounded-full bg-[var(--whale-cream-deep)]" />
          <div className="h-[3px] w-8/12 rounded-full bg-[var(--whale-cream-deep)]" />
        </div>
        {/* skills bar */}
        <div className="mt-2 flex gap-1">
          <div className="h-1.5 w-6 rounded-full bg-[var(--whale-mint)]" />
          <div className="h-1.5 w-4 rounded-full bg-[var(--whale-cream-deep)]" />
          <div className="h-1.5 w-5 rounded-full bg-[var(--whale-cream-deep)]" />
        </div>
      </div>
      {/* Language badge */}
      <span className="absolute right-2 top-2 rounded-full bg-[var(--whale-ink)] px-1.5 py-0.5 text-[8px] font-bold tracking-wider text-[var(--whale-cream)]">
        {langCode.toUpperCase()}
      </span>
    </div>
  );
}

export function ResumeCard({ resume, onDelete, onDuplicate, onRename }: ResumeCardProps) {
  const t = useTranslations();
  const router = useRouter();
  const [isRenaming, setIsRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState(resume.title);
  const inputRef = useRef<HTMLInputElement>(null);

  const renamingRef = useRef(false);

  const startRenaming = () => {
    renamingRef.current = true;
    setIsRenaming(true);
  };

  useEffect(() => {
    if (isRenaming) {
      const timer = setTimeout(() => {
        inputRef.current?.focus();
        inputRef.current?.select();
      }, 80);
      return () => clearTimeout(timer);
    }
  }, [isRenaming]);

  const commitRename = useCallback(() => {
    const trimmed = renameValue.trim();
    if (trimmed && trimmed !== resume.title) {
      onRename(trimmed);
    } else {
      setRenameValue(resume.title);
    }
    setIsRenaming(false);
    renamingRef.current = false;
  }, [renameValue, resume.title, onRename]);

  // Commit rename on any click outside the input (fires before blur)
  useEffect(() => {
    if (!isRenaming) return;
    const handleMouseDown = (e: MouseEvent) => {
      if (inputRef.current && !inputRef.current.contains(e.target as Node)) {
        commitRename();
      }
    };
    document.addEventListener('mousedown', handleMouseDown, true);
    return () => document.removeEventListener('mousedown', handleMouseDown, true);
  }, [isRenaming, commitRename]);

  // On blur, refocus if still renaming (handles Radix focus stealing)
  const handleBlur = useCallback(() => {
    requestAnimationFrame(() => {
      if (renamingRef.current && inputRef.current) {
        inputRef.current.focus();
      }
    });
  }, []);
  return (
    <div
      className={`group relative overflow-hidden rounded-2xl border border-[var(--whale-divider)] bg-[var(--whale-card)] transition-all duration-200 ${isRenaming ? '' : 'cursor-pointer hover:-translate-y-0.5 hover:border-[var(--whale-ink)]/30 hover:shadow-[0_12px_32px_-12px_rgba(28,26,23,0.18)]'}`}
      onClick={() => { if (!renamingRef.current) router.push(`/editor/${resume.id}`); }}
    >
      <div className="border-b border-[var(--whale-divider)] bg-[var(--whale-cream-soft)] p-4">
        <MiniResumeThumb langCode={resume.language || 'en'} />
      </div>

      {/* Info section */}
      <div className="p-3">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            {isRenaming ? (
              <input
                ref={inputRef}
                value={renameValue}
                onChange={(e) => setRenameValue(e.target.value)}
                onBlur={handleBlur}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') { e.preventDefault(); commitRename(); }
                  if (e.key === 'Escape') { setRenameValue(resume.title); setIsRenaming(false); renamingRef.current = false; }
                }}
                onClick={(e) => e.stopPropagation()}
                onMouseDown={(e) => e.stopPropagation()}
                className="w-full truncate rounded border border-[var(--whale-ink)] bg-[var(--whale-card)] px-1 text-sm font-semibold text-[var(--whale-ink)] outline-none focus:ring-1 focus:ring-[var(--whale-ink)]"
              />
            ) : (
              <h3 className="truncate text-sm font-semibold text-[var(--whale-ink)]">
                {resume.title}
              </h3>
            )}
            <div className="mt-1.5 flex items-center gap-1.5 text-[11px] text-[var(--whale-ink-muted)]">
              <span className="inline-block h-1.5 w-1.5 rounded-full bg-[var(--whale-mint-deep)]" />
              {resume.updatedAt
                ? t('dashboard.lastEdited', {
                    date: new Date(resume.updatedAt).toLocaleDateString(),
                  })
                : ''}
            </div>
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger
              className="cursor-pointer rounded-md p-1 opacity-0 transition-opacity group-hover:opacity-100 hover:bg-[var(--whale-cream-soft)]"
              onClick={(e) => e.stopPropagation()}
            >
              <MoreVertical className="h-4 w-4 text-[var(--whale-ink-muted)]" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" onCloseAutoFocus={(e) => { if (renamingRef.current) e.preventDefault(); }}>
              <DropdownMenuItem
                className="cursor-pointer"
                onClick={(e) => {
                  e.stopPropagation();
                  startRenaming();
                }}
              >
                <Pencil className="mr-2 h-4 w-4" />
                {t('common.rename')}
              </DropdownMenuItem>
              <DropdownMenuItem
                className="cursor-pointer"
                onClick={(e) => {
                  e.stopPropagation();
                  onDuplicate();
                }}
              >
                <Copy className="mr-2 h-4 w-4" />
                {t('common.duplicate')}
              </DropdownMenuItem>
              <DropdownMenuItem
                className="cursor-pointer text-red-600"
                onClick={(e) => {
                  e.stopPropagation();
                  onDelete();
                }}
              >
                <Trash2 className="mr-2 h-4 w-4" />
                {t('common.delete')}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </div>
  );
}
