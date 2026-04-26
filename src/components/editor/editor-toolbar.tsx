'use client';

import { useTranslations } from 'next-intl';
import { useRouter } from '@/i18n/routing';
import { ArrowLeft, Undo2, Redo2, Download, Upload, Settings, Palette, Save, FileSearch, Languages, FileText, SpellCheck, MoreHorizontal } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
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
import { SmartFitButton } from '@/components/editor/smart-fit-button';

interface EditorToolbarProps {
  resumeId: string;
}

export function EditorToolbar({ resumeId }: EditorToolbarProps) {
  const t = useTranslations('editor.toolbar');
  const router = useRouter();
  const { toggleThemeEditor, showThemeEditor, undo, redo, undoStack, redoStack } = useEditorStore();
  const { isSaving, isDirty, currentResume, sections, reorderSections, flushPendingSave } = useResumeStore();
  const { openModal } = useUIStore();
  const autoSave = useSettingsStore((s) => s.autoSave);

  const handleBack = async () => {
    await flushPendingSave();
    router.push('/dashboard');
  };

  const handleUndo = () => {
    const snapshot = undo();
    if (snapshot) {
      reorderSections(snapshot.sections);
    }
  };

  const handleRedo = () => {
    const snapshot = redo();
    if (snapshot) {
      reorderSections(snapshot.sections);
    }
  };

  return (
    <div className="flex h-12 items-center justify-between gap-2 border-b bg-white px-2 sm:px-3 dark:bg-background dark:border-zinc-800">
      <div className="flex min-w-0 flex-1 items-center gap-1 sm:gap-2">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => void handleBack()}
          className="h-8 w-8 shrink-0 cursor-pointer text-zinc-600"
          disabled={isSaving}
        >
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <Separator orientation="vertical" className="hidden h-6 sm:block" />
        <span className="min-w-0 max-w-[8rem] truncate text-sm font-medium text-zinc-900 sm:max-w-48 dark:text-zinc-100">
          {currentResume?.title || ''}
        </span>
        <span className="hidden text-xs text-zinc-400 sm:inline">
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
          className="h-8 w-8 cursor-pointer"
          title={t('undo')}
        >
          <Undo2 className="h-4 w-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          onClick={handleRedo}
          disabled={redoStack.length === 0}
          className="h-8 w-8 cursor-pointer"
          title={t('redo')}
        >
          <Redo2 className="h-4 w-4" />
        </Button>
        {currentResume && (
          <Button
            variant={isDirty ? 'outline' : 'ghost'}
            size="sm"
            onClick={() => void flushPendingSave()}
            disabled={!isDirty || isSaving}
            className="shrink-0 cursor-pointer gap-1"
            title={t('save')}
          >
            <Save className="h-3.5 w-3.5" />
            <span className="hidden text-xs sm:inline">{t('save')}</span>
          </Button>
        )}
        <Separator orientation="vertical" className="hidden h-6 sm:block" />

        {/* Desktop: show all secondary buttons */}
        <div className="hidden items-center gap-1 md:flex">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => openModal('export')}
            className="cursor-pointer"
            title={t('exportPdf')}
          >
            <Download className="h-4 w-4" />
            <span className="ml-1 text-xs hidden sm:inline">{t('exportPdf')}</span>
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => openModal('import')}
            className="cursor-pointer"
            title={t('import')}
          >
            <Upload className="h-4 w-4" />
            <span className="ml-1 text-xs hidden sm:inline">{t('import')}</span>
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => openModal('jd-analysis')}
            className="cursor-pointer"
            title={t('jdAnalysis')}
          >
            <FileSearch className="h-4 w-4" />
            <span className="ml-1 text-xs hidden sm:inline">{t('jdAnalysis')}</span>
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => openModal('translate')}
            className="cursor-pointer"
            title={t('translate')}
          >
            <Languages className="h-4 w-4" />
            <span className="ml-1 text-xs hidden sm:inline">{t('translate')}</span>
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => openModal('cover-letter')}
            className="cursor-pointer"
            title={t('coverLetter')}
          >
            <FileText className="h-4 w-4" />
            <span className="ml-1 text-xs hidden sm:inline">{t('coverLetter')}</span>
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => openModal('grammar-check')}
            className="cursor-pointer"
            title={t('grammarCheck')}
          >
            <SpellCheck className="h-4 w-4" />
            <span className="ml-1 text-xs hidden sm:inline">{t('grammarCheck')}</span>
          </Button>
          <Separator orientation="vertical" className="h-6" />
          <Button
            variant="ghost"
            size="sm"
            onClick={() => openModal('settings')}
            className="cursor-pointer"
            title={t('settings')}
          >
            <Settings className="h-4 w-4" />
          </Button>
        </div>

        {/* Mobile: "more" dropdown */}
        <div className="md:hidden">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-8 w-8">
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
              <DropdownMenuItem onClick={() => openModal('jd-analysis')}>
                <FileSearch className="mr-2 h-4 w-4" />
                {t('jdAnalysis')}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => openModal('translate')}>
                <Languages className="mr-2 h-4 w-4" />
                {t('translate')}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => openModal('cover-letter')}>
                <FileText className="mr-2 h-4 w-4" />
                {t('coverLetter')}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => openModal('grammar-check')}>
                <SpellCheck className="mr-2 h-4 w-4" />
                {t('grammarCheck')}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => openModal('settings')}>
                <Settings className="mr-2 h-4 w-4" />
                {t('settings')}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        <Separator orientation="vertical" className="hidden h-6 sm:block" />
        <SmartFitButton />

        {/* Primary: theme toggle — always visible */}
        <Separator orientation="vertical" className="hidden h-6 sm:block" />
        <Button
          variant={showThemeEditor ? 'secondary' : 'ghost'}
          size="icon"
          onClick={toggleThemeEditor}
          className="h-8 w-8 cursor-pointer sm:w-auto sm:px-3"
          title={t('theme')}
        >
          <Palette className="h-4 w-4" />
          <span className="ml-1 hidden text-xs sm:inline">{t('theme')}</span>
        </Button>
        <Separator orientation="vertical" className="hidden h-6 sm:block" />
        <LocaleSwitcher />
      </div>
    </div>
  );
}
