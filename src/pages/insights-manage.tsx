'use client';

import { useEffect, useMemo, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import {
  ArrowLeft,
  Columns3,
  List,
  Search,
  Pencil,
  Trash2,
  Briefcase,
  MessageSquare,
  CheckCircle2,
  BookOpenCheck,
  History,
} from 'lucide-react';
import { Link, useRouter } from '@/i18n/routing';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  useJournalStore,
  type ApplicationEntry,
  type ApplicationStatus,
  type DebriefEntry,
  type InterviewEntry,
  type JournalEntry,
  type JournalEntryType,
  type OutcomeEntry,
} from '@/stores/journal-store';
import { useResume } from '@/hooks/use-resume';
import {
  ApplicationForm,
  InterviewForm,
  OutcomeForm,
  DebriefForm,
  StatusQuickPill,
  FollowUpBadge,
} from '@/components/editor/journal-dialog';
import { cn } from '@/lib/utils';
import * as api from '@/lib/tauri-api';
import type { ResumeVersion, ResumeVersionEvent } from '@/types/resume';

type InsightsManageType = JournalEntryType | 'evolution';

const TYPE_META: Record<
  InsightsManageType,
  { icon: typeof Briefcase; titleKey: string; emptyKey: string }
> = {
  application: { icon: Briefcase, titleKey: 'insightsManageApplications', emptyKey: 'emptyApplication' },
  interview: { icon: MessageSquare, titleKey: 'insightsManageInterviews', emptyKey: 'emptyInterview' },
  outcome: { icon: CheckCircle2, titleKey: 'insightsManageOutcomes', emptyKey: 'emptyOutcome' },
  debrief: { icon: BookOpenCheck, titleKey: 'insightsManageDebriefs', emptyKey: 'emptyDebrief' },
  evolution: { icon: History, titleKey: 'insightsManageEvolution', emptyKey: 'insightsEvolutionEmpty' },
};

const URL_TO_TYPE: Record<string, InsightsManageType> = {
  applications: 'application',
  interviews: 'interview',
  outcomes: 'outcome',
  debriefs: 'debrief',
  evolution: 'evolution',
};

const VERSION_EVENTS: (ResumeVersionEvent | 'all')[] = ['all', 'save', 'ai_accept', 'ai_reject'];

export default function InsightsManagePage() {
  const params = useParams<{ type: string }>();
  const [searchParams] = useSearchParams();
  const type: InsightsManageType = URL_TO_TYPE[params.type || ''] || 'application';
  const t = useTranslations('dashboard');
  const tJournal = useTranslations('journal');
  const router = useRouter();

  const hydrate = useJournalStore((s) => s.hydrate);
  const byResume = useJournalStore((s) => s.byResume);
  const remove = useJournalStore((s) => s.remove);
  const { resumes, fetchResumes } = useResume();

  const [editingId, setEditingId] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<ApplicationStatus | 'all'>(
    (searchParams.get('status') as ApplicationStatus) || 'all'
  );
  const [eventFilter, setEventFilter] = useState<ResumeVersionEvent | 'all'>('all');
  const [appView, setAppView] = useState<'board' | 'list'>('board');
  const [resumeFilter, setResumeFilter] = useState<string>('all');
  const [versions, setVersions] = useState<ResumeVersion[]>([]);

  useEffect(() => {
    hydrate();
  }, [hydrate]);

  useEffect(() => {
    fetchResumes();
  }, [fetchResumes]);

  useEffect(() => {
    if (type !== 'evolution') return;
    let cancelled = false;
    api.listResumeVersions(resumeFilter === 'all' ? undefined : resumeFilter)
      .then((items) => {
        if (!cancelled) setVersions(items as ResumeVersion[]);
      })
      .catch((err) => {
        console.error('Failed to load resume versions:', err);
      });
    return () => {
      cancelled = true;
    };
  }, [type, resumeFilter]);

  const resumeMap = useMemo(() => {
    const m = new Map<string, string>();
    resumes.forEach((r) => m.set(r.id, r.title));
    return m;
  }, [resumes]);

  const allEntries = useMemo(() => {
    if (type === 'evolution') return [];
    const out: JournalEntry[] = [];
    for (const list of Object.values(byResume)) {
      for (const e of list) if (e.type === type) out.push(e);
    }
    return out.sort((a, b) => b.createdAt - a.createdAt);
  }, [byResume, type]);

  const filtered = useMemo(() => {
    let xs = allEntries;
    if (resumeFilter !== 'all') xs = xs.filter((e) => e.resumeId === resumeFilter);
    if (type === 'application' && statusFilter !== 'all') {
      xs = xs.filter((e) => (e as ApplicationEntry).status === statusFilter);
    }
    const q = search.trim().toLowerCase();
    if (q) {
      xs = xs.filter((e) => entryToSearchString(e).toLowerCase().includes(q));
    }
    return xs;
  }, [allEntries, resumeFilter, statusFilter, search, type]);

  const filteredVersions = useMemo(() => {
    let xs = versions;
    if (eventFilter !== 'all') xs = xs.filter((v) => v.event === eventFilter);
    const q = search.trim().toLowerCase();
    if (q) {
      xs = xs.filter((v) =>
        [v.resumeTitle, versionEventLabel(v.event, t), versionSummary(v, t)]
          .filter(Boolean)
          .join(' ')
          .toLowerCase()
          .includes(q)
      );
    }
    return xs;
  }, [versions, eventFilter, search, t]);

  const meta = TYPE_META[type];
  const Icon = meta.icon;
  const editing = editingId ? allEntries.find((e) => e.id === editingId) : null;

  return (
    <ScrollArea className="-mx-4 -my-6 h-[calc(100vh-3.5rem-3rem)] md:-mx-8 md:-my-8">
      <div className="mx-auto max-w-6xl space-y-5 px-4 py-6 md:px-8 md:py-8">
        {/* Header */}
        <header>
          <button
            type="button"
            onClick={() => router.push('/insights')}
            className="inline-flex cursor-pointer items-center gap-1 text-[11px] font-medium text-[var(--whale-ink-muted)] transition-colors hover:text-[var(--whale-ink)]"
          >
            <ArrowLeft className="h-3 w-3" />
            {tJournal('title')}
          </button>
          <div className="mt-2 flex items-center gap-3">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-[var(--whale-ink)]">
              <Icon className="h-4 w-4 text-[var(--whale-cream)]" />
            </span>
            <div>
              <h1 className="font-display text-[2.125rem] font-semibold leading-tight tracking-tight text-[var(--whale-ink)]">
                {t(meta.titleKey)}
              </h1>
              <p className="text-[12px] text-[var(--whale-ink-muted)]">
                {t('insightsTotal', { count: type === 'evolution' ? filteredVersions.length : filtered.length })}
              </p>
            </div>
          </div>
        </header>

        {/* Filter bar */}
        <section className="flex flex-col gap-2 rounded-2xl border border-[var(--whale-divider)] bg-[var(--whale-cream-soft)] p-3 sm:flex-row sm:items-center">
          <div className="relative flex-1 sm:max-w-xs">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--whale-ink-muted)]" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t('insightsSearch')}
              className="h-8 border-transparent bg-[var(--whale-card)] pl-9 text-[13px]"
            />
          </div>
          <Select value={resumeFilter} onValueChange={setResumeFilter}>
            <SelectTrigger size="sm" className="h-8 cursor-pointer border-transparent bg-[var(--whale-card)] text-[12px]">
              <SelectValue placeholder={t('insightsFilterResume')} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all" className="cursor-pointer text-xs">{t('insightsAllResumes')}</SelectItem>
              {resumes.map((r) => (
                <SelectItem key={r.id} value={r.id} className="cursor-pointer text-xs">
                  {r.title}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {type === 'application' && (
            <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as ApplicationStatus | 'all')}>
              <SelectTrigger size="sm" className="h-8 cursor-pointer border-transparent bg-[var(--whale-card)] text-[12px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all" className="cursor-pointer text-xs">{t('insightsAllStatuses')}</SelectItem>
                {(['submitted', 'screening', 'interview', 'offer', 'rejected', 'declined', 'ghosted'] as ApplicationStatus[]).map((k) => (
                  <SelectItem key={k} value={k} className="cursor-pointer text-xs">
                    {tJournal(`status${cap(k)}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          {type === 'application' && (
            <div className="flex items-center rounded-full bg-[var(--whale-card)] p-0.5">
              <button
                type="button"
                onClick={() => setAppView('board')}
                className={cn(
                  'cursor-pointer rounded-full px-2.5 py-1 transition-colors',
                  appView === 'board' ? 'bg-[var(--whale-ink)] text-[var(--whale-cream)]' : 'text-[var(--whale-ink-muted)] hover:text-[var(--whale-ink)]'
                )}
                title={tJournal('viewBoard')}
              >
                <Columns3 className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                onClick={() => setAppView('list')}
                className={cn(
                  'cursor-pointer rounded-full px-2.5 py-1 transition-colors',
                  appView === 'list' ? 'bg-[var(--whale-ink)] text-[var(--whale-cream)]' : 'text-[var(--whale-ink-muted)] hover:text-[var(--whale-ink)]'
                )}
                title={tJournal('viewList')}
              >
                <List className="h-3.5 w-3.5" />
              </button>
            </div>
          )}
          {type === 'evolution' && (
            <Select value={eventFilter} onValueChange={(v) => setEventFilter(v as ResumeVersionEvent | 'all')}>
              <SelectTrigger size="sm" className="h-8 cursor-pointer border-transparent bg-[var(--whale-card)] text-[12px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {VERSION_EVENTS.map((k) => (
                  <SelectItem key={k} value={k} className="cursor-pointer text-xs">
                    {k === 'all' ? t('insightsAllEvents') : versionEventLabel(k, t)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </section>

        {/* Table */}
        <section>
          {type === 'evolution' ? (
            filteredVersions.length === 0 ? (
              <EmptyState text={t(meta.emptyKey)} hint={t('insightsEvolutionHint')} />
            ) : (
              <VersionTable versions={filteredVersions} t={t} />
            )
          ) : filtered.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-[var(--whale-divider)] bg-[var(--whale-card)] py-12 text-center">
              <p className="text-[13px] text-[var(--whale-ink-muted)]">{tJournal(meta.emptyKey)}</p>
              <p className="mt-2 text-[11px] text-[var(--whale-ink-muted)]">{t('insightsHowToAdd')}</p>
            </div>
          ) : type === 'application' && appView === 'board' ? (
            <ApplicationBoard entries={filtered as ApplicationEntry[]} onEdit={setEditingId} />
          ) : (
            <Table type={type as JournalEntryType} entries={filtered} resumeMap={resumeMap} onEdit={setEditingId} onDelete={setPendingDelete} />
          )}
        </section>

        {type === 'evolution' ? (
          <p className="text-center text-[11px] text-[var(--whale-ink-muted)]">{t('insightsEvolutionHint')}</p>
        ) : (
          <p className="text-center text-[11px] text-[var(--whale-ink-muted)]">{t('insightsHowToAdd')}</p>
        )}
      </div>

      {/* Edit drawer */}
      <Sheet open={!!editing} onOpenChange={(open) => !open && setEditingId(null)}>
        <SheetContent side="right" className="w-full max-w-md border-l border-[var(--whale-divider)] bg-[var(--whale-card)]">
          <SheetHeader className="border-b border-[var(--whale-divider)] px-5 py-3">
            <SheetTitle className="flex items-center gap-2 text-sm font-bold text-[var(--whale-ink)]">
              <Icon className="h-4 w-4" />
              {tJournal('edit')} · {editing && resumeMap.get(editing.resumeId)}
            </SheetTitle>
          </SheetHeader>
          <ScrollArea className="h-[calc(100vh-3.5rem)]">
            <div className="px-5 py-4">
              {editing?.type === 'application' && (
                <ApplicationForm resumeId={editing.resumeId} editing={editing as ApplicationEntry} onDone={() => setEditingId(null)} />
              )}
              {editing?.type === 'interview' && (
                <InterviewForm resumeId={editing.resumeId} editing={editing as InterviewEntry} onDone={() => setEditingId(null)} />
              )}
              {editing?.type === 'outcome' && (
                <OutcomeForm resumeId={editing.resumeId} editing={editing as OutcomeEntry} onDone={() => setEditingId(null)} />
              )}
              {editing?.type === 'debrief' && (
                <DebriefForm resumeId={editing.resumeId} editing={editing as DebriefEntry} onDone={() => setEditingId(null)} />
              )}
            </div>
          </ScrollArea>
        </SheetContent>
      </Sheet>

      {/* Delete confirm */}
      <AlertDialog open={!!pendingDelete} onOpenChange={(open) => !open && setPendingDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('insightsConfirmDelete')}</AlertDialogTitle>
            <AlertDialogDescription>{tJournal('emptyApplication')}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="cursor-pointer">{tJournal('cancel')}</AlertDialogCancel>
            <AlertDialogAction
              className="cursor-pointer bg-red-600 hover:bg-red-700"
              onClick={() => {
                if (pendingDelete) {
                  remove(pendingDelete);
                  toast.success(tJournal('delete'));
                }
                setPendingDelete(null);
              }}
            >
              {tJournal('delete')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </ScrollArea>
  );
}

/* ─── Table renderers per type ─── */

function Table({
  type,
  entries,
  resumeMap,
  onEdit,
  onDelete,
}: {
  type: JournalEntryType;
  entries: JournalEntry[];
  resumeMap: Map<string, string>;
  onEdit: (id: string) => void;
  onDelete: (id: string) => void;
}) {
  const tJournal = useTranslations('journal');

  return (
    <div className="overflow-hidden rounded-2xl border border-[var(--whale-divider)] bg-[var(--whale-card)]">
      <div className="grid grid-cols-12 gap-2 border-b border-[var(--whale-divider)] bg-[var(--whale-cream-soft)] px-4 py-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--whale-ink-muted)]">
        {type === 'application' && (
          <>
            <div className="col-span-2">{tJournal('fieldCompany')}</div>
            <div className="col-span-2">{tJournal('fieldRole')}</div>
            <div className="col-span-1">{tJournal('fieldStatus')}</div>
            <div className="col-span-1">{tJournal('fieldChannel')}</div>
            <div className="col-span-1">{tJournal('fieldDate')}</div>
            <div className="col-span-2">{tJournal('fieldNotes')}</div>
            <div className="col-span-2">Resume</div>
            <div className="col-span-1 text-right">·</div>
          </>
        )}
        {type === 'interview' && (
          <>
            <div className="col-span-2">{tJournal('fieldCompany')}</div>
            <div className="col-span-2">{tJournal('fieldRole')}</div>
            <div className="col-span-2">{tJournal('fieldRound')}</div>
            <div className="col-span-1">{tJournal('fieldFormat')}</div>
            <div className="col-span-1">{tJournal('fieldDate')}</div>
            <div className="col-span-1">{tJournal('fieldInterviewer')}</div>
            <div className="col-span-2">Resume</div>
            <div className="col-span-1 text-right">·</div>
          </>
        )}
        {type === 'outcome' && (
          <>
            <div className="col-span-2">{tJournal('fieldCompany')}</div>
            <div className="col-span-2">{tJournal('fieldRole')}</div>
            <div className="col-span-1">{tJournal('fieldOutcome')}</div>
            <div className="col-span-3">{tJournal('fieldReason')}</div>
            <div className="col-span-1">{tJournal('fieldDate')}</div>
            <div className="col-span-2">Resume</div>
            <div className="col-span-1 text-right">·</div>
          </>
        )}
        {type === 'debrief' && (
          <>
            <div className="col-span-3">{tJournal('fieldTitle')}</div>
            <div className="col-span-3">{tJournal('fieldWins')}</div>
            <div className="col-span-3">{tJournal('fieldImprovements')}</div>
            <div className="col-span-2">Resume</div>
            <div className="col-span-1 text-right">·</div>
          </>
        )}
      </div>
      <div>
        {entries.map((e) => (
          <Row key={e.id} entry={e} resumeMap={resumeMap} onEdit={onEdit} onDelete={onDelete} />
        ))}
      </div>
    </div>
  );
}

function Row({
  entry,
  resumeMap,
  onEdit,
  onDelete,
}: {
  entry: JournalEntry;
  resumeMap: Map<string, string>;
  onEdit: (id: string) => void;
  onDelete: (id: string) => void;
}) {
  const tJournal = useTranslations('journal');
  const resumeTitle = resumeMap.get(entry.resumeId) || '—';
  const created = new Date(entry.createdAt).toLocaleDateString();

  return (
    <div className="group grid grid-cols-12 gap-2 border-b border-[var(--whale-divider)] px-4 py-2.5 text-[12px] transition-colors hover:bg-[var(--whale-cream-soft)] last:border-b-0">
      {entry.type === 'application' && (
        <ApplicationCells entry={entry as ApplicationEntry} resumeTitle={resumeTitle} tJournal={tJournal} />
      )}
      {entry.type === 'interview' && (
        <InterviewCells entry={entry as InterviewEntry} resumeTitle={resumeTitle} tJournal={tJournal} />
      )}
      {entry.type === 'outcome' && (
        <OutcomeCells entry={entry as OutcomeEntry} resumeTitle={resumeTitle} created={created} tJournal={tJournal} />
      )}
      {entry.type === 'debrief' && (
        <DebriefCells entry={entry as DebriefEntry} resumeTitle={resumeTitle} />
      )}
      <div className="col-span-1 flex items-center justify-end gap-0.5">
        <button
          type="button"
          onClick={() => onEdit(entry.id)}
          className="cursor-pointer rounded p-1 text-[var(--whale-ink-muted)] opacity-0 transition-opacity hover:bg-[var(--whale-cream-deep)] hover:text-[var(--whale-ink)] group-hover:opacity-100"
          title={tJournal('edit')}
        >
          <Pencil className="h-3 w-3" />
        </button>
        <button
          type="button"
          onClick={() => onDelete(entry.id)}
          className="cursor-pointer rounded p-1 text-[var(--whale-ink-muted)] opacity-0 transition-opacity hover:bg-red-50 hover:text-red-600 group-hover:opacity-100"
          title={tJournal('delete')}
        >
          <Trash2 className="h-3 w-3" />
        </button>
      </div>
    </div>
  );
}

function ApplicationCells({ entry, resumeTitle, tJournal }: { entry: ApplicationEntry; resumeTitle: string; tJournal: (k: string) => string }) {
  const statusTone =
    entry.status === 'offer' ? 'mint' : entry.status === 'rejected' ? 'red' : 'subtle';
  return (
    <>
      <Cell cols={2} primary={entry.company || '—'} />
      <Cell cols={2} primary={entry.role || '—'} />
      <div className="col-span-1 flex items-center">
        <Pill tone={statusTone}>{tJournal(`status${cap(entry.status)}`)}</Pill>
      </div>
      <Cell cols={1} primary={entry.channel || '—'} muted />
      <Cell cols={1} primary={entry.date || '—'} muted />
      <Cell cols={2} primary={entry.notes || ''} muted truncate />
      <Cell cols={2} primary={resumeTitle} muted truncate />
    </>
  );
}

function InterviewCells({ entry, resumeTitle, tJournal }: { entry: InterviewEntry; resumeTitle: string; tJournal: (k: string) => string }) {
  return (
    <>
      <Cell cols={2} primary={entry.company || '—'} />
      <Cell cols={2} primary={entry.role || '—'} />
      <Cell cols={2} primary={entry.round || '—'} />
      <Cell cols={1} primary={entry.format ? tJournal(`format${cap(entry.format.replace('-', ''))}`) : '—'} muted />
      <Cell cols={1} primary={entry.date || '—'} muted />
      <Cell cols={1} primary={entry.interviewer || '—'} muted truncate />
      <Cell cols={2} primary={resumeTitle} muted truncate />
    </>
  );
}

function OutcomeCells({ entry, resumeTitle, created, tJournal }: { entry: OutcomeEntry; resumeTitle: string; created: string; tJournal: (k: string) => string }) {
  const tone =
    entry.outcome === 'offer' ? 'mint' : entry.outcome === 'rejected' ? 'red' : 'subtle';
  return (
    <>
      <Cell cols={2} primary={entry.company || '—'} />
      <Cell cols={2} primary={entry.role || '—'} />
      <div className="col-span-1 flex items-center">
        <Pill tone={tone}>{tJournal(`outcome${cap(entry.outcome)}`)}</Pill>
      </div>
      <Cell cols={3} primary={entry.reason || ''} muted truncate />
      <Cell cols={1} primary={created} muted />
      <Cell cols={2} primary={resumeTitle} muted truncate />
    </>
  );
}

function DebriefCells({ entry, resumeTitle }: { entry: DebriefEntry; resumeTitle: string }) {
  return (
    <>
      <Cell cols={3} primary={entry.title || '—'} />
      <Cell cols={3} primary={entry.wins || ''} muted truncate />
      <Cell cols={3} primary={entry.improvements || ''} muted truncate />
      <Cell cols={2} primary={resumeTitle} muted truncate />
    </>
  );
}

function Cell({ cols, primary, muted, truncate }: { cols: number; primary: string; muted?: boolean; truncate?: boolean }) {
  // Static lookup so Tailwind JIT picks the col-span class up at build time.
  const COL: Record<number, string> = {
    1: 'col-span-1',
    2: 'col-span-2',
    3: 'col-span-3',
    4: 'col-span-4',
  };
  return (
    <div
      className={cn(
        `${COL[cols] || 'col-span-1'} flex items-center`,
        muted ? 'text-[var(--whale-ink-muted)]' : 'text-[var(--whale-ink)]',
        truncate && 'truncate'
      )}
    >
      <span className={truncate ? 'truncate' : ''}>{primary || '—'}</span>
    </div>
  );
}

function EmptyState({ text, hint }: { text: string; hint: string }) {
  return (
    <div className="rounded-2xl border border-dashed border-[var(--whale-divider)] bg-[var(--whale-card)] py-12 text-center">
      <p className="text-[13px] text-[var(--whale-ink-muted)]">{text}</p>
      <p className="mt-2 text-[11px] text-[var(--whale-ink-muted)]">{hint}</p>
    </div>
  );
}

function VersionTable({ versions, t }: { versions: ResumeVersion[]; t: (k: string, values?: Record<string, unknown>) => string }) {
  return (
    <div className="overflow-hidden rounded-2xl border border-[var(--whale-divider)] bg-[var(--whale-card)]">
      <div className="grid grid-cols-12 gap-2 border-b border-[var(--whale-divider)] bg-[var(--whale-cream-soft)] px-4 py-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--whale-ink-muted)]">
        <div className="col-span-2">{t('insightsVersionTime')}</div>
        <div className="col-span-2">{t('insightsVersionEvent')}</div>
        <div className="col-span-3">{t('insightsVersionResume')}</div>
        <div className="col-span-5">{t('insightsVersionSummary')}</div>
      </div>
      <div>
        {versions.map((version) => (
          <VersionRow key={version.id} version={version} t={t} />
        ))}
      </div>
    </div>
  );
}

function VersionRow({ version, t }: { version: ResumeVersion; t: (k: string, values?: Record<string, unknown>) => string }) {
  return (
    <div className="grid grid-cols-12 gap-2 border-b border-[var(--whale-divider)] px-4 py-2.5 text-[12px] transition-colors hover:bg-[var(--whale-cream-soft)] last:border-b-0">
      <Cell cols={2} primary={formatUnixTime(version.createdAt)} muted />
      <div className="col-span-2 flex items-center">
        <Pill tone={version.event === 'ai_reject' ? 'red' : version.event === 'ai_accept' ? 'mint' : 'subtle'}>
          {versionEventLabel(version.event, t)}
        </Pill>
      </div>
      <Cell cols={3} primary={version.resumeTitle || '—'} truncate />
      <Cell cols={4} primary={versionSummary(version, t)} muted truncate />
      <div className="col-span-1 flex items-center justify-end">
        <Link
          href={`/editor/${version.resumeId}`}
          className="inline-flex cursor-pointer items-center gap-1 rounded-md border border-[var(--whale-divider)] px-2 py-1 text-[11px] font-medium text-[var(--whale-ink-soft)] transition-colors hover:bg-[var(--whale-cream-deep)] hover:text-[var(--whale-ink)]"
        >
          {t('insightsVersionOpen')}
        </Link>
      </div>
    </div>
  );
}

function formatUnixTime(value: number): string {
  return new Date(value * 1000).toLocaleString(undefined, {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function versionEventLabel(event: ResumeVersionEvent, t: (k: string, values?: Record<string, unknown>) => string): string {
  if (event === 'ai_accept') return t('insightsEventAiAccept');
  if (event === 'ai_reject') return t('insightsEventAiReject');
  return t('insightsEventSave');
}

function versionSummary(version: ResumeVersion, t: (k: string, values?: Record<string, unknown>) => string): string {
  const sections = Array.isArray(version.snapshot?.sections) ? version.snapshot.sections : [];
  const visibleCount = sections.filter((s) => s?.visible !== false).length;
  return t('insightsVersionSnapshotSummary', {
    sections: sections.length,
    visible: visibleCount,
  });
}

function Pill({ children, tone }: { children: React.ReactNode; tone: 'mint' | 'red' | 'subtle' }) {
  if (tone === 'mint') {
    return (
      <span className="rounded-full bg-[var(--whale-mint)]/40 px-2 py-0.5 text-[11px] font-medium text-[var(--whale-ink)]">
        {children}
      </span>
    );
  }
  if (tone === 'red') {
    return (
      <span className="rounded-full bg-red-50 px-2 py-0.5 text-[11px] font-medium text-red-700">
        {children}
      </span>
    );
  }
  return (
    <span className="rounded-full bg-[var(--whale-cream-deep)] px-2 py-0.5 text-[11px] font-medium text-[var(--whale-ink-soft)]">
      {children}
    </span>
  );
}

function entryToSearchString(e: JournalEntry): string {
  if (e.type === 'application') {
    const a = e as ApplicationEntry;
    return [a.company, a.role, a.channel, a.contact, a.notes, a.jdSnippet].filter(Boolean).join(' ');
  }
  if (e.type === 'interview') {
    const i = e as InterviewEntry;
    return [i.company, i.role, i.round, i.interviewer, i.topics, i.notes].filter(Boolean).join(' ');
  }
  if (e.type === 'outcome') {
    const o = e as OutcomeEntry;
    return [o.company, o.role, o.reason, o.reflection].filter(Boolean).join(' ');
  }
  const d = e as DebriefEntry;
  return [d.title, d.wins, d.losses, d.improvements].filter(Boolean).join(' ');
}

function cap(s: string): string {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : '';
}


/* ── Application pipeline board — Huntr/Teal-style stage columns ── */

const BOARD_COLUMNS: { key: string; statuses: ApplicationStatus[]; labelKey: string }[] = [
  { key: 'submitted', statuses: ['submitted'], labelKey: 'statusSubmitted' },
  { key: 'screening', statuses: ['screening'], labelKey: 'statusScreening' },
  { key: 'interview', statuses: ['interview'], labelKey: 'statusInterview' },
  { key: 'offer', statuses: ['offer'], labelKey: 'statusOffer' },
  { key: 'closed', statuses: ['rejected', 'declined', 'ghosted'], labelKey: 'boardClosed' },
];

function ApplicationBoard({
  entries,
  onEdit,
}: {
  entries: ApplicationEntry[];
  onEdit: (id: string) => void;
}) {
  const tJournal = useTranslations('journal');
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-5">
      {BOARD_COLUMNS.map((col) => {
        const items = entries.filter((e) => col.statuses.includes(e.status));
        return (
          <div key={col.key} className="flex min-h-40 flex-col rounded-2xl bg-[var(--whale-cream-soft)] p-2">
            <div className="flex items-center justify-between px-1.5 pb-1.5 pt-0.5">
              <span className="text-[11px] font-semibold text-[var(--whale-ink-soft)]">{tJournal(col.labelKey)}</span>
              <span className="text-[10px] tabular-nums text-[var(--whale-ink-muted)]">{items.length}</span>
            </div>
            <div className="space-y-2">
              {items.map((e) => (
                <div
                  key={e.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => onEdit(e.id)}
                  onKeyDown={(ev) => {
                    if (ev.key === 'Enter' || ev.key === ' ') {
                      ev.preventDefault();
                      onEdit(e.id);
                    }
                  }}
                  className="cursor-pointer rounded-xl bg-[var(--whale-card)] p-2.5 shadow-sm ring-1 ring-[var(--whale-divider)]/60 transition-all hover:-translate-y-0.5 hover:shadow-md"
                >
                  <p className="truncate text-[12px] font-semibold text-[var(--whale-ink)]">{e.company || '—'}</p>
                  <p className="truncate text-[11px] text-[var(--whale-ink-muted)]">{e.role || '—'}</p>
                  <div className="mt-1.5 flex flex-wrap items-center gap-1">
                    <StatusQuickPill entry={e} />
                    <FollowUpBadge entry={e} />
                  </div>
                  {(e.channel || e.date) && (
                    <p className="mt-1 truncate text-[10px] text-[var(--whale-ink-muted)]">
                      {[e.channel, e.date].filter(Boolean).join(' · ')}
                    </p>
                  )}
                </div>
              ))}
              {items.length === 0 && (
                <p className="px-1.5 py-4 text-center text-[10px] text-[var(--whale-ink-muted)]/50">—</p>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
