'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter } from '@/i18n/routing';
import { ArrowLeft, Undo2, Redo2, Download, Upload, Settings, Palette, Save, Languages, SpellCheck, BookOpenCheck, MoreHorizontal, PenLine, SlidersHorizontal, MessagesSquare } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Switch } from '@/components/ui/switch';
import { Slider } from '@/components/ui/slider';
import { Label } from '@/components/ui/label';
import { useEditorStore } from '@/stores/editor-store';
import { useResumeStore } from '@/stores/resume-store';
import { useUIStore } from '@/stores/ui-store';
import { useSettingsStore } from '@/stores/settings-store';
import { LocaleSwitcher } from '@/components/layout/locale-switcher';
import { cn } from '@/lib/utils';

export function EditorToolbar() {
  const t = useTranslations('editor.toolbar');
  const tp = useTranslations('settings.editorTab');
  const router = useRouter();
  const { toggleThemeEditor, showThemeEditor, undo, redo, undoStack, redoStack } = useEditorStore();
  const { isSaving, isDirty, currentResume, reorderSections, updateThemeConfig, flushPendingSave, setTitle } = useResumeStore();
  const { openModal } = useUIStore();
  const autoSave = useSettingsStore((s) => s.autoSave);
  const autoSaveInterval = useSettingsStore((s) => s.autoSaveInterval);
  const setAutoSave = useSettingsStore((s) => s.setAutoSave);
  const setAutoSaveInterval = useSettingsStore((s) => s.setAutoSaveInterval);

  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState('');

  const startRename = () => {
    setTitleDraft(currentResume?.title || '');
    setEditingTitle(true);
  };
  const commitTitle = () => {
    const v = titleDraft.trim();
    if (v && v !== currentResume?.title) setTitle(v);
    setEditingTitle(false);
  };

  const handleBack = async () => {
    await flushPendingSave();
    router.push('/dashboard');
  };

  const handleUndo = () => {
    const snapshot = undo(useResumeStore.getState().sections);
    if (snapshot) {
      reorderSections(snapshot.sections);
      if (snapshot.themeConfig) updateThemeConfig(snapshot.themeConfig);
    }
  };

  const handleRedo = () => {
    const snapshot = redo(useResumeStore.getState().sections);
    if (snapshot) {
      reorderSections(snapshot.sections);
      if (snapshot.themeConfig) updateThemeConfig(snapshot.themeConfig);
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
        {editingTitle ? (
          <input
            autoFocus
            value={titleDraft}
            onChange={(e) => setTitleDraft(e.target.value)}
            onBlur={commitTitle}
            onKeyDown={(e) => {
              if (e.key === 'Enter') commitTitle();
              else if (e.key === 'Escape') setEditingTitle(false);
            }}
            className="min-w-0 max-w-[8rem] rounded border border-[var(--whale-ink)]/30 bg-[var(--whale-card)] px-1.5 py-0.5 text-sm font-semibold text-[var(--whale-ink)] outline-none focus:border-[var(--whale-ink)]/50 sm:max-w-48"
          />
        ) : (
          <button
            type="button"
            onClick={startRename}
            title={t('rename')}
            className="group flex min-w-0 items-center gap-1 rounded px-1 py-0.5 hover:bg-[var(--whale-cream-deep)]"
          >
            <span className="min-w-0 max-w-[8rem] truncate text-sm font-semibold text-[var(--whale-ink)] sm:max-w-48">
              {currentResume?.title || ''}
            </span>
            <PenLine className="h-3 w-3 shrink-0 text-[var(--whale-ink-muted)] opacity-0 transition-opacity group-hover:opacity-100" />
          </button>
        )}
        <span className="hidden text-xs text-[var(--whale-ink-muted)] sm:inline">
          {isSaving ? t('saving') : isDirty ? t('unsaved') : autoSave ? t('autoSaved') : ''}
        </span>
        {/* Editor preferences (auto-save) */}
        <Popover>
          <PopoverTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6 shrink-0 cursor-pointer text-[var(--whale-ink-muted)] hover:bg-[var(--whale-cream-deep)] hover:text-[var(--whale-ink)]"
              title={t('editorPrefs')}
            >
              <SlidersHorizontal className="h-3.5 w-3.5" />
            </Button>
          </PopoverTrigger>
          <PopoverContent align="start" className="w-64 space-y-3">
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label className="text-[13px]">{tp('autoSave')}</Label>
                <p className="text-xs text-muted-foreground">{tp('autoSaveDescription')}</p>
              </div>
              <Switch checked={autoSave} onCheckedChange={setAutoSave} />
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-[13px]">{tp('autoSaveInterval')}</Label>
                <span className="text-xs text-muted-foreground">{(autoSaveInterval / 1000).toFixed(1)}s</span>
              </div>
              <Slider
                value={[autoSaveInterval]}
                onValueChange={([v]) => setAutoSaveInterval(v)}
                min={300}
                max={5000}
                step={100}
                disabled={!autoSave}
              />
            </div>
          </PopoverContent>
        </Popover>
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

        {/* Interview — prominent AI mock-interview entry */}
        <Button
          variant="ghost"
          size="sm"
          onClick={() => openModal('interview')}
          className="shrink-0 cursor-pointer gap-1 text-[var(--whale-ink-soft)] hover:bg-[var(--whale-cream-deep)] hover:text-[var(--whale-ink)]"
          title={t('interview')}
        >
          <MessagesSquare className="h-4 w-4" />
          <span className="hidden text-xs sm:inline">{t('interview')}</span>
        </Button>

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
