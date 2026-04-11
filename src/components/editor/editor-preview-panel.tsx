'use client';

import { useMemo, useState } from 'react';
import { AlertTriangle, Loader2, ZoomIn, ZoomOut } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { ResumePreview } from '@/components/preview/resume-preview';
import { useResumeStore } from '@/stores/resume-store';
import { useClassicPageEstimate } from '@/hooks/use-classic-page-estimate';
import { useIsMobile } from "@/hooks/use-media-query";
import type { Resume } from '@/types/resume';

// A4 width in px (at 96 dpi)
const A4_WIDTH = 794;

export function EditorPreviewPanel() {
  const t = useTranslations('editor.toolbar');
  const { currentResume, sections } = useResumeStore();
  const [zoom, setZoom] = useState(80);
  const locale = useLocale();
  const isMobile = useIsMobile();

  const liveResume = useMemo<Resume | null>(() => {
    if (!currentResume) return null;
    return { ...currentResume, sections };
  }, [currentResume, sections]);

  if (!liveResume) return null;

  const { estimate, loading } = useClassicPageEstimate(liveResume);
  const scale = zoom / 100;
  const overflowPreview = estimate?.overflowSections.slice(0, 2).join('、') || '';
  const isZh = locale === 'zh';

  return (
    <div className="flex h-full min-w-0 flex-col border-l bg-zinc-50 dark:bg-zinc-900 dark:border-zinc-800">
      {/* Header */}
      <div className="hidden shrink-0 items-center justify-between border-b bg-white px-4 py-2 md:flex dark:bg-background dark:border-zinc-800">
        <div className="min-w-0">
          <span className="text-xs font-medium text-zinc-500">{t('preview')}</span>
          <div className="mt-1 flex min-h-5 items-center gap-2 text-[11px]">
            {loading ? (
              <span className="inline-flex items-center gap-1 text-zinc-400">
                <Loader2 className="h-3 w-3 animate-spin" />
                {isZh ? '正在预估页数' : 'Estimating pages'}
              </span>
            ) : estimate ? (
              <>
                <span
                  className={`rounded-full px-2 py-0.5 font-medium ${
                    estimate.pageCount > 1
                      ? 'bg-amber-100 text-amber-700 dark:bg-amber-500/10 dark:text-amber-300'
                      : 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300'
                  }`}
                >
                  {isZh ? `预估 ${estimate.pageCount} 页` : `${estimate.pageCount} page${estimate.pageCount > 1 ? 's' : ''}`}
                </span>
                {estimate.overflowSections.length > 0 && (
                  <span className="inline-flex min-w-0 items-center gap-1 text-amber-600 dark:text-amber-300">
                    <AlertTriangle className="h-3 w-3 shrink-0" />
                    <span className="truncate">
                      {isZh
                        ? `超页风险：${overflowPreview}${estimate.overflowSections.length > 2 ? '等' : ''}`
                        : `Likely overflow: ${estimate.overflowSections.slice(0, 2).join(', ')}${estimate.overflowSections.length > 2 ? '…' : ''}`}
                    </span>
                  </span>
                )}
              </>
            ) : null}
          </div>
        </div>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="sm"
            className="h-7 w-7 cursor-pointer p-0"
            onClick={() => setZoom((z) => Math.max(30, z - 10))}
            disabled={zoom <= 30}
          >
            <ZoomOut className="h-3.5 w-3.5" />
          </Button>
          <span className="w-10 text-center text-xs text-zinc-500">{zoom}%</span>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 w-7 cursor-pointer p-0"
            onClick={() => setZoom((z) => Math.min(150, z + 10))}
            disabled={zoom >= 150}
          >
            <ZoomIn className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      {/* Preview body */}
      <div className="min-h-0 flex-1 overflow-auto">
        <div className="flex justify-center p-2 md:p-4">
          <div
            className="bg-white shadow-md"
            style={{
              width: isMobile ? "100%" : A4_WIDTH,
              maxWidth: A4_WIDTH,
              zoom: isMobile ? undefined : scale,
            }}
          >
            <ResumePreview resume={liveResume} />
          </div>
        </div>
      </div>
    </div>
  );
}
