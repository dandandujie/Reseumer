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
import { cn } from '@/lib/utils';
import { getAIHeaders } from '@/stores/settings-store';
import { Upload, FileText, Image, X, Loader2 } from 'lucide-react';

interface CreateResumeDialogProps {
  open: boolean;
  onClose: () => void;
  onCreate: (data: { title?: string; language?: string }) => Promise<any>;
}

type Tab = 'blank' | 'upload';

const ACCEPTED_EXTENSIONS = '.pdf,.png,.jpg,.jpeg,.webp';

export function CreateResumeDialog({ open, onClose, onCreate }: CreateResumeDialogProps) {
  const t = useTranslations();
  const router = useRouter();
  const [tab, setTab] = useState<Tab>('blank');
  const [title, setTitle] = useState('');
  const [isCreating, setIsCreating] = useState(false);

  // Upload state
  const [file, setFile] = useState<File | null>(null);
  const [isParsing, setIsParsing] = useState(false);
  const [parseError, setParseError] = useState('');
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleCreate = async () => {
    setIsCreating(true);
    try {
      const resume = await onCreate({ title: title || undefined });
      if (resume) {
        resetAndClose();
        router.push(`/editor/${resume.id}`);
      }
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
      const fingerprint = typeof window !== 'undefined' ? localStorage.getItem('jade_fingerprint') : null;
      const formData = new FormData();
      formData.append('file', file);

      const res = await fetch('/api/resume/parse', {
        method: 'POST',
        headers: { ...(fingerprint ? { 'x-fingerprint': fingerprint } : {}), ...getAIHeaders() },
        body: formData,
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Parse failed');
      }

      const resume = await res.json();
      resetAndClose();
      router.push(`/editor/${resume.id}`);
    } catch (err: any) {
      setParseError(err.message || t('dashboard.upload.parseFailed'));
    } finally {
      setIsParsing(false);
    }
  };

  const resetAndClose = () => {
    onClose();
    setTitle('');
    setTab('blank');
    setFile(null);
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
        <div className="mx-6 mt-4 flex gap-1 rounded-lg bg-zinc-100 p-1 dark:bg-zinc-800">
          <button
            type="button"
            className={cn(
              'flex-1 cursor-pointer rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
              tab === 'blank'
                ? 'bg-white text-zinc-900 shadow-sm dark:bg-zinc-700 dark:text-zinc-100'
                : 'text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200'
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
                ? 'bg-white text-zinc-900 shadow-sm dark:bg-zinc-700 dark:text-zinc-100'
                : 'text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200'
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
                placeholder={t('editor.fields.fullName')}
                value={title}
                onChange={(e) => setTitle(e.target.value)}
              />
            </div>
          ) : (
            <div className="space-y-4">
              {/* Dropzone */}
              <div
                className={cn(
                  'relative flex flex-col items-center justify-center rounded-xl border-2 border-dashed p-6 transition-colors',
                  isDragging
                    ? 'border-brand bg-brand-muted dark:bg-brand-muted'
                    : file
                      ? 'border-green-300 bg-green-50 dark:border-green-700 dark:bg-green-950/20'
                      : 'border-zinc-300 hover:border-zinc-400 dark:border-zinc-600 dark:hover:border-zinc-500'
                )}
                onDrop={handleDrop}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
              >
                {file ? (
                  <div className="flex items-center gap-3">
                    <FileIcon className="h-8 w-8 text-green-600 dark:text-green-400" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-zinc-700 dark:text-zinc-200">{file.name}</p>
                      <p className="text-xs text-zinc-500 dark:text-zinc-400">
                        {(file.size / 1024).toFixed(0)} KB
                      </p>
                    </div>
                    <button
                      type="button"
                      className="cursor-pointer rounded-full p-1 text-zinc-400 hover:bg-zinc-200 hover:text-zinc-600 dark:hover:bg-zinc-700"
                      onClick={() => setFile(null)}
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                ) : (
                  <>
                    <Upload className="mb-2 h-8 w-8 text-zinc-400" />
                    <p className="text-sm text-zinc-600 dark:text-zinc-300">{t('dashboard.upload.dropzone')}</p>
                    <p className="mt-1 text-xs text-zinc-400">{t('dashboard.upload.acceptedTypes')}</p>
                    <button
                      type="button"
                      className="mt-3 cursor-pointer rounded-md bg-zinc-100 px-3 py-1.5 text-sm font-medium text-zinc-700 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700"
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
        <div className="flex justify-end gap-2 border-t border-zinc-100 px-6 py-4 dark:border-zinc-800">
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
