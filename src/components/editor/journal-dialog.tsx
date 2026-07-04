'use client';

import { useEffect, useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { BookOpenCheck, Briefcase, MessageSquare, CheckCircle2, ChevronLeft, ChevronRight, Trash2, X } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  useJournalStore,
  CHANNEL_PRESETS,
  type JournalEntry,
  type JournalEntryType,
  type ApplicationEntry,
  type ApplicationStatus,
  type InterviewEntry,
  type OutcomeEntry,
  type DebriefEntry,
} from '@/stores/journal-store';
import { cn } from '@/lib/utils';

interface JournalDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  resumeId: string;
}

const STATUS_KEYS: ApplicationStatus[] = [
  'submitted',
  'screening',
  'interview',
  'offer',
  'rejected',
  'declined',
  'ghosted',
];

const OUTCOME_KEYS = ['offer', 'rejected', 'withdrew', 'ghosted'] as const;
const FORMAT_KEYS = ['phone', 'video', 'onsite', 'take-home'] as const;

const TAB_META: Record<
  JournalEntryType,
  { icon: typeof Briefcase; labelKey: string; emptyKey: string; templateKey: string; hintKey: string }
> = {
  application: {
    icon: Briefcase,
    labelKey: 'tabApplication',
    emptyKey: 'emptyApplication',
    templateKey: 'templateApplicationTitle',
    hintKey: 'templateApplicationHint',
  },
  interview: {
    icon: MessageSquare,
    labelKey: 'tabInterview',
    emptyKey: 'emptyInterview',
    templateKey: 'templateInterviewTitle',
    hintKey: 'templateInterviewHint',
  },
  outcome: {
    icon: CheckCircle2,
    labelKey: 'tabOutcome',
    emptyKey: 'emptyOutcome',
    templateKey: 'templateOutcomeTitle',
    hintKey: 'templateOutcomeHint',
  },
  debrief: {
    icon: BookOpenCheck,
    labelKey: 'tabDebrief',
    emptyKey: 'emptyDebrief',
    templateKey: 'templateDebriefTitle',
    hintKey: 'templateDebriefHint',
  },
};

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

export function JournalDialog({ open, onOpenChange, resumeId }: JournalDialogProps) {
  const t = useTranslations('journal');
  const hydrate = useJournalStore((s) => s.hydrate);
  const allByResume = useJournalStore((s) => s.byResume);
  const [tab, setTab] = useState<JournalEntryType>('application');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [timelineOpen, setTimelineOpen] = useState(false);

  useEffect(() => {
    if (open) {
      hydrate();
      setEditingId(null);
    }
  }, [open, hydrate]);

  const entries = useMemo(() => {
    const list = allByResume[resumeId] || [];
    return [...list].sort((a, b) => b.createdAt - a.createdAt);
  }, [allByResume, resumeId]);

  const entriesForTab = entries.filter((e) => e.type === tab);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[calc(100vh-2rem)] max-w-4xl gap-0 overflow-hidden border-[var(--whale-divider)] bg-[var(--whale-card)] p-0">
        <DialogHeader className="border-b border-[var(--whale-divider)] bg-[var(--whale-sidebar)] px-5 py-4">
          <div className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-[var(--whale-ink)]">
              <BookOpenCheck className="h-4 w-4 text-[var(--whale-cream)]" />
            </span>
            <div>
              <DialogTitle className="text-sm font-bold text-[var(--whale-ink)]">
                {t('title')}
              </DialogTitle>
              <p className="text-[11px] text-[var(--whale-ink-muted)]">{t('subtitle')}</p>
            </div>
          </div>
        </DialogHeader>

        <Tabs value={tab} onValueChange={(v) => { setTab(v as JournalEntryType); setEditingId(null); }} className="flex h-[min(660px,calc(100vh-10rem))] min-h-[460px] flex-col">
          <div className="shrink-0 border-b border-[var(--whale-divider)] px-5 py-3">
            <TabsList className="h-9 bg-[var(--whale-cream-soft)] p-0.5">
              {(Object.keys(TAB_META) as JournalEntryType[]).map((k) => {
                const meta = TAB_META[k];
                const Icon = meta.icon;
                return (
                  <TabsTrigger
                    key={k}
                    value={k}
                    className="cursor-pointer gap-1.5 rounded-md px-3 text-[12px] data-[state=active]:bg-[var(--whale-card)] data-[state=active]:text-[var(--whale-ink)] data-[state=active]:shadow-sm"
                  >
                    <Icon className="h-3.5 w-3.5" />
                    {t(meta.labelKey)}
                  </TabsTrigger>
                );
              })}
            </TabsList>
          </div>

          {(Object.keys(TAB_META) as JournalEntryType[]).map((k) => (
            <TabsContent key={k} value={k} className="flex-1 min-h-0 overflow-hidden">
              <div
                className={cn(
                  'grid h-full min-h-0 grid-cols-1 transition-[grid-template-columns] duration-200 md:grid-cols-[92px_1fr]',
                  timelineOpen && 'md:grid-cols-[280px_1fr]'
                )}
              >
                <EntriesList
                  type={k}
                  entries={entriesForTab}
                  editingId={editingId}
                  expanded={timelineOpen}
                  onToggleExpanded={() => setTimelineOpen((value) => !value)}
                  onEdit={(id) => setEditingId(id)}
                />
                <div className="min-h-0 border-l border-[var(--whale-divider)] bg-[var(--whale-cream-soft)]">
                  <NewEntryPane
                    type={k}
                    resumeId={resumeId}
                    editing={editingId ? entries.find((e) => e.id === editingId && e.type === k) : null}
                    onDone={() => setEditingId(null)}
                  />
                </div>
              </div>
            </TabsContent>
          ))}
        </Tabs>

        <div className="border-t border-[var(--whale-divider)] bg-[var(--whale-sidebar)] px-5 py-2 text-[10px] leading-none text-[var(--whale-ink-muted)]">{t('knowledgeBaseHint')}</div>
      </DialogContent>
    </Dialog>
  );
}

function EntriesList({
  type,
  entries,
  editingId,
  expanded,
  onToggleExpanded,
  onEdit,
}: {
  type: JournalEntryType;
  entries: JournalEntry[];
  editingId: string | null;
  expanded: boolean;
  onToggleExpanded: () => void;
  onEdit: (id: string) => void;
}) {
  const t = useTranslations('journal');
  const remove = useJournalStore((s) => s.remove);

  if (entries.length === 0) {
    return (
      <div className="flex h-full flex-col border-r border-[var(--whale-divider)] bg-[var(--whale-card)]">
        <div className={cn('flex items-center border-b border-[var(--whale-divider)] px-3 py-3', expanded ? 'justify-between' : 'justify-center')}>
          {expanded && <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--whale-ink-muted)]">{t('timeline')}</p>}
          <button
            type="button"
            onClick={onToggleExpanded}
            className="inline-flex h-7 w-7 cursor-pointer items-center justify-center rounded-md text-[var(--whale-ink-muted)] hover:bg-[var(--whale-cream-soft)] hover:text-[var(--whale-ink)]"
            title={t('timeline')}
          >
            {expanded ? <ChevronLeft className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
          </button>
        </div>
        <div className={cn('flex flex-1 px-3 py-4', expanded ? 'items-end justify-start' : 'items-center justify-center')}>
          <p className={cn('text-[12px] leading-relaxed text-[var(--whale-ink-muted)]', !expanded && 'text-center text-[11px]')}>
            {expanded ? t(TAB_META[type].emptyKey) : t('timelineEmpty')}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col border-r border-[var(--whale-divider)] bg-[var(--whale-card)]">
      <div className={cn('flex shrink-0 items-center border-b border-[var(--whale-divider)] px-3 py-3', expanded ? 'justify-between' : 'justify-center')}>
        {expanded && <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--whale-ink-muted)]">{t('timeline')}</p>}
        <button
          type="button"
          onClick={onToggleExpanded}
          className="inline-flex h-7 w-7 cursor-pointer items-center justify-center rounded-md text-[var(--whale-ink-muted)] hover:bg-[var(--whale-cream-soft)] hover:text-[var(--whale-ink)]"
          title={t('timeline')}
        >
          {expanded ? <ChevronLeft className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
        </button>
      </div>
      <ScrollArea className="min-h-0 flex-1">
        <div className={cn('space-y-1 py-3', expanded ? 'px-3' : 'px-2')}>
        {entries.map((e) => (
          <div
            key={e.id}
            role="button"
            tabIndex={0}
            className={cn(
              'group relative w-full cursor-pointer rounded-lg border text-left transition-colors before:absolute before:rounded-full',
              expanded
                ? 'py-2 pl-4 pr-2 before:left-2 before:top-4 before:h-1.5 before:w-1.5'
                : 'flex h-[58px] items-center justify-center px-1 before:left-1/2 before:top-1.5 before:h-1 before:w-1 before:-translate-x-1/2',
              editingId === e.id
                ? 'border-[var(--whale-ink)] bg-[var(--whale-cream-soft)] before:bg-[var(--whale-ink)]'
                : 'border-transparent bg-transparent before:bg-[var(--whale-divider)] hover:bg-[var(--whale-cream-soft)] hover:before:bg-[var(--whale-ink-muted)]'
            )}
            onClick={() => onEdit(e.id)}
            onKeyDown={(ev) => {
              if (ev.key === 'Enter' || ev.key === ' ') {
                ev.preventDefault();
                onEdit(e.id);
              }
            }}
          >
            {expanded ? <EntrySummary entry={e} /> : <CompactEntrySummary entry={e} />}
            {expanded && (
              <div className="mt-1 flex items-center justify-between gap-2 text-[10px] text-[var(--whale-ink-muted)]">
                <time className="truncate">{new Date(e.createdAt).toLocaleString()}</time>
                <button
                  type="button"
                  onClick={(ev) => {
                    ev.stopPropagation();
                    remove(e.id);
                    toast.success(t('delete'));
                  }}
                  className="inline-flex shrink-0 cursor-pointer items-center gap-1 rounded p-0.5 text-[var(--whale-ink-muted)] opacity-0 transition-opacity hover:text-red-500 group-hover:opacity-100"
                >
                  <Trash2 className="h-3 w-3" />
                </button>
              </div>
            )}
          </div>
        ))}
        </div>
      </ScrollArea>
    </div>
  );
}

function CompactEntrySummary({ entry }: { entry: JournalEntry }) {
  const keyword = compactEntryKeyword(entry);
  const date = compactEntryDate(entry);

  return (
    <div className="flex w-full flex-col items-center gap-0.5 text-center">
      <time className="text-[10px] font-semibold tabular-nums text-[var(--whale-ink)]">{date}</time>
      <span className="line-clamp-2 max-w-[68px] text-[10px] leading-tight text-[var(--whale-ink-muted)]">
        {keyword}
      </span>
    </div>
  );
}

/** One-click status switcher — advance an application without opening the form. */
export function StatusQuickPill({ entry }: { entry: ApplicationEntry }) {
  const t = useTranslations('journal');
  const update = useJournalStore((s) => s.update);
  return (
    <Select
      value={entry.status}
      onValueChange={(v) => {
        update(entry.id, { status: v as ApplicationStatus });
        toast.success(t('statusUpdated'));
      }}
    >
      <SelectTrigger
        size="sm"
        onClick={(e) => e.stopPropagation()}
        onPointerDown={(e) => e.stopPropagation()}
        className="h-5 w-auto cursor-pointer gap-1 rounded-full border-transparent bg-[var(--whale-mint)]/30 px-2 py-0 text-[11px] font-medium text-[var(--whale-ink)] shadow-none data-[size=sm]:h-5"
      >
        <SelectValue />
      </SelectTrigger>
      <SelectContent onClick={(e) => e.stopPropagation()}>
        {STATUS_KEYS.map((k) => (
          <SelectItem key={k} value={k} className="cursor-pointer text-xs">
            {t(`status${cap(k)}`)}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

/** 投→面→果 thread progress, auto-linked to same-company entries. */
function ThreadProgress({ entry }: { entry: ApplicationEntry }) {
  const t = useTranslations('journal');
  const byResume = useJournalStore((s) => s.byResume);
  const company = (entry.company || '').trim();
  if (!company) return null;
  const all = Object.values(byResume).flat();
  const hasInterview =
    entry.status === 'interview' ||
    entry.status === 'offer' ||
    all.some((e) => e.type === 'interview' && (e.company || '').trim() === company);
  const outcome = all.find(
    (e): e is OutcomeEntry => e.type === 'outcome' && (e.company || '').trim() === company
  );
  const outcomeReached = !!outcome || entry.status === 'offer' || entry.status === 'rejected';
  const outcomeGood = outcome?.outcome === 'offer' || entry.status === 'offer';

  const steps = [
    { label: t('stageApplied'), reached: true, tone: 'mint' },
    { label: t('stageInterview'), reached: hasInterview, tone: 'mint' },
    { label: t('stageOutcome'), reached: outcomeReached, tone: outcomeGood ? 'mint' : 'red' },
  ];
  return (
    <div className="mt-1.5 flex items-center gap-1">
      {steps.map((s, i) => (
        <div key={s.label} className="flex items-center gap-1">
          {i > 0 && <span className={cn('h-px w-3', s.reached ? 'bg-[var(--whale-mint-deep)]/50' : 'bg-[var(--whale-divider)]')} />}
          <span
            className={cn(
              'inline-flex items-center gap-1 text-[10px]',
              s.reached
                ? s.tone === 'red'
                  ? 'font-medium text-red-500'
                  : 'font-medium text-[var(--whale-mint-deep)]'
                : 'text-[var(--whale-ink-muted)]/60'
            )}
          >
            <span
              className={cn(
                'inline-block h-1.5 w-1.5 rounded-full',
                s.reached
                  ? s.tone === 'red'
                    ? 'bg-red-400'
                    : 'bg-[var(--whale-mint-deep)]'
                  : 'bg-[var(--whale-divider)]'
              )}
            />
            {s.label}
          </span>
        </div>
      ))}
    </div>
  );
}

/** Follow-up date chip — red when overdue on an open application. */
export function FollowUpBadge({ entry }: { entry: ApplicationEntry }) {
  const t = useTranslations('journal');
  if (!entry.nextFollowUp) return null;
  const open = entry.status === 'submitted' || entry.status === 'screening' || entry.status === 'interview';
  const overdue = open && entry.nextFollowUp < new Date().toISOString().slice(0, 10);
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-medium',
        overdue
          ? 'bg-red-50 text-red-600'
          : 'bg-[var(--whale-cream-deep)] text-[var(--whale-ink-soft)]'
      )}
    >
      {overdue ? t('followUpOverdue') : t('followUpDue')} {entry.nextFollowUp.slice(5)}
    </span>
  );
}

function EntrySummary({ entry }: { entry: JournalEntry }) {
  const t = useTranslations('journal');
  if (entry.type === 'application') {
    return (
      <>
        <div className="flex items-center gap-1.5 text-[12px] font-semibold text-[var(--whale-ink)]">
          <span className="truncate">{entry.company || '—'}</span>
          <span className="text-[var(--whale-ink-muted)]">·</span>
          <span className="truncate text-[var(--whale-ink-soft)]">{entry.role || '—'}</span>
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px]">
          <StatusQuickPill entry={entry} />
          {entry.channel && <Pill subtle>{entry.channel}</Pill>}
          {entry.date && <span className="text-[var(--whale-ink-muted)]">{entry.date}</span>}
          <FollowUpBadge entry={entry} />
        </div>
        <ThreadProgress entry={entry} />
        {entry.notes && (
          <p className="mt-1 line-clamp-2 text-[11px] text-[var(--whale-ink-muted)]">{entry.notes}</p>
        )}
      </>
    );
  }
  if (entry.type === 'interview') {
    return (
      <>
        <div className="flex items-center gap-1.5 text-[12px] font-semibold text-[var(--whale-ink)]">
          <span className="truncate">{entry.company || '—'}</span>
          <span className="text-[var(--whale-ink-muted)]">·</span>
          <span className="truncate text-[var(--whale-ink-soft)]">{entry.round || '—'}</span>
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px]">
          {entry.date && <span className="text-[var(--whale-ink-muted)]">{entry.date}</span>}
          {entry.format && <Pill subtle>{t(`format${cap(entry.format.replace('-', ''))}`)}</Pill>}
        </div>
        {entry.topics && (
          <p className="mt-1 line-clamp-2 text-[11px] text-[var(--whale-ink-muted)]">{entry.topics}</p>
        )}
      </>
    );
  }
  if (entry.type === 'outcome') {
    const tone = entry.outcome === 'offer' ? 'mint' : entry.outcome === 'rejected' ? 'red' : 'subtle';
    return (
      <>
        <div className="flex items-center gap-1.5 text-[12px] font-semibold text-[var(--whale-ink)]">
          <span className="truncate">{entry.company || '—'}</span>
          <span className="text-[var(--whale-ink-muted)]">·</span>
          <span className="truncate text-[var(--whale-ink-soft)]">{entry.role || '—'}</span>
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px]">
          <Pill tone={tone}>{t(`outcome${cap(entry.outcome)}`)}</Pill>
        </div>
        {(entry.reason || entry.reflection) && (
          <p className="mt-1 line-clamp-2 text-[11px] text-[var(--whale-ink-muted)]">
            {[entry.reason, entry.reflection].filter(Boolean).join(' · ')}
          </p>
        )}
      </>
    );
  }
  // debrief
  return (
    <>
      <div className="truncate text-[12px] font-semibold text-[var(--whale-ink)]">{entry.title || '—'}</div>
      {entry.improvements && (
        <p className="mt-1 line-clamp-2 text-[11px] text-[var(--whale-ink-muted)]">{entry.improvements}</p>
      )}
    </>
  );
}

function Pill({ children, subtle, tone }: { children: React.ReactNode; subtle?: boolean; tone?: 'mint' | 'red' | 'subtle' }) {
  if (tone === 'mint') {
    return <span className="rounded-full bg-[var(--whale-mint)]/40 px-1.5 py-0.5 font-medium text-[var(--whale-ink)]">{children}</span>;
  }
  if (tone === 'red') {
    return <span className="rounded-full bg-red-100 px-1.5 py-0.5 font-medium text-red-700">{children}</span>;
  }
  if (subtle || tone === 'subtle') {
    return <span className="rounded-full bg-[var(--whale-cream-deep)] px-1.5 py-0.5 text-[var(--whale-ink-soft)]">{children}</span>;
  }
  return <span className="rounded-full bg-[var(--whale-ink)] px-1.5 py-0.5 font-medium text-[var(--whale-cream)]">{children}</span>;
}

function cap(s: string): string {
  if (!s) return '';
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function compactEntryDate(entry: JournalEntry): string {
  const dateText =
    entry.type === 'application' || entry.type === 'interview'
      ? entry.date
      : undefined;
  const date = dateText ? new Date(`${dateText}T00:00:00`) : new Date(entry.createdAt);
  if (Number.isNaN(date.getTime())) return new Date(entry.createdAt).toLocaleDateString();
  return date.toLocaleDateString(undefined, { month: '2-digit', day: '2-digit' });
}

function compactEntryKeyword(entry: JournalEntry): string {
  if (entry.type === 'application') {
    return entry.company || entry.role || entry.status;
  }
  if (entry.type === 'interview') {
    return entry.company || entry.round || entry.role;
  }
  if (entry.type === 'outcome') {
    return entry.company || entry.outcome || entry.role;
  }
  return entry.title || entry.improvements || '—';
}

/* ─── Right pane: new entry form ─── */

function NewEntryPane({
  type,
  resumeId,
  editing,
  onDone,
}: {
  type: JournalEntryType;
  resumeId: string;
  editing: JournalEntry | undefined | null;
  onDone: () => void;
}) {
  const t = useTranslations('journal');
  const meta = TAB_META[type];
  const Icon = meta.icon;

  return (
    <div className="flex h-full flex-col">
      <div className="shrink-0 border-b border-[var(--whale-divider)] bg-[var(--whale-card)] px-4 py-3">
        <div className="flex items-center gap-2">
          <Icon className="h-3.5 w-3.5 text-[var(--whale-ink)]" />
          <span className="text-[12px] font-semibold text-[var(--whale-ink)]">
            {editing ? t('edit') : t(meta.templateKey)}
          </span>
          {editing && (
            <button
              type="button"
              onClick={onDone}
              className="ml-auto cursor-pointer rounded p-0.5 text-[var(--whale-ink-muted)] hover:bg-[var(--whale-cream-deep)] hover:text-[var(--whale-ink)]"
            >
              <X className="h-3 w-3" />
            </button>
          )}
        </div>
        <p className="mt-0.5 text-[11px] text-[var(--whale-ink-muted)]">{t(meta.hintKey)}</p>
      </div>
      <ScrollArea className="min-h-0 flex-1">
        <div className="px-4 pb-4 pt-4">
          {type === 'application' && (
            <ApplicationForm resumeId={resumeId} editing={editing as ApplicationEntry | null | undefined} onDone={onDone} />
          )}
          {type === 'interview' && (
            <InterviewForm resumeId={resumeId} editing={editing as InterviewEntry | null | undefined} onDone={onDone} />
          )}
          {type === 'outcome' && (
            <OutcomeForm resumeId={resumeId} editing={editing as OutcomeEntry | null | undefined} onDone={onDone} />
          )}
          {type === 'debrief' && (
            <DebriefForm resumeId={resumeId} editing={editing as DebriefEntry | null | undefined} onDone={onDone} />
          )}
        </div>
      </ScrollArea>
    </div>
  );
}

function FieldRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <label className="text-[11px] font-medium uppercase tracking-wider text-[var(--whale-ink-muted)]">{label}</label>
      {children}
    </div>
  );
}

function FormActions({ onSubmit, onCancel, submitLabel }: { onSubmit: () => void; onCancel?: () => void; submitLabel: string }) {
  const t = useTranslations('journal');
  return (
    <div className="sticky bottom-0 z-10 -mx-4 mt-3 flex items-center justify-end gap-2 border-t border-[var(--whale-divider)] bg-[var(--whale-cream-soft)] px-4 py-3">
      {onCancel && (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={onCancel}
          className="cursor-pointer text-[var(--whale-ink-soft)]"
        >
          {t('cancel')}
        </Button>
      )}
      <Button
        type="button"
        size="sm"
        onClick={onSubmit}
        className="cursor-pointer bg-[var(--whale-ink)] text-[var(--whale-cream)] hover:bg-[var(--whale-ink-soft)]"
      >
        {submitLabel}
      </Button>
    </div>
  );
}

export function ApplicationForm({ resumeId, editing, onDone }: { resumeId: string; editing: ApplicationEntry | null | undefined; onDone: () => void }) {
  const t = useTranslations('journal');
  const add = useJournalStore((s) => s.add);
  const update = useJournalStore((s) => s.update);
  const [company, setCompany] = useState(editing?.company || '');
  const [role, setRole] = useState(editing?.role || '');
  const [channel, setChannel] = useState(editing?.channel || '');
  const [date, setDate] = useState(editing?.date || todayIso());
  const [status, setStatus] = useState<ApplicationStatus>(editing?.status || 'submitted');
  const [contact, setContact] = useState(editing?.contact || '');
  const [jdSnippet, setJdSnippet] = useState(editing?.jdSnippet || '');
  const [notes, setNotes] = useState(editing?.notes || '');
  const [nextFollowUp, setNextFollowUp] = useState(editing?.nextFollowUp || '');

  const reset = () => {
    setCompany(''); setRole(''); setChannel(''); setDate(todayIso());
    setStatus('submitted'); setContact(''); setJdSnippet(''); setNotes('');
    setNextFollowUp('');
  };

  const submit = () => {
    const payload = {
      type: 'application' as const,
      resumeId,
      company: company.trim(),
      role: role.trim(),
      channel: channel.trim() || undefined,
      date,
      status,
      contact: contact.trim() || undefined,
      jdSnippet: jdSnippet.trim() || undefined,
      notes: notes.trim() || undefined,
      nextFollowUp: nextFollowUp || undefined,
    };
    if (editing) {
      update(editing.id, payload);
      toast.success(t('save'));
      onDone();
    } else {
      add(payload);
      toast.success(t('save'));
      reset();
    }
  };

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2">
        <FieldRow label={t('fieldCompany')}>
          <Input value={company} onChange={(e) => setCompany(e.target.value)} className="h-8" />
        </FieldRow>
        <FieldRow label={t('fieldRole')}>
          <Input value={role} onChange={(e) => setRole(e.target.value)} className="h-8" />
        </FieldRow>
        <FieldRow label={t('fieldChannel')}>
          <Input
            value={channel}
            onChange={(e) => setChannel(e.target.value)}
            placeholder={t('fieldChannelPlaceholder')}
            className="h-8"
            list="journal-channel-presets"
          />
          <datalist id="journal-channel-presets">
            {CHANNEL_PRESETS.map((c) => (
              <option key={c} value={c} />
            ))}
          </datalist>
        </FieldRow>
        <FieldRow label={t('fieldDate')}>
          <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="h-8" />
        </FieldRow>
        <FieldRow label={t('fieldStatus')}>
          <Select value={status} onValueChange={(v) => setStatus(v as ApplicationStatus)}>
            <SelectTrigger size="sm" className="h-8 cursor-pointer">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {STATUS_KEYS.map((k) => (
                <SelectItem key={k} value={k} className="cursor-pointer text-xs">
                  {t(`status${cap(k)}`)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FieldRow>
        <FieldRow label={t('fieldContact')}>
          <Input value={contact} onChange={(e) => setContact(e.target.value)} className="h-8" />
        </FieldRow>
        <FieldRow label={t('fieldNextFollowUp')}>
          <Input type="date" value={nextFollowUp} onChange={(e) => setNextFollowUp(e.target.value)} className="h-8" />
        </FieldRow>
      </div>
      <FieldRow label={t('fieldJd')}>
        <Textarea value={jdSnippet} onChange={(e) => setJdSnippet(e.target.value)} rows={2} className="resize-none" />
      </FieldRow>
      <FieldRow label={t('fieldNotes')}>
        <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} className="resize-none" />
      </FieldRow>
      <FormActions onSubmit={submit} onCancel={editing ? onDone : undefined} submitLabel={editing ? t('save') : t('newEntry')} />
    </div>
  );
}

export function InterviewForm({ resumeId, editing, onDone }: { resumeId: string; editing: InterviewEntry | null | undefined; onDone: () => void }) {
  const t = useTranslations('journal');
  const add = useJournalStore((s) => s.add);
  const update = useJournalStore((s) => s.update);
  const [company, setCompany] = useState(editing?.company || '');
  const [role, setRole] = useState(editing?.role || '');
  const [round, setRound] = useState(editing?.round || '');
  const [date, setDate] = useState(editing?.date || todayIso());
  const [format, setFormat] = useState<InterviewEntry['format'] | undefined>(editing?.format);
  const [interviewer, setInterviewer] = useState(editing?.interviewer || '');
  const [topics, setTopics] = useState(editing?.topics || '');
  const [notes, setNotes] = useState(editing?.notes || '');

  const reset = () => {
    setCompany(''); setRole(''); setRound(''); setDate(todayIso());
    setFormat(undefined); setInterviewer(''); setTopics(''); setNotes('');
  };

  const submit = () => {
    const payload = {
      type: 'interview' as const,
      resumeId,
      company: company.trim(),
      role: role.trim(),
      round: round.trim(),
      date,
      format,
      interviewer: interviewer.trim() || undefined,
      topics: topics.trim() || undefined,
      notes: notes.trim() || undefined,
    };
    if (editing) {
      update(editing.id, payload);
      toast.success(t('save'));
      onDone();
    } else {
      add(payload);
      toast.success(t('save'));
      reset();
    }
  };

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2">
        <FieldRow label={t('fieldCompany')}>
          <Input value={company} onChange={(e) => setCompany(e.target.value)} className="h-8" />
        </FieldRow>
        <FieldRow label={t('fieldRole')}>
          <Input value={role} onChange={(e) => setRole(e.target.value)} className="h-8" />
        </FieldRow>
        <FieldRow label={t('fieldRound')}>
          <Input value={round} onChange={(e) => setRound(e.target.value)} placeholder={t('fieldRoundPlaceholder')} className="h-8" />
        </FieldRow>
        <FieldRow label={t('fieldDate')}>
          <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="h-8" />
        </FieldRow>
        <FieldRow label={t('fieldFormat')}>
          <Select value={format || ''} onValueChange={(v) => setFormat(v as InterviewEntry['format'])}>
            <SelectTrigger size="sm" className="h-8 cursor-pointer">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {FORMAT_KEYS.map((k) => (
                <SelectItem key={k} value={k} className="cursor-pointer text-xs">
                  {t(`format${cap(k.replace('-', ''))}`)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FieldRow>
        <FieldRow label={t('fieldInterviewer')}>
          <Input value={interviewer} onChange={(e) => setInterviewer(e.target.value)} className="h-8" />
        </FieldRow>
      </div>
      <FieldRow label={t('fieldTopics')}>
        <Textarea value={topics} onChange={(e) => setTopics(e.target.value)} rows={2} className="resize-none" />
      </FieldRow>
      <FieldRow label={t('fieldNotes')}>
        <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} className="resize-none" />
      </FieldRow>
      <FormActions onSubmit={submit} onCancel={editing ? onDone : undefined} submitLabel={editing ? t('save') : t('newEntry')} />
    </div>
  );
}

export function OutcomeForm({ resumeId, editing, onDone }: { resumeId: string; editing: OutcomeEntry | null | undefined; onDone: () => void }) {
  const t = useTranslations('journal');
  const add = useJournalStore((s) => s.add);
  const update = useJournalStore((s) => s.update);
  const [company, setCompany] = useState(editing?.company || '');
  const [role, setRole] = useState(editing?.role || '');
  const [outcome, setOutcome] = useState<OutcomeEntry['outcome']>(editing?.outcome || 'offer');
  const [reason, setReason] = useState(editing?.reason || '');
  const [reflection, setReflection] = useState(editing?.reflection || '');

  const submit = () => {
    const payload = {
      type: 'outcome' as const,
      resumeId,
      company: company.trim(),
      role: role.trim(),
      outcome,
      reason: reason.trim() || undefined,
      reflection: reflection.trim() || undefined,
    };
    if (editing) {
      update(editing.id, payload);
      toast.success(t('save'));
      onDone();
    } else {
      add(payload);
      toast.success(t('save'));
      setCompany(''); setRole(''); setOutcome('offer'); setReason(''); setReflection('');
    }
  };

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2">
        <FieldRow label={t('fieldCompany')}>
          <Input value={company} onChange={(e) => setCompany(e.target.value)} className="h-8" />
        </FieldRow>
        <FieldRow label={t('fieldRole')}>
          <Input value={role} onChange={(e) => setRole(e.target.value)} className="h-8" />
        </FieldRow>
      </div>
      <FieldRow label={t('fieldOutcome')}>
        <Select value={outcome} onValueChange={(v) => setOutcome(v as OutcomeEntry['outcome'])}>
          <SelectTrigger size="sm" className="h-8 cursor-pointer">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {OUTCOME_KEYS.map((k) => (
              <SelectItem key={k} value={k} className="cursor-pointer text-xs">
                {t(`outcome${cap(k)}`)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </FieldRow>
      <FieldRow label={t('fieldReason')}>
        <Textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={2} className="resize-none" />
      </FieldRow>
      <FieldRow label={t('fieldReflection')}>
        <Textarea value={reflection} onChange={(e) => setReflection(e.target.value)} rows={3} className="resize-none" />
      </FieldRow>
      <FormActions onSubmit={submit} onCancel={editing ? onDone : undefined} submitLabel={editing ? t('save') : t('newEntry')} />
    </div>
  );
}

export function DebriefForm({ resumeId, editing, onDone }: { resumeId: string; editing: DebriefEntry | null | undefined; onDone: () => void }) {
  const t = useTranslations('journal');
  const add = useJournalStore((s) => s.add);
  const update = useJournalStore((s) => s.update);
  const [title, setTitle] = useState(editing?.title || '');
  const [wins, setWins] = useState(editing?.wins || '');
  const [losses, setLosses] = useState(editing?.losses || '');
  const [improvements, setImprovements] = useState(editing?.improvements || '');

  const submit = () => {
    const payload = {
      type: 'debrief' as const,
      resumeId,
      title: title.trim(),
      wins: wins.trim() || undefined,
      losses: losses.trim() || undefined,
      improvements: improvements.trim() || undefined,
    };
    if (editing) {
      update(editing.id, payload);
      toast.success(t('save'));
      onDone();
    } else {
      add(payload);
      toast.success(t('save'));
      setTitle(''); setWins(''); setLosses(''); setImprovements('');
    }
  };

  return (
    <div className="space-y-3">
      <FieldRow label={t('fieldTitle')}>
        <Input value={title} onChange={(e) => setTitle(e.target.value)} className="h-8" />
      </FieldRow>
      <FieldRow label={t('fieldWins')}>
        <Textarea value={wins} onChange={(e) => setWins(e.target.value)} rows={2} className="resize-none" />
      </FieldRow>
      <FieldRow label={t('fieldLosses')}>
        <Textarea value={losses} onChange={(e) => setLosses(e.target.value)} rows={2} className="resize-none" />
      </FieldRow>
      <FieldRow label={t('fieldImprovements')}>
        <Textarea value={improvements} onChange={(e) => setImprovements(e.target.value)} rows={2} className="resize-none" />
      </FieldRow>
      <FormActions onSubmit={submit} onCancel={editing ? onDone : undefined} submitLabel={editing ? t('save') : t('newEntry')} />
    </div>
  );
}
