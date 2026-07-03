'use client';

import { useState, useRef, useCallback } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter } from '@/i18n/routing';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import * as api from '@/lib/tauri-api';
import { cn } from '@/lib/utils';
import { Upload, FileText, Image, X, Loader2 } from 'lucide-react';

interface CreateResumeDialogProps {
  open: boolean;
  onClose: () => void;
  onCreate: (data: { title?: string; language?: string; template?: string }) => Promise<any>;
}

type Tab = 'blank' | 'upload';

const ACCEPTED_EXTENSIONS = '.pdf,.png,.jpg,.jpeg,.webp';

export function CreateResumeDialog({ open, onClose, onCreate }: CreateResumeDialogProps) {
  const t = useTranslations();
  const router = useRouter();
  const [tab, setTab] = useState<Tab>('blank');
  const [title, setTitle] = useState('');
  const [template, setTemplate] = useState<string>('classic');
  const [isCreating, setIsCreating] = useState(false);
  const [createError, setCreateError] = useState('');

  // Upload state
  const [file, setFile] = useState<File | null>(null);
  const [isParsing, setIsParsing] = useState(false);
  const [parseError, setParseError] = useState('');
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleCreate = async () => {
    setIsCreating(true);
    setCreateError('');
    try {
      const resume = await onCreate({ title: title || undefined, template });
      if (!resume) {
        throw new Error(t('dashboard.createFailed'));
      }
      resetAndClose();
      router.push(`/editor/${resume.id}`);
    } catch (err: any) {
      setCreateError(err.message || t('dashboard.createFailed'));
    } finally {
      setIsCreating(false);
    }
  };

  const handleFileSelect = (selectedFile: File) => {
    setParseError('');
    const validTypes = ['application/pdf', 'image/png', 'image/jpeg', 'image/webp'];
    if (!validTypes.includes(selectedFile.type)) {
      setParseError(t('dashboard.upload.invalidType'));
      return;
    }
    if (selectedFile.size > 10 * 1024 * 1024) {
      setParseError(t('dashboard.upload.fileTooLarge'));
      return;
    }
    setFile(selectedFile);
  };

  const handleUploadParse = async () => {
    if (!file) return;
    setIsParsing(true);
    setParseError('');

    try {
      const resumeId = await api.parseResumeFile({ file });
      resetAndClose();
      router.push(`/editor/${resumeId}`);
    } catch (err: any) {
      setParseError(err.message || t('dashboard.upload.parseFailed'));
    } finally {
      setIsParsing(false);
    }
  };

  const resetAndClose = () => {
    onClose();
    setTitle('');
    setTemplate('classic');
    setTab('blank');
    setFile(null);
    setCreateError('');
    setParseError('');
  };

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const droppedFile = e.dataTransfer.files[0];
    if (droppedFile) handleFileSelect(droppedFile);
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const fileIcon = file?.type === 'application/pdf' ? FileText : Image;
  const FileIcon = fileIcon;

  return (
    <Dialog open={open} onOpenChange={(o) => !o && resetAndClose()}>
      <DialogContent className="sm:max-w-4xl p-0 gap-0 overflow-hidden">
        <DialogHeader className="px-6 pt-6 pb-0">
          <DialogTitle>{t('dashboard.createResume')}</DialogTitle>
          <DialogDescription>{t('dashboard.createResumeDescription')}</DialogDescription>
        </DialogHeader>

        {/* Tabs */}
        <div className="mx-6 mt-4 flex gap-1 rounded-lg bg-muted p-1">
          <button
            type="button"
            className={cn(
              'flex-1 cursor-pointer rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
              tab === 'blank'
                ? 'bg-card text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            )}
            onClick={() => setTab('blank')}
          >
            {t('dashboard.upload.fromTemplate')}
          </button>
          <button
            type="button"
            className={cn(
              'flex-1 cursor-pointer rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
              tab === 'upload'
                ? 'bg-card text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            )}
            onClick={() => setTab('upload')}
          >
            {t('dashboard.upload.fromFile')}
          </button>
        </div>

        <div className="px-6 py-4">
          {tab === 'blank' ? (
            <div className="space-y-4">
              <Input
                placeholder={t('dashboard.titlePlaceholder')}
                value={title}
                onChange={(e) => {
                  setTitle(e.target.value);
                  if (createError) setCreateError('');
                }}
              />

              {/* Template selector */}
              <div>
                <label className="mb-2 block text-sm font-medium text-[var(--whale-ink-soft)]">
                  {t('editor.toolbar.template') || 'Template'}
                </label>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    className={cn(
                      'cursor-pointer rounded-lg border-2 p-4 text-left transition-all',
                      template === 'classic'
                        ? 'border-brand bg-brand-muted'
                        : 'border-border hover:border-[var(--whale-ink-muted)]'
                    )}
                    onClick={() => setTemplate('classic')}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-foreground">Classic</span>
                      {template === 'classic' && (
                        <span className="text-brand">✓</span>
                      )}
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {t('dashboard.templateClassicDesc') || 'Traditional professional layout'}
                    </p>
                  </button>
                  <button
                    type="button"
                    className={cn(
                      'cursor-pointer rounded-lg border-2 p-4 text-left transition-all',
                      template === 'modern'
                        ? 'border-brand bg-brand-muted'
                        : 'border-border hover:border-[var(--whale-ink-muted)]'
                    )}
                    onClick={() => setTemplate('modern')}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-foreground">Modern</span>
                      {template === 'modern' && (
                        <span className="text-brand">✓</span>
                      )}
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {t('dashboard.templateModernDesc') || 'Contemporary design with accent colors'}
                    </p>
                  </button>
                </div>
              </div>

              {createError ? (
                <p className="text-sm text-red-600">{createError}</p>
              ) : null}
            </div>
          ) : (
            <div className="space-y-4">
              {/* Dropzone */}
              <div
                className={cn(
                  'relative flex flex-col items-center justify-center rounded-xl border-2 border-dashed p-6 transition-colors',
                  isDragging
                    ? 'border-brand bg-brand-muted'
                    : file
                      ? 'border-green-300 bg-green-50'
                      : 'border-border hover:border-[var(--whale-ink-muted)]'
                )}
                onDrop={handleDrop}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
              >
                {file ? (
                  <div className="flex items-center gap-3">
                    <FileIcon className="h-8 w-8 text-green-600" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-[var(--whale-ink-soft)]">{file.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {(file.size / 1024).toFixed(0)} KB
                      </p>
                    </div>
                    <button
                      type="button"
                      className="cursor-pointer rounded-full p-1 text-muted-foreground hover:bg-[var(--whale-cream-deep)] hover:text-foreground"
                      onClick={() => setFile(null)}
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                ) : (
                  <>
                    <Upload className="mb-2 h-8 w-8 text-muted-foreground" />
                    <p className="text-sm text-[var(--whale-ink-soft)]">{t('dashboard.upload.dropzone')}</p>
                    <p className="mt-1 text-xs text-muted-foreground">{t('dashboard.upload.acceptedTypes')}</p>
                    <button
                      type="button"
                      className="mt-3 cursor-pointer rounded-md bg-muted px-3 py-1.5 text-sm font-medium text-[var(--whale-ink-soft)] hover:bg-[var(--whale-cream-deep)]"
                      onClick={() => fileInputRef.current?.click()}
                    >
                      {t('dashboard.upload.browse')}
                    </button>
                  </>
                )}
                <input
                  ref={fileInputRef}
                  type="file"
                  accept={ACCEPTED_EXTENSIONS}
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) handleFileSelect(f);
                    e.target.value = '';
                  }}
                />
              </div>

              {parseError && (
                <p className="text-sm text-red-500">{parseError}</p>
              )}

            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-2 border-t border-border px-6 py-4">
          <Button variant="outline" onClick={resetAndClose} className="cursor-pointer">
            {t('common.cancel')}
          </Button>
          {tab === 'blank' ? (
            <Button
              onClick={handleCreate}
              disabled={isCreating}
              className="cursor-pointer bg-brand hover:bg-brand-hover"
            >
              {isCreating ? t('common.loading') : t('common.create')}
            </Button>
          ) : (
            <Button
              onClick={handleUploadParse}
              disabled={!file || isParsing}
              className="cursor-pointer bg-brand hover:bg-brand-hover"
            >
              {isParsing ? (
                <>
                  <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                  {t('dashboard.upload.parsing')}
                </>
              ) : (
                t('dashboard.upload.uploadAndParse')
              )}
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
