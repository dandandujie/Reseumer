'use client';

/**
 * A lightweight, at-a-glance mini-mock of each resume template's LAYOUT, shown
 * in the template pickers so users see the structure without having to try each
 * one. Not a live render — a fast structural preview (dark sidebar, accent band,
 * tinted rail, single column) that mirrors the real templates.
 */
const ACCENT = '#6366f1';

function Bar({ w = '100%', c = 'bg-zinc-300/90' }: { w?: string; c?: string }) {
  return <div className={`h-[3px] rounded-full ${c}`} style={{ width: w }} />;
}

function Block({ light }: { light?: boolean }) {
  return (
    <div className="space-y-[3px]">
      <div className="mb-1 h-[4px] w-8 rounded-full" style={{ background: light ? 'rgba(255,255,255,0.7)' : ACCENT }} />
      <Bar w="100%" c={light ? 'bg-white/30' : 'bg-zinc-300/90'} />
      <Bar w="85%" c={light ? 'bg-white/30' : 'bg-zinc-300/90'} />
    </div>
  );
}

export function TemplateThumbnail({ template }: { template: string }) {
  const shell = 'aspect-[3/4] w-full overflow-hidden rounded-md border border-zinc-200 bg-white shadow-sm';

  if (template === 'modern') {
    return (
      <div className={`${shell} flex`}>
        <div className="flex w-[38%] flex-col gap-2 p-2" style={{ background: 'linear-gradient(160deg,#1e293b,#0f172a)' }}>
          <div className="mx-auto mt-1 h-5 w-5 rounded-full bg-white/25" />
          <div className="mx-auto h-[4px] w-10 rounded-full bg-white/80" />
          <div className="mt-2 space-y-2">
            <Block light /><Block light />
          </div>
        </div>
        <div className="flex-1 space-y-2 p-2">
          <Block /><Block /><Block />
        </div>
      </div>
    );
  }

  // classic (default): centered header + single column
  return (
    <div className={`${shell} p-2`}>
      <div className="mx-auto mb-2 w-2/3 space-y-1 border-b border-zinc-300 pb-1.5 text-center">
        <div className="mx-auto h-[5px] w-12 rounded-full bg-zinc-500" />
        <div className="mx-auto h-[3px] w-8 rounded-full bg-zinc-300" />
      </div>
      <div className="space-y-2"><Block /><Block /><Block /></div>
    </div>
  );
}

export const TEMPLATE_OPTIONS: { id: string; name: string; descZh: string; descEn: string }[] = [
  { id: 'classic', name: 'Classic', descZh: '经典单栏排版，稳重通用', descEn: 'Classic single column, versatile' },
  { id: 'modern', name: 'Modern', descZh: '现代双栏，深色侧边栏', descEn: 'Two-column with dark sidebar' },
];
