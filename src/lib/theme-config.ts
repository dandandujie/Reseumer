import type { ThemeFontSize } from '@/types/resume';

export const DEFAULT_THEME_FONT_SIZE = 14;
export const MIN_THEME_FONT_SIZE = 10;
export const MAX_THEME_FONT_SIZE = 20;

const LEGACY_FONT_SIZE_MAP: Record<'small' | 'medium' | 'large', number> = {
  small: 12,
  medium: 14,
  large: 16,
};

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

export function resolveThemeFontSize(fontSize?: ThemeFontSize): number {
  if (typeof fontSize === 'number' && Number.isFinite(fontSize)) {
    return clamp(fontSize, MIN_THEME_FONT_SIZE, MAX_THEME_FONT_SIZE);
  }

  if (typeof fontSize === 'string' && fontSize in LEGACY_FONT_SIZE_MAP) {
    return LEGACY_FONT_SIZE_MAP[fontSize as keyof typeof LEGACY_FONT_SIZE_MAP];
  }

  return DEFAULT_THEME_FONT_SIZE;
}

export function resolveCssFontScale(fontSize?: ThemeFontSize) {
  const body = resolveThemeFontSize(fontSize);

  return {
    body: `${body}px`,
    h1: `${body * 2 - 2}px`,
    h2: `${body + 3}px`,
    h3: `${body + 1}px`,
  };
}

export function resolveDocxFontScale(fontSize?: ThemeFontSize) {
  const bodyPx = resolveThemeFontSize(fontSize);

  return {
    body: Math.round(bodyPx + 8),
    h1: Math.round(bodyPx * 2 + 12),
    h2: Math.round(bodyPx + 12),
    h3: Math.round(bodyPx + 10),
  };
}

export function resolveDocxEastAsiaFont(fontFamily?: string): string {
  if (
    fontFamily === 'SimSun'
    || fontFamily === 'Microsoft YaHei'
    || fontFamily === 'KaiTi'
    || fontFamily === 'LXGW WenKai'
  ) {
    return fontFamily;
  }

  return 'Microsoft YaHei';
}

export const THEME_FONT_OPTIONS = [
  { value: 'Inter', label: 'Inter' },
  { value: 'Georgia', label: 'Georgia' },
  { value: 'Helvetica', label: 'Helvetica' },
  { value: 'Arial', label: 'Arial' },
  { value: 'Palatino', label: 'Palatino' },
  { value: 'Verdana', label: 'Verdana' },
  { value: 'Times New Roman', label: 'Times New Roman' },
  { value: 'Garamond', label: 'Garamond' },
  { value: 'Courier New', label: 'Courier New' },
  { value: 'SimSun', label: '宋体' },
  { value: 'Microsoft YaHei', label: '微软雅黑' },
  { value: 'KaiTi', label: '楷体' },
  { value: 'LXGW WenKai', label: '霞鹜文楷' },
] as const;

const FONT_CSS_STACKS: Record<string, string> = {
  Inter: "'Inter', 'Noto Sans SC', sans-serif",
  Georgia: "'Georgia', 'Noto Serif SC', 'Noto Sans SC', serif",
  Helvetica: "'Helvetica', 'Arial', 'Noto Sans SC', sans-serif",
  Arial: "'Arial', 'Noto Sans SC', sans-serif",
  Palatino: "'Palatino', 'Palatino Linotype', 'Noto Serif SC', serif",
  Verdana: "'Verdana', 'Noto Sans SC', sans-serif",
  'Times New Roman': "'Times New Roman', 'Noto Serif SC', serif",
  Garamond: "'Garamond', 'Noto Serif SC', serif",
  'Courier New': "'Courier New', monospace",
  SimSun: "'SimSun', 'Songti SC', 'Noto Serif SC', serif",
  'Microsoft YaHei': "'Microsoft YaHei', 'PingFang SC', 'Noto Sans SC', sans-serif",
  KaiTi: "'KaiTi', 'Kaiti SC', 'STKaiti', 'Noto Serif SC', serif",
  'LXGW WenKai': "'LXGW WenKai', 'KaiTi', 'Kaiti SC', 'Noto Serif SC', serif",
};

export function resolveThemeFontStack(fontFamily?: string): string {
  return FONT_CSS_STACKS[fontFamily || ''] || "'Inter', 'Noto Sans SC', sans-serif";
}

// Font families the user picks that render as CJK serif (宋体) vs kai (楷体).
// Everything else falls back to the sans (黑体/雅黑) bundle.
const EXPORT_SERIF_FONTS = new Set(['Georgia', 'Palatino', 'Times New Roman', 'Garamond', 'SimSun']);
const EXPORT_KAI_FONTS = new Set(['KaiTi', 'LXGW WenKai']);
const EXPORT_MONO_FONTS = new Set(['Courier New']);

/**
 * Font stack used ONLY for PDF/HTML export. Unlike the on-screen stack, this
 * puts a LOCALLY-BUNDLED, embeddable font FIRST ('Reseumer Hei/Song/Kai',
 * provided via @font-face injected by the Rust exporter). Rationale:
 *  - Guarantees the PDF embeds a real TrueType/CFF font instead of an
 *    un-embeddable OS system font → no more uneditable "Type3" PDFs.
 *  - Works fully offline (no dependency on Google Fonts, which is often
 *    blocked/slow), and renders identically on Windows and macOS.
 * The chosen family still tracks the user's serif/kai/sans intent.
 */
export function resolveExportFontStack(fontFamily?: string): string {
  const ff = fontFamily || '';
  if (EXPORT_KAI_FONTS.has(ff)) return "'Reseumer Kai', 'Reseumer Song', 'Reseumer Hei', serif";
  if (EXPORT_SERIF_FONTS.has(ff)) return "'Reseumer Song', 'Reseumer Hei', serif";
  if (EXPORT_MONO_FONTS.has(ff)) return "'Courier New', 'Reseumer Hei', monospace";
  return "'Reseumer Hei', sans-serif";
}

export const WEBFONT_STYLESHEETS = [
  'https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&family=Noto+Sans+SC:wght@300;400;500;600;700&family=Noto+Serif+SC:wght@400;500;600;700&display=swap',
  'https://cdnjs.cloudflare.com/ajax/libs/lxgw-wenkai-webfont/1.7.0/style.min.css',
] as const;
