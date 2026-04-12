'use client';

import { Sparkles, Loader2 } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { useResumeStore } from '@/stores/resume-store';
import { calculateOptimalFit } from '@/lib/pretext-classic-estimate';

export function SmartFitButton() {
  const t = useTranslations('editor');
  const { currentResume, sections, updateThemeConfig } = useResumeStore();
  const [isCalculating, setIsCalculating] = useState(false);

  const handleSmartFit = async () => {
    if (!currentResume) return;
    
    setIsCalculating(true);
    try {
      const pretext = await import('@chenglou/pretext');
      if (currentResume.language) {
        pretext.setLocale(currentResume.language.startsWith('zh') ? 'zh' : 'en');
      }

      const liveResume = { ...currentResume, sections };
      const optimalTheme = calculateOptimalFit(pretext, liveResume);

      if (optimalTheme) {
        updateThemeConfig(optimalTheme);
        toast.success(t('toolbar.smartFitSuccess') || '已为您智能排版至单页最优状态');
      } else {
        toast.error(t('toolbar.smartFitFailed') || '内容过多，建议删减工作经历或项目细节');
      }
    } catch (err) {
      console.error(err);
      toast.error('智能排版失败');
    } finally {
      setIsCalculating(false);
    }
  };

  return (
    <Button 
      onClick={handleSmartFit} 
      variant="ghost" 
      size="sm" 
      className="cursor-pointer text-brand hover:text-brand hover:bg-brand-muted"
      disabled={isCalculating}
      title="一键智能单页"
    >
      {isCalculating ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : (
        <Sparkles className="h-4 w-4" />
      )}
      <span className="ml-1 text-xs hidden sm:inline">智能排版</span>
    </Button>
  );
}
