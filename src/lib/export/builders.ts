import { esc, buildExportThemeCSS, DEFAULT_THEME, type ResumeWithSections } from './utils';
import { WEBFONT_STYLESHEETS } from '@/lib/theme-config';
import { EXPORT_TAILWIND_CSS } from '@/lib/pdf/export-tailwind-css';
import { generateQrSvg, isValidQrUrl } from '@/lib/qrcode';
import { buildClassicHtml } from './templates/classic';

/** Pre-generate QR code SVGs and attach to qr_codes section content
 *  so sync template builders can render them inline. */
async function preGenerateQrSvgs(resume: ResumeWithSections): Promise<void> {
  const qrSection = resume.sections.find((s: any) => s.type === 'qr_codes');
  if (!qrSection || qrSection.visible === false) return;
  const items = ((qrSection.content as any).items || []).filter((q: any) => isValidQrUrl(q.url));
  if (items.length === 0) return;
  const svgs: Record<string, string> = {};
  for (const qr of items) {
    try { svgs[qr.id] = await generateQrSvg(qr.url, 80); } catch { /* skip */ }
  }
  (qrSection.content as any)._qrSvgs = svgs;
}

export async function generateHtml(resume: ResumeWithSections, forPdf = false): Promise<string> {
  const exportResume = { ...resume, template: 'classic' as const };

  // Pre-generate QR SVGs so sync template builders can use them
  await preGenerateQrSvgs(exportResume);
  const bodyHtml = buildClassicHtml(exportResume);
  const theme = { ...DEFAULT_THEME, ...((exportResume as any).themeConfig || {}) };
  const themeCSS = buildExportThemeCSS(theme);
  const pxToMm = (px: number) => Math.round((px / 3.78) * 10) / 10;
  const pageMarginTop = pxToMm(theme.margin.top);
  const pageMarginBottom = pxToMm(theme.margin.bottom);

  const pdfOverrides = forPdf
    ? `/* Page margins and fragmentation */
       @page { margin: ${pageMarginTop}mm 0 ${pageMarginBottom}mm 0; }
       html, body { background: white !important; padding: 0 !important; margin: 0 !important; display: block !important; min-height: 100%; }
       .resume-export { width: 100%; }
       .resume-export > div { box-shadow: none !important; overflow: visible !important; padding-top: 0 !important; padding-bottom: 0 !important; background: white !important; }
       /* Smart pagination: allow sections to break across pages, keep individual items together.
          overflow:visible is critical — Chrome treats overflow:hidden as monolithic (no page fragmentation). */
       [data-section] { break-inside: auto !important; overflow: visible !important; }
       [data-section] * { overflow: visible !important; }
       [data-section] [class*="space-y"] { break-inside: auto !important; }
       [data-section] [class*="space-y"] > div, .item { break-inside: avoid !important; }
       h2, h3 { break-after: avoid !important; }
       p { orphans: 3; widows: 3; }`
    : '';

  return `<!DOCTYPE html>
<html lang="${esc(exportResume.language || 'en')}">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${esc(exportResume.title)}</title>
  <style>${EXPORT_TAILWIND_CSS}</style>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link rel="preconnect" href="https://cdnjs.cloudflare.com" crossorigin>
  ${WEBFONT_STYLESHEETS.map((href) => `<link href="${href}" rel="stylesheet">`).join('\n  ')}
  <style>
    body { margin: 0; display: flex; justify-content: center; padding: 40px 20px; background: #f4f4f5; min-height: 100vh; }
    @media print { body { padding: 0 !important; background: white !important; } .resume-export > div { box-shadow: none !important; } }
    ${themeCSS}
    ${pdfOverrides}
    /* Tailwind v4 uses calc(infinity * 1px) for rounded-full which may fail
       in some Chromium PDF rendering — use safe 9999px fallback */
    .resume-export .rounded-full { border-radius: 9999px !important; }
    /* Avatar style overrides — export templates hardcode rounded-full + equal w/h.
       Override to match the preview's AvatarImage component for each style. */
    /* oneInch: portrait rectangle (5:7) with small radius */
    .resume-export[data-avatar-style="oneInch"] img[class*="object-cover"] {
      border-radius: 4px !important;
      aspect-ratio: 5 / 7 !important;
      height: auto !important;
      max-height: none !important;
    }
    .resume-export[data-avatar-style="oneInch"] div:has(> img[class*="object-cover"]) {
      border-radius: 4px !important;
      height: auto !important;
      overflow: hidden !important;
    }
    /* circle: equal w/h with full rounding — use 9999px as safe fallback
       for Tailwind v4's calc(infinity * 1px) which may fail in some Chromium builds */
    .resume-export[data-avatar-style="circle"] img[class*="object-cover"] {
      border-radius: 9999px !important;
      aspect-ratio: 1 / 1 !important;
    }
    .resume-export[data-avatar-style="circle"] div:has(> img[class*="object-cover"]) {
      border-radius: 9999px !important;
      overflow: hidden !important;
    }
  </style>
</head>
<body>
  <div class="resume-export" data-avatar-style="${esc((exportResume as any).themeConfig?.avatarStyle || 'oneInch')}">
    ${bodyHtml}
  </div>
</body>
</html>`;
}
