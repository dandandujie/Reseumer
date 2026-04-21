import { useState, useCallback } from 'react';
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
    } catch (error) {
      console.error('Failed to export PDF:', error);
      throw error;
    } finally {
      setIsExporting(false);
    }
  }, []);

  return { exportPdf, isExporting };
}
