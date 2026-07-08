'use client';

import { useId } from 'react';
import type { Resume, ResumeSection, ThemeConfig } from '@/types/resume';
import { DEFAULT_THEME_FONT_SIZE, resolveCssFontScale, resolveThemeFontStack, WEBFONT_STYLESHEETS } from '@/lib/theme-config';
import { ClassicTemplate } from './templates/classic';
import { ModernTemplate } from './templates/modern';

interface ResumePreviewProps {
  resume: Resume;
  interactive?: boolean;
  onReorderSections?: (sections: ResumeSection[]) => void;
}

const DEFAULT_THEME: ThemeConfig = {
  primaryColor: '#1c1a17',
  accentColor: '#1c1a17',
  fontFamily: 'Georgia',
  fontSize: DEFAULT_THEME_FONT_SIZE,
  lineSpacing: 1.5,
  margin: { top: 20, right: 20, bottom: 20, left: 20 },
  sectionSpacing: 8,
  avatarStyle: 'oneInch',
};

/** Returns true if a hex colour is dark (luminance < 0.4) */
function isDark(hex: string): boolean {
  const c = hex.replace('#', '');
  const r = parseInt(c.substring(0, 2), 16) / 255;
  const g = parseInt(c.substring(2, 4), 16) / 255;
  const b = parseInt(c.substring(4, 6), 16) / 255;
  const luminance = 0.299 * r + 0.587 * g + 0.114 * b;
  return luminance < 0.4;
}

function buildThemeCSS(scopeId: string, theme: ThemeConfig): string {
  const s = `[data-theme-scope="${scopeId}"]`;
  const fs = resolveCssFontScale(theme.fontSize);
  const m = theme.margin;
  const primaryIsDark = isDark(theme.primaryColor);

  return `
    ${s} > div {
      font-family: ${resolveThemeFontStack(theme.fontFamily)} !important;
      line-height: ${theme.lineSpacing} !important;
      padding-top: ${m.top}px !important;
      padding-right: ${m.right}px !important;
      padding-bottom: ${m.bottom}px !important;
      padding-left: ${m.left}px !important;
      --base-body-size: ${fs.body};
      --base-h1-size: ${fs.h1};
      --base-h2-size: ${fs.h2};
      --base-h3-size: ${fs.h3};
      --base-line-spacing: ${theme.lineSpacing};
      --base-section-spacing: ${theme.sectionSpacing}px;
      --base-margin-top: ${m.top}px;
      --base-margin-right: ${m.right}px;
      --base-margin-bottom: ${m.bottom}px;
      --base-margin-left: ${m.left}px;
    }
    ${s} p, ${s} li, ${s} span, ${s} td, ${s} a, ${s} div {
      font-size: ${fs.body} !important;
      line-height: ${theme.lineSpacing} !important;
    }
    ${s} h1:not([style*="color"]) {
      color: ${theme.primaryColor} !important;
      font-size: ${fs.h1} !important;
      line-height: ${theme.lineSpacing} !important;
    }
    ${s} h1[style*="color"] {
      font-size: ${fs.h1} !important;
      line-height: ${theme.lineSpacing} !important;
    }
    ${s} h2:not([style*="color"]) {
      color: ${theme.primaryColor} !important;
      font-size: ${fs.h2} !important;
      line-height: ${theme.lineSpacing} !important;
      border-color: ${theme.accentColor} !important;
    }
    ${s} h2[style*="color"] {
      font-size: ${fs.h2} !important;
      line-height: ${theme.lineSpacing} !important;
      border-color: ${theme.accentColor} !important;
    }
    ${s} h3:not([style*="color"]) {
      color: ${theme.primaryColor} !important;
      font-size: ${fs.h3} !important;
      line-height: ${theme.lineSpacing} !important;
    }
    ${s} h3[style*="color"] {
      font-size: ${fs.h3} !important;
      line-height: ${theme.lineSpacing} !important;
    }
    ${s} [class*="border-b-2"],
    ${s} [class*="border-b-"] {
      border-color: ${theme.accentColor} !important;
    }
    ${s} [class*="bg-blue-"], ${s} [class*="bg-indigo-"],
    ${s} [class*="bg-slate-800"], ${s} [class*="bg-zinc-800"],
    ${s} [class*="bg-teal-"], ${s} [class*="bg-emerald-"] {
      background-color: ${theme.accentColor} !important;
    }
    ${s} [data-section] {
      margin-bottom: ${theme.sectionSpacing}px !important;
    }
    ${primaryIsDark ? `
    ${s} [style*="background"][style*="#"] h1:not([style*="color"]),
    ${s} [style*="background"][style*="#"] h2:not([style*="color"]),
    ${s} [style*="background"][style*="#"] h3:not([style*="color"]),
    ${s} [style*="background"][style*="rgb"] h1:not([style*="color"]),
    ${s} [style*="background"][style*="rgb"] h2:not([style*="color"]),
    ${s} [style*="background"][style*="rgb"] h3:not([style*="color"]),
    ${s} [style*="background"][style*="linear-gradient"] h1:not([style*="color"]),
    ${s} [style*="background"][style*="linear-gradient"] h2:not([style*="color"]),
    ${s} [style*="background"][style*="linear-gradient"] h3:not([style*="color"]),
    ${s} .bg-black h1:not([style*="color"]),
    ${s} .bg-black h2:not([style*="color"]),
    ${s} .bg-black h3:not([style*="color"]) {
      color: #ffffff !important;
    }` : ''}
  `;
}

export function ResumePreview({ resume, interactive, onReorderSections }: ResumePreviewProps) {
  const scopeId = useId();
  const theme: ThemeConfig = { ...DEFAULT_THEME, ...(resume.themeConfig || {}) };

  // Defensive: ensure resume.sections is always an array (AI may return invalid/empty data)
  const safeResume = resume.sections ? resume : { ...resume, sections: [] };

  // Select template component based on resume.template
  const TemplateComponent = (() => {
    switch (resume.template) {
      case 'modern':
        return ModernTemplate;
      case 'classic':
      default:
        return ClassicTemplate;
    }
  })();

  return (
    <>
      {/* Load the same Google Fonts used in PDF/HTML export so preview renders
          with identical font metrics (Inter for Latin, Noto Sans SC for CJK). */}
      <link rel="preconnect" href="https://fonts.googleapis.com" />
      <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
      <link rel="preconnect" href="https://cdnjs.cloudflare.com" crossOrigin="" />
      {WEBFONT_STYLESHEETS.map((href) => (
        <link key={href} href={href} rel="stylesheet" />
      ))}
      <div data-theme-scope={scopeId}>
        <style dangerouslySetInnerHTML={{ __html: buildThemeCSS(scopeId, theme) }} />
        <TemplateComponent resume={safeResume} interactive={interactive} onReorderSections={onReorderSections} />
      </div>
    </>
  );
}
