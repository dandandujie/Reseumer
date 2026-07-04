'use client';

import { useTranslations } from 'next-intl';
import { useRouter } from '@/i18n/routing';
import { ArrowLeft, Undo2, Redo2, Download, Upload, Settings, Palette, Save, Languages, SpellCheck, BookOpenCheck, MoreHorizontal, PenLine } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useEditorStore } from '@/stores/editor-store';
import { useResumeStore } from '@/stores/resume-store';
import { useUIStore } from '@/stores/ui-store';
import { useSettingsStore } from '@/stores/settings-store';
import { LocaleSwitcher } from '@/components/layout/locale-switcher';
import { cn } from '@/lib/utils';

export function EditorToolbar() {
  const t = useTranslations('editor.toolbar');
  const router = useRouter();
  const { toggleThemeEditor, showThemeEditor, undo, redo, undoStack, redoStack } = useEditorStore();
  const { isSaving, isDirty, currentResume, reorderSections, flushPendingSave } = useResumeStore();
  const { openModal } = useUIStore();
  const autoSave = useSettingsStore((s) => s.autoSave);

  const handleBack = async () => {
    await flushPendingSave();
    router.push('/dashboard');
  };

  const handleUndo = () => {
    const snapshot = undo(useResumeStore.getState().sections);
    if (snapshot) {
      reorderSections(snapshot.sections);
    }
  };

  const handleRedo = () => {
    const snapshot = redo(useResumeStore.getState().sections);
    if (snapshot) {
      reorderSections(snapshot.sections);
    }
  };

  return (
    <div
      data-tauri-drag-region
      className="flex h-12 items-center justify-between gap-2 border-b border-[var(--whale-divider)] bg-[var(--whale-sidebar)] pl-20 pr-2 sm:pr-3"
    >
      <div className="flex min-w-0 flex-1 items-center gap-1 sm:gap-2">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => void handleBack()}
          className="h-8 w-8 shrink-0 cursor-pointer text-[var(--whale-ink-soft)] hover:bg-[var(--whale-cream-deep)] hover:text-[var(--whale-ink)]"
          disabled={isSaving}
        >
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <span className="min-w-0 max-w-[8rem] truncate text-sm font-semibold text-[var(--whale-ink)] sm:max-w-48">
          {currentResume?.title || ''}
        </span>
        <span className="hidden text-xs text-[var(--whale-ink-muted)] sm:inline">
          {isSaving ? t('saving') : isDirty ? t('unsaved') : autoSave ? t('autoSaved') : ''}
        </span>
      </div>

      <div className="flex shrink-0 items-center gap-0.5 sm:gap-1">
        {/* Primary: undo/redo — always visible */}
        <Button
          variant="ghost"
          size="icon"
          onClick={handleUndo}
          disabled={undoStack.length === 0}
          className="h-8 w-8 cursor-pointer text-[var(--whale-ink-soft)] hover:bg-[var(--whale-cream-deep)] hover:text-[var(--whale-ink)] disabled:opacity-40"
          title={t('undo')}
        >
          <Undo2 className="h-4 w-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          onClick={handleRedo}
          disabled={redoStack.length === 0}
          className="h-8 w-8 cursor-pointer text-[var(--whale-ink-soft)] hover:bg-[var(--whale-cream-deep)] hover:text-[var(--whale-ink)] disabled:opacity-40"
          title={t('redo')}
        >
          <Redo2 className="h-4 w-4" />
        </Button>
        {currentResume && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => void flushPendingSave()}
            disabled={!isDirty || isSaving}
            className={cn(
              'shrink-0 cursor-pointer gap-1 transition-colors',
              isDirty
                ? 'border border-[var(--whale-ink)] bg-[var(--whale-ink)] text-[var(--whale-cream)] hover:bg-[var(--whale-ink-soft)] hover:text-[var(--whale-cream)]'
                : 'text-[var(--whale-ink-muted)]'
            )}
            title={t('save')}
          >
            <Save className="h-3.5 w-3.5" />
            <span className="hidden text-xs sm:inline">{t('save')}</span>
          </Button>
        )}

        {/* Desktop: show all secondary buttons */}
        <div className="hidden items-center gap-1 md:flex">
          <ToolbarSecondary onClick={() => openModal('export')} title={t('exportPdf')} icon={Download} label={t('exportPdf')} />
          <ToolbarSecondary onClick={() => openModal('import')} title={t('import')} icon={Upload} label={t('import')} />
          <ToolbarSecondary onClick={() => openModal('translate')} title={t('translate')} icon={Languages} label={t('translate')} />
          <ToolbarSecondary onClick={() => openModal('grammar-check')} title={t('grammarCheck')} icon={SpellCheck} label={t('grammarCheck')} />
          <ToolbarSecondary onClick={() => openModal('cover-letter')} title={t('coverLetter')} icon={PenLine} label={t('coverLetter')} />
          <ToolbarSecondary onClick={() => openModal('journal')} title={t('journal')} icon={BookOpenCheck} label={t('journal')} />
          <Button
            variant="ghost"
            size="sm"
            onClick={() => openModal('settings')}
            className="cursor-pointer text-[var(--whale-ink-soft)] hover:bg-[var(--whale-cream-deep)] hover:text-[var(--whale-ink)]"
            title={t('settings')}
          >
            <Settings className="h-4 w-4" />
          </Button>
        </div>

        {/* Mobile: "more" dropdown */}
        <div className="md:hidden">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-8 w-8 text-[var(--whale-ink-soft)]">
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => openModal('export')}>
                <Download className="mr-2 h-4 w-4" />
                {t('exportPdf')}
              </DropdownMenuItem>
              {currentResume && (
                <DropdownMenuItem onClick={() => void flushPendingSave()} disabled={!isDirty || isSaving}>
                  <Save className="mr-2 h-4 w-4" />
                  {t('save')}
                </DropdownMenuItem>
              )}
              <DropdownMenuItem onClick={() => openModal('import')}>
                <Upload className="mr-2 h-4 w-4" />
                {t('import')}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => openModal('translate')}>
                <Languages className="mr-2 h-4 w-4" />
                {t('translate')}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => openModal('grammar-check')}>
                <SpellCheck className="mr-2 h-4 w-4" />
                {t('grammarCheck')}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => openModal('cover-letter')}>
                <PenLine className="mr-2 h-4 w-4" />
                {t('coverLetter')}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => openModal('journal')}>
                <BookOpenCheck className="mr-2 h-4 w-4" />
                {t('journal')}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => openModal('settings')}>
                <Settings className="mr-2 h-4 w-4" />
                {t('settings')}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {/* Primary: theme toggle — always visible */}
        <Button
          variant="ghost"
          size="icon"
          onClick={toggleThemeEditor}
          className={cn(
            'h-8 w-8 cursor-pointer transition-colors sm:w-auto sm:px-3',
            showThemeEditor
              ? 'bg-[var(--whale-mint)]/50 text-[var(--whale-ink)] hover:bg-[var(--whale-mint)]/60'
              : 'text-[var(--whale-ink-soft)] hover:bg-[var(--whale-cream-deep)] hover:text-[var(--whale-ink)]'
          )}
          title={t('theme')}
        >
          <Palette className="h-4 w-4" />
          <span className="ml-1 hidden text-xs sm:inline">{t('theme')}</span>
        </Button>
        <LocaleSwitcher />
      </div>
    </div>
  );
}

function ToolbarSecondary({
  onClick,
  title,
  icon: Icon,
  label,
}: {
  onClick: () => void;
  title: string;
  icon: React.ElementType;
  label: string;
}) {
  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={onClick}
      className="cursor-pointer text-[var(--whale-ink-soft)] hover:bg-[var(--whale-cream-deep)] hover:text-[var(--whale-ink)]"
      title={title}
    >
      <Icon className="h-4 w-4" />
      <span className="ml-1 text-xs hidden sm:inline">{label}</span>
    </Button>
  );
}
