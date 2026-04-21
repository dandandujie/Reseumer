'use client';

import { useEffect, useState } from 'react';
import type { Resume } from '@/types/resume';
import type { ClassicPageEstimate } from '@/lib/pretext-classic-estimate';
import { estimateClassicPages } from '@/lib/pretext-classic-estimate';

interface ClassicPageEstimateState {
  loading: boolean;
  estimate: ClassicPageEstimate | null;
}

export function useClassicPageEstimate(resume: Resume | null) {
  const [state, setState] = useState<ClassicPageEstimateState>({
    loading: true,
    estimate: null,
  });

  useEffect(() => {
    if (!resume || typeof window === 'undefined') {
      setState({ loading: false, estimate: null });
      return;
    }

    let cancelled = false;

    const run = async () => {
      setState((prev) => ({ ...prev, loading: true }));

      try {
        if ('fonts' in document) {
          await document.fonts.ready;
        }

        const pretext = await import('@chenglou/pretext');
        if (resume.language) {
          pretext.setLocale(resume.language.startsWith('zh') ? 'zh' : 'en');
        }
        const estimate = estimateClassicPages(pretext, resume);
        if (!cancelled) {
          setState({ loading: false, estimate });
        }
      } catch {
        if (!cancelled) {
          setState({ loading: false, estimate: null });
        }
      }
    };

    run();

    return () => {
      cancelled = true;
    };
  }, [resume]);

  return state;
}
