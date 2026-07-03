import { useState, useCallback } from 'react';
import { toast } from 'sonner';
import i18n from '@/i18n';
import * as api from '@/lib/tauri-api';
import { generateHtml } from '@/lib/export/builders';
import { getResume } from '@/lib/tauri-api';
import type { Resume } from '@/types/resume';

export function usePdfExport() {
  const [isExporting, setIsExporting] = useState(false);

  const exportPdf = useCallback(async (resumeId: string, title?: string) => {
    setIsExporting(true);
    try {
      const resume = (await getResume(resumeId)) as Resume | null;
      if (!resume) throw new Error('Resume not found');
      const html = await generateHtml(resume, true);
      const filename = `${title || resume.title || 'resume'}.pdf`;
      await api.exportPdf(resumeId, html, filename);
    } catch (error: any) {
      // Surface the failure to the user — callers fire-and-forget this promise.
      const raw = String(error?.message || error || '');
      const description = raw.includes('CHROME_NOT_FOUND')
        ? i18n.t('export.chromeMissing')
        : raw.slice(0, 180);
      toast.error(i18n.t('export.error'), { description });
      console.error('Failed to export PDF:', error);
    } finally {
      setIsExporting(false);
    }
  }, []);

  return { exportPdf, isExporting };
}
