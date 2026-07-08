'use client';

import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { ArrowLeft, Briefcase, History, Search, Trash2 } from 'lucide-react';
import { Link, useRouter } from '@/i18n/routing';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ScrollArea } from '@/components/ui/scroll-area';
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
import { useJournalStore, type Application, type ApplicationStatus } from '@/stores/journal-store';
import { useResume } from '@/hooks/use-resume';
import { cn } from '@/lib/utils';
import * as api from '@/lib/tauri-api';
import type { ResumeVersion, ResumeVersionEvent } from '@/types/resume';

const VERSION_EVENTS: (ResumeVersionEvent | 'all')[] = ['all', 'save', 'ai_accept', 'ai_reject'];

const BOARD_COLUMNS: { key: string; statuses: ApplicationStatus[]; labelKey: string }[] = [
  { key: 'submitted', statuses: ['submitted'], labelKey: 'statusSubmitted' },
  { key: 'screening', statuses: ['screening'], labelKey: 'statusScreening' },
  { key: 'interview', statuses: ['interview'], labelKey: 'statusInterview' },
  { key: 'offer', statuses: ['offer'], labelKey: 'statusOffer' },
  { key: 'closed', statuses: ['rejected', 'declined', 'ghosted'], labelKey: 'boardClosed' },
];

export default function InsightsManagePage() {
  const params = useParams<{ type: string }>();
  const isEvolution = params.type === 'evolution';
  const t = useTranslations('dashboard');
  const tJournal = useTranslations('journal');
  const router = useRouter();

  const hydrate = useJournalStore((s) => s.hydrate);
  const applications = useJournalStore((s) => s.applications);
  const deleteApplication = useJournalStore((s) => s.deleteApplication);
  const { resumes, fetchResumes } = useResume();

  const [search, setSearch] = useState('');
  const [resumeFilter, setResumeFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<ApplicationStatus | 'all'>('all');
  const [eventFilter, setEventFilter] = useState<ResumeVersionEvent | 'all'>('all');
  const [versions, setVersions] = useState<ResumeVersion[]>([]);
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);

  useEffect(() => { hydrate(); }, [hydrate]);
  useEffect(() => { fetchResumes(); }, [fetchResumes]);
  useEffect(() => {
    if (!isEvolution) return;
    let cancelled = false;
    api.listResumeVersions(resumeFilter === 'all' ? undefined : resumeFilter)
      .then((items) => { if (!cancelled) setVersions(items as ResumeVersion[]); })
      .catch((err) => console.error('Failed to load resume versions:', err));
    return () => { cancelled = true; };
  }, [isEvolution, resumeFilter]);

  const resumeMap = useMemo(() => {
    const m = new Map<string, string>();
    resumes.forEach((r) => m.set(r.id, r.title));
    return m;
  }, [resumes]);

  const apps = useMemo(() => {
    let xs = Object.values(applications).flat().sort((a, b) => b.updatedAt - a.updatedAt);
    if (resumeFilter !== 'all') xs = xs.filter((a) => a.resumeId === resumeFilter);
    if (statusFilter !== 'all') xs = xs.filter((a) => a.status === statusFilter);
    const q = search.trim().toLowerCase();
    if (q) xs = xs.filter((a) => [a.company, a.role, a.channel, a.hrName, a.notes].filter(Boolean).join(' ').toLowerCase().includes(q));
    return xs;
  }, [applications, resumeFilter, statusFilter, search]);

  const filteredVersions = useMemo(() => {
    let xs = versions;
    if (eventFilter !== 'all') xs = xs.filter((v) => v.event === eventFilter);
    const q = search.trim().toLowerCase();
    if (q) xs = xs.filter((v) => [v.resumeTitle, versionEventLabel(v.event, t)].filter(Boolean).join(' ').toLowerCase().includes(q));
    return xs;
  }, [versions, eventFilter, search, t]);

  return (
    <ScrollArea className="-mx-4 -my-6 h-[calc(100vh-3.5rem-3rem)] md:-mx-8 md:-my-8">
      <div className="mx-auto max-w-6xl space-y-5 px-4 py-6 md:px-8 md:py-8">
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
              {isEvolution ? <History className="h-4 w-4 text-[var(--whale-cream)]" /> : <Briefcase className="h-4 w-4 text-[var(--whale-cream)]" />}
            </span>
            <div>
              <h1 className="font-display text-[2.125rem] font-semibold leading-tight tracking-tight text-[var(--whale-ink)]">
                {t(isEvolution ? 'insightsManageEvolution' : 'insightsManageApplications')}
              </h1>
              <p className="text-[12px] text-[var(--whale-ink-muted)]">
                {t('insightsTotal', { count: isEvolution ? filteredVersions.length : apps.length })}
              </p>
            </div>
          </div>
        </header>

        {/* Filter bar */}
        <section className="flex flex-col gap-2 rounded-2xl border border-[var(--whale-divider)] bg-[var(--whale-cream-soft)] p-3 sm:flex-row sm:items-center">
          <div className="relative flex-1 sm:max-w-xs">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--whale-ink-muted)]" />
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t('insightsSearch')} className="h-8 border-transparent bg-[var(--whale-card)] pl-9 text-[13px]" />
          </div>
          <Select value={resumeFilter} onValueChange={setResumeFilter}>
            <SelectTrigger size="sm" className="h-8 cursor-pointer border-transparent bg-[var(--whale-card)] text-[12px]">
              <SelectValue placeholder={t('insightsFilterResume')} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all" className="cursor-pointer text-xs">{t('insightsAllResumes')}</SelectItem>
              {resumes.map((r) => <SelectItem key={r.id} value={r.id} className="cursor-pointer text-xs">{r.title}</SelectItem>)}
            </SelectContent>
          </Select>
          {!isEvolution && (
            <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as ApplicationStatus | 'all')}>
              <SelectTrigger size="sm" className="h-8 cursor-pointer border-transparent bg-[var(--whale-card)] text-[12px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all" className="cursor-pointer text-xs">{t('insightsAllStatuses')}</SelectItem>
                {(['submitted', 'screening', 'interview', 'offer', 'rejected', 'ghosted'] as ApplicationStatus[]).map((k) => (
                  <SelectItem key={k} value={k} className="cursor-pointer text-xs">{tJournal(statusKey(k))}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          {isEvolution && (
            <Select value={eventFilter} onValueChange={(v) => setEventFilter(v as ResumeVersionEvent | 'all')}>
              <SelectTrigger size="sm" className="h-8 cursor-pointer border-transparent bg-[var(--whale-card)] text-[12px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                {VERSION_EVENTS.map((k) => <SelectItem key={k} value={k} className="cursor-pointer text-xs">{k === 'all' ? t('insightsAllEvents') : versionEventLabel(k, t)}</SelectItem>)}
              </SelectContent>
            </Select>
          )}
        </section>

        {/* Body */}
        {isEvolution ? (
          filteredVersions.length === 0 ? (
            <EmptyState text={t('insightsEvolutionEmpty')} hint={t('insightsEvolutionHint')} />
          ) : (
            <div className="overflow-hidden rounded-2xl border border-[var(--whale-divider)] bg-[var(--whale-card)]">
              {filteredVersions.map((v) => (
                <div key={v.id} className="grid grid-cols-12 items-center gap-2 border-b border-[var(--whale-divider)] px-4 py-2.5 text-[12px] last:border-b-0 hover:bg-[var(--whale-cream-soft)]">
                  <span className="col-span-2 text-[var(--whale-ink-muted)] tabular-nums">{formatUnixTime(v.createdAt)}</span>
                  <div className="col-span-2">
                    <span className={cn('rounded-full px-2 py-0.5 text-[11px] font-medium', v.event === 'ai_reject' ? 'bg-red-50 text-red-700' : v.event === 'ai_accept' ? 'bg-[var(--whale-mint)]/40 text-[var(--whale-ink)]' : 'bg-[var(--whale-cream-deep)] text-[var(--whale-ink-soft)]')}>
                      {versionEventLabel(v.event, t)}
                    </span>
                  </div>
                  <span className="col-span-3 truncate">{v.resumeTitle || '—'}</span>
                  <span className="col-span-4 truncate text-[var(--whale-ink-muted)]">{versionSummary(v, t)}</span>
                  <div className="col-span-1 flex justify-end">
                    <Link href={`/editor/${v.resumeId}`} className="inline-flex cursor-pointer items-center rounded-md border border-[var(--whale-divider)] px-2 py-1 text-[11px] font-medium text-[var(--whale-ink-soft)] hover:bg-[var(--whale-cream-deep)] hover:text-[var(--whale-ink)]">
                      {t('insightsVersionOpen')}
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          )
        ) : apps.length === 0 ? (
          <EmptyState text={tJournal('threadEmpty')} hint={t('insightsHowToAdd')} />
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-5">
            {BOARD_COLUMNS.map((col) => {
              const items = apps.filter((a) => col.statuses.includes(a.status));
              return (
                <div key={col.key} className="flex min-h-40 flex-col rounded-2xl bg-[var(--whale-cream-soft)] p-2">
                  <div className="flex items-center justify-between px-1.5 pb-1.5 pt-0.5">
                    <span className="text-[11px] font-semibold text-[var(--whale-ink-soft)]">{tJournal(col.labelKey)}</span>
                    <span className="text-[10px] tabular-nums text-[var(--whale-ink-muted)]">{items.length}</span>
                  </div>
                  <div className="space-y-2">
                    {items.map((a) => (
                      <BoardCard
                        key={a.id}
                        app={a}
                        resumeTitle={resumeMap.get(a.resumeId)}
                        onOpen={() => router.push(`/editor/${a.resumeId}`)}
                        onDelete={() => setPendingDelete(a.id)}
                      />
                    ))}
                    {items.length === 0 && <p className="px-1.5 py-4 text-center text-[10px] text-[var(--whale-ink-muted)]/50">—</p>}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <AlertDialog open={!!pendingDelete} onOpenChange={(open) => !open && setPendingDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('insightsConfirmDelete')}</AlertDialogTitle>
            <AlertDialogDescription>{tJournal('threadEmpty')}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="cursor-pointer">{tJournal('cancel')}</AlertDialogCancel>
            <AlertDialogAction
              className="cursor-pointer bg-red-600 hover:bg-red-700"
              onClick={() => {
                if (pendingDelete) { deleteApplication(pendingDelete); toast.success(tJournal('delete')); }
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

function BoardCard({ app, resumeTitle, onOpen, onDelete }: { app: Application; resumeTitle?: string; onOpen: () => void; onDelete: () => void }) {
  return (
    <div className="group relative rounded-xl bg-[var(--whale-card)] p-2.5 shadow-sm ring-1 ring-[var(--whale-divider)]/60 transition-all hover:-translate-y-0.5 hover:shadow-md">
      <button type="button" onClick={onOpen} className="block w-full cursor-pointer text-left">
        <p className="truncate text-[12px] font-semibold text-[var(--whale-ink)]">{app.company || '—'}</p>
        <p className="truncate text-[11px] text-[var(--whale-ink-muted)]">{app.role || '—'}</p>
        {(app.channel || app.appliedDate) && (
          <p className="mt-1 truncate text-[10px] text-[var(--whale-ink-muted)]">{[app.channel, app.appliedDate].filter(Boolean).join(' · ')}</p>
        )}
        {(app.interviews?.length || 0) > 0 && (
          <p className="mt-0.5 text-[10px] text-[var(--whale-ink-muted)]">{app.interviews.length} 轮面试</p>
        )}
        {resumeTitle && <p className="mt-0.5 truncate text-[10px] text-[var(--whale-ink-muted)]/70">{resumeTitle}</p>}
      </button>
      <button
        type="button"
        onClick={onDelete}
        className="absolute right-1.5 top-1.5 hidden rounded p-1 text-[var(--whale-ink-muted)] hover:text-red-600 group-hover:block"
      >
        <Trash2 className="h-3 w-3" />
      </button>
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

function statusKey(s: ApplicationStatus): string {
  return `status${s.charAt(0).toUpperCase()}${s.slice(1)}`;
}

function formatUnixTime(value: number): string {
  return new Date(value * 1000).toLocaleString(undefined, { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
}

function versionEventLabel(event: ResumeVersionEvent, t: (k: string, values?: Record<string, unknown>) => string): string {
  if (event === 'ai_accept') return t('insightsEventAiAccept');
  if (event === 'ai_reject') return t('insightsEventAiReject');
  return t('insightsEventSave');
}

function versionSummary(version: ResumeVersion, t: (k: string, values?: Record<string, unknown>) => string): string {
  const sections = Array.isArray(version.snapshot?.sections) ? version.snapshot.sections : [];
  const visibleCount = sections.filter((s) => s?.visible !== false).length;
  return t('insightsVersionSnapshotSummary', { sections: sections.length, visible: visibleCount });
}
