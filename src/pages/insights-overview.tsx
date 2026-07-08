'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslations, useLocale } from 'next-intl';
import {
  BookOpenCheck,
  Briefcase,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  MessageSquare,
  MoreVertical,
  Search,
  XCircle,
} from 'lucide-react';
import { useRouter } from '@/i18n/routing';
import {
  aggregateJournal,
  useJournalStore,
  latestInterview,
  type Application,
  type ApplicationStatus,
  type InterviewFormat,
} from '@/stores/journal-store';
import { useResume } from '@/hooks/use-resume';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { FileText, Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import * as api from '@/lib/tauri-api';
import { computeLogCost, fetchChannelPricing, pricingHostKey } from '@/lib/ai/pricing';
import type { JournalAggregate } from '@/stores/journal-store';
import type { ResumeVersion } from '@/types/resume';

type FilterKey = 'pending' | 'interview' | 'offer' | 'rejected' | 'overdue';

const OPEN_APP_STATUSES = ['submitted', 'screening', 'interview'];

function appMatchesFilter(app: Application, key: FilterKey, todayKey: string): boolean {
  switch (key) {
    case 'pending':
      return OPEN_APP_STATUSES.includes(app.status);
    case 'interview':
      return (app.interviews?.length || 0) > 0 || app.status === 'interview';
    case 'offer':
      return app.outcome?.result === 'offer' || app.status === 'offer';
    case 'rejected':
      return app.outcome?.result === 'rejected' || app.status === 'rejected';
    case 'overdue':
      return !!app.nextFollowUp && app.nextFollowUp < todayKey && OPEN_APP_STATUSES.includes(app.status);
    default:
      return false;
  }
}

const APP_STATUSES: ApplicationStatus[] = ['submitted', 'screening', 'interview', 'offer', 'rejected', 'ghosted'];
const APP_FORMATS: InterviewFormat[] = ['phone', 'video', 'onsite', 'take-home', 'other'];
const APP_STATUS_KEY: Record<ApplicationStatus, string> = {
  submitted: 'statusSubmitted',
  screening: 'statusScreening',
  interview: 'statusInterview',
  offer: 'statusOffer',
  rejected: 'statusRejected',
  declined: 'statusDeclined',
  ghosted: 'statusGhosted',
};
const APP_FORMAT_KEY: Record<InterviewFormat, string> = {
  phone: 'formatPhone',
  video: 'formatVideo',
  onsite: 'formatOnsite',
  'take-home': 'formatTakeHome',
  other: 'formatOther',
};

function searchableAppText(app: Application, resumeMap: Map<string, string>): string {
  const latest = latestInterview(app);
  return [
    resumeMap.get(app.resumeId),
    app.company,
    app.role,
    app.channel,
    app.hrName,
    app.hrContact,
    app.notes,
    app.status,
    latest?.round,
    latest?.topics,
    app.outcome?.reason,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
}
type InsightRange = 'all' | '30d' | '7d';
type InsightPanelView = 'overview' | 'models';
type SortMode = 'newest' | 'oldest';

const DAY_MS = 24 * 60 * 60 * 1000;
const ACTIVITY_PAGE_SIZE = 5;
const PANEL_DAY_COUNT: Record<InsightRange, number> = {
  all: 371, // ~53 weeks — a rolling one-year calendar
  '30d': 35,
  '7d': 7,
};

interface HeatmapDay {
  key: string;
  date: Date;
  jobCount: number;
  aiCount: number;
  versionCount: number;
  total: number;
}

interface ModelUsageStat {
  model: string;
  provider: string;
  calls: number;
  success: number;
  avgLatency: string;
  tokens: number;
  cost: number | null;
}

interface PanelMetric {
  key: string;
  label: string;
  value: string;
  sub: string;
}

type DayActivityMap = Map<string, { jobCount: number; aiCount: number; versionCount: number; total: number }>;

interface PanelStats {
  overviewMetrics: PanelMetric[];
  aiCalls: number;
  aiSuccessRate: string;
  avgLatency: string;
  favoriteModel: string;
  favoriteProvider: string;
  costLabel: string;
  tokensLabel: string;
  activeDays: number;
  currentStreak: number;
  peakDay: string;
  topModelShare: string;
  modelStats: ModelUsageStat[];
}

export default function InsightsOverviewPage() {
  const t = useTranslations('dashboard');
  const tJournal = useTranslations('journal');
  const router = useRouter();
  const hydrate = useJournalStore((s) => s.hydrate);
  const applications = useJournalStore((s) => s.applications);
  const mocks = useJournalStore((s) => s.mocks);
  const { resumes, fetchResumes } = useResume();
  const [versions, setVersions] = useState<ResumeVersion[]>([]);
  const [aiUsageLogs, setAIUsageLogs] = useState<api.AIUsageLogEntry[]>([]);
  const [activeFilters, setActiveFilters] = useState<Set<FilterKey>>(new Set());
  const [filterLogic, setFilterLogic] = useState<'or' | 'and'>('or');
  const toggleFilter = (key: FilterKey) =>
    setActiveFilters((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  const [focusMonth, setFocusMonth] = useState(() => {
    const d = new Date();
    return { year: d.getFullYear(), month: d.getMonth() };
  });
  const [panelView, setPanelView] = useState<InsightPanelView>('overview');
  const [query, setQuery] = useState('');
  const [sortMode, setSortMode] = useState<SortMode>('newest');
  const [page, setPage] = useState(0);

  useEffect(() => {
    hydrate();
  }, [hydrate]);

  useEffect(() => {
    fetchResumes();
  }, [fetchResumes]);

  useEffect(() => {
    let cancelled = false;
    api.listResumeVersions()
      .then((items) => {
        if (!cancelled) setVersions(items as ResumeVersion[]);
      })
      .catch((err) => {
        console.error('Failed to load resume versions:', err);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const refresh = () => setAIUsageLogs(api.listAIUsageLogs());
    refresh();
    if (typeof window === 'undefined') return;
    window.addEventListener('focus', refresh);
    document.addEventListener('visibilitychange', refresh);
    return () => {
      window.removeEventListener('focus', refresh);
      document.removeEventListener('visibilitychange', refresh);
    };
  }, []);

  // Best-effort: for every relay (newapi/one-api) base URL seen in the logs,
  // fetch its live /api/pricing once so token costs can be resolved.
  useEffect(() => {
    const hosts = new Map<string, string>();
    for (const log of aiUsageLogs) {
      if (!log.baseUrl) continue;
      const key = pricingHostKey(log.baseUrl);
      if (key && !hosts.has(key)) hosts.set(key, log.baseUrl);
    }
    let cancelled = false;
    Promise.allSettled(
      Array.from(hosts.values()).map((baseUrl) => fetchChannelPricing(baseUrl).catch(() => {}))
    ).then(() => {
      // Re-render so computed costs pick up freshly-cached pricing.
      if (!cancelled) setAIUsageLogs((prev) => [...prev]);
    });
    return () => {
      cancelled = true;
    };
    // Only depends on the set of distinct hosts, not every log mutation.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aiUsageLogs.map((l) => pricingHostKey(l.baseUrl)).join('|')]);

  const agg = useMemo(() => aggregateJournal(applications, mocks), [applications, mocks]);
  const activityEntries = useMemo<Application[]>(
    () => Object.values(applications).flat().sort((a, b) => b.updatedAt - a.updatedAt),
    [applications]
  );
  const versionCount = versions.length;
  const panelStats = useMemo(
    () => buildPanelStats(activityEntries, versions, aiUsageLogs, t),
    [aiUsageLogs, activityEntries, versions, t]
  );
  // All-time per-day activity so the calendar can render any month.
  const dayActivity = useMemo(() => {
    const jobs = countByDay(activityEntries.map((e) => e.createdAt));
    const vers = countByDay(versions.map((v) => v.createdAt));
    const ais = countByDay(aiUsageLogs.map((l) => l.startedAt));
    const keys = new Set<string>([...jobs.keys(), ...vers.keys(), ...ais.keys()]);
    const map: DayActivityMap = new Map();
    for (const k of keys) {
      const j = jobs.get(k) || 0;
      const v = vers.get(k) || 0;
      const a = ais.get(k) || 0;
      map.set(k, { jobCount: j, aiCount: a, versionCount: v, total: j + a + v });
    }
    return map;
  }, [activityEntries, versions, aiUsageLogs]);
  const maxDayTotal = useMemo(
    () => Math.max(1, ...Array.from(dayActivity.values()).map((d) => d.total)),
    [dayActivity]
  );
  const resumeMap = useMemo(() => {
    const m = new Map<string, string>();
    resumes.forEach((r) => m.set(r.id, r.title));
    return m;
  }, [resumes]);

  const baseFilteredEntries = useMemo(() => {
    if (activeFilters.size === 0) return activityEntries;
    const todayKey = new Date().toISOString().slice(0, 10);
    const keys = Array.from(activeFilters);
    // OR = match any selected condition; AND = must match every one.
    return activityEntries.filter((app) =>
      filterLogic === 'and'
        ? keys.every((key) => appMatchesFilter(app, key, todayKey))
        : keys.some((key) => appMatchesFilter(app, key, todayKey))
    );
  }, [activityEntries, activeFilters, filterLogic]);

  const filteredEntries = useMemo(() => {
    const keyword = query.trim().toLowerCase();
    const matched = keyword
      ? baseFilteredEntries.filter((app) => searchableAppText(app, resumeMap).includes(keyword))
      : baseFilteredEntries;
    return [...matched].sort((a, b) => (sortMode === 'newest' ? b.createdAt - a.createdAt : a.createdAt - b.createdAt));
  }, [baseFilteredEntries, query, resumeMap, sortMode]);

  useEffect(() => {
    setPage(0);
  }, [activeFilters, filteredEntries.length, query, sortMode]);

  const pageCount = Math.max(1, Math.ceil(filteredEntries.length / ACTIVITY_PAGE_SIZE));
  const currentPage = Math.min(page, pageCount - 1);
  const pagedEntries = filteredEntries.slice(
    currentPage * ACTIVITY_PAGE_SIZE,
    currentPage * ACTIVITY_PAGE_SIZE + ACTIVITY_PAGE_SIZE
  );

  const filterDefs: { key: FilterKey; label: string; count: number }[] = [
    { key: 'pending', label: t('journalPending'), count: agg.pendingCount },
    { key: 'interview', label: t('journalInterviews'), count: agg.interviewedApplications },
    { key: 'overdue', label: t('funnelOverdue'), count: agg.overdueFollowUps },
    { key: 'offer', label: t('funnelOffers'), count: agg.offerCount },
    { key: 'rejected', label: t('insightsFilterRejected'), count: agg.rejectCount },
  ];

  return (
    <div className="-mx-4 -my-6 h-[calc(100vh-3.5rem-3rem)] overflow-hidden md:-mx-8 md:-my-8">
      <div className="mx-auto flex h-full max-w-7xl flex-col gap-4 px-4 py-5 md:px-8">
        <header className="shrink-0">
          <h1 className="font-display text-[2.125rem] font-semibold leading-tight tracking-tight text-[var(--whale-ink)]">
            {t('journalTitle')}
          </h1>
          <p className="mt-1 text-[13px] text-[var(--whale-ink-muted)]">
            {t('insightsHeroSubtitle')}
          </p>
        </header>

        <div className="grid shrink-0 gap-4 lg:grid-cols-[minmax(0,460px)_minmax(0,1fr)]">
          <ActivityOverviewPanel
            focusMonth={focusMonth}
            onFocusMonthChange={setFocusMonth}
            view={panelView}
            onViewChange={setPanelView}
            stats={panelStats}
            dayActivity={dayActivity}
            maxDayTotal={maxDayTotal}
          />
          <PipelineFunnel agg={agg} />
        </div>

        <section className="flex shrink-0 flex-wrap items-center gap-2">
          <span className="shrink-0 text-[11px] font-semibold uppercase tracking-wider text-[var(--whale-ink-muted)]">
            {t('insightsFilterLabel')}
          </span>
          {/* 全部 — clears all conditions */}
          <FilterPill
            label={t('insightsFilterAll')}
            count={activityEntries.length}
            active={activeFilters.size === 0}
            onClick={() => setActiveFilters(new Set())}
          />
          {filterDefs.map((item) => (
            <FilterPill
              key={item.key}
              label={item.label}
              count={item.count}
              active={activeFilters.has(item.key)}
              onClick={() => toggleFilter(item.key)}
            />
          ))}
          <span className="h-4 w-px shrink-0 bg-[var(--whale-divider)]" />
          {/* AND/OR combine toggle — only relevant with 2+ conditions */}
          {activeFilters.size >= 2 && (
            <div className="inline-flex shrink-0 items-center rounded-full bg-[var(--whale-cream-deep)] p-0.5 text-[11px] font-medium">
              {(['or', 'and'] as const).map((mode) => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => setFilterLogic(mode)}
                  className={cn(
                    'cursor-pointer rounded-full px-2 py-0.5 transition-colors',
                    filterLogic === mode
                      ? 'bg-[var(--whale-ink)] text-[var(--whale-cream)]'
                      : 'text-[var(--whale-ink-muted)] hover:text-[var(--whale-ink)]'
                  )}
                >
                  {mode === 'or' ? t('insightsFilterAny') : t('insightsFilterAll2')}
                </button>
              ))}
            </div>
          )}
          {/* 清空已选 */}
          {activeFilters.size > 0 && (
            <button
              type="button"
              onClick={() => setActiveFilters(new Set())}
              className="inline-flex shrink-0 cursor-pointer items-center gap-1 rounded-full px-2.5 py-1.5 text-[12px] font-medium text-[var(--whale-ink-muted)] hover:bg-[var(--whale-cream-soft)] hover:text-[var(--whale-ink)]"
            >
              <XCircle className="h-3.5 w-3.5" />
              {t('insightsFilterClear')}
            </button>
          )}
          <span className="h-4 w-px shrink-0 bg-[var(--whale-divider)]" />
          {/* 简历演进 — navigates to its own view */}
          <FilterPill
            label={t('resumeEvolution')}
            count={versionCount}
            active={false}
            onClick={() => router.push('/insights/evolution')}
          />
        </section>

        <section className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl bg-[var(--whale-card)] shadow-[0_0_0_1px_var(--whale-divider)]">
          <div className="flex shrink-0 items-center justify-between gap-3 border-b border-[var(--whale-divider)] px-4 py-2.5">
            <label className="relative w-full max-w-[280px]">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--whale-ink-muted)]" />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder={t('insightsSearchPlaceholder')}
                className="h-8 w-full rounded-lg border border-[var(--whale-divider)] bg-[var(--whale-card)] pl-9 pr-3 text-[12px] outline-none transition-colors placeholder:text-[var(--whale-ink-muted)] focus:border-[var(--whale-ink-muted)]"
              />
            </label>
            <Select value={sortMode} onValueChange={(v) => setSortMode(v as SortMode)}>
              <SelectTrigger className="h-8 w-auto shrink-0 gap-1 rounded-lg border-[var(--whale-divider)] bg-[var(--whale-card)] px-3 text-[12px] font-medium text-[var(--whale-ink-soft)] shadow-none hover:bg-[var(--whale-cream-soft)]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="newest" className="text-xs">{t('insightsSortNewest')}</SelectItem>
                <SelectItem value="oldest" className="text-xs">{t('insightsSortOldest')}</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="grid shrink-0 grid-cols-[92px_minmax(150px,1.2fr)_104px_minmax(130px,1fr)_96px_150px_70px_40px] gap-2 border-b border-[var(--whale-divider)] bg-[var(--whale-cream-soft)] px-4 py-2 text-[10px] font-semibold uppercase tracking-wider text-[var(--whale-ink-muted)]">
            <span>{t('insightsColumnTime')}</span>
            <span>{t('insightsColumnCompanyRole')}</span>
            <span>{t('insightsColumnStatus')}</span>
            <span>{t('insightsColumnHr')}</span>
            <span>{t('insightsColumnFormat')}</span>
            <span>{t('insightsColumnScheduled')}</span>
            <span>{t('insightsColumnDuration')}</span>
            <span className="text-right">{t('insightsColumnAction')}</span>
          </div>
          {filteredEntries.length === 0 ? (
            <div className="flex min-h-0 flex-1 items-center justify-center text-[13px] text-[var(--whale-ink-muted)]">
              {activityEntries.length === 0 ? t('journalEmpty') : t('insightsNoFilteredActivity')}
            </div>
          ) : (
            <ul className="min-h-0 flex-1 overflow-y-auto">
              {pagedEntries.map((app) => (
                <ActivityRow key={app.id} app={app} />
              ))}
            </ul>
          )}
          <ListPagination
            page={currentPage}
            pageCount={pageCount}
            total={filteredEntries.length}
            onPageChange={setPage}
          />
        </section>
      </div>
    </div>
  );
}

function FilterPill({
  label,
  count,
  active,
  onClick,
}: {
  label: string;
  count: number;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'inline-flex shrink-0 cursor-pointer items-center gap-2 rounded-full px-3 py-1.5 text-[12px] font-medium transition-colors',
        active
          ? 'bg-[var(--whale-ink)] text-[var(--whale-cream)]'
          : 'bg-[var(--whale-card)] text-[var(--whale-ink-soft)] ring-1 ring-inset ring-[var(--whale-divider)] hover:bg-[var(--whale-cream-soft)]'
      )}
    >
      <span>{label}</span>
      <span
        className={cn(
          'rounded-full px-1.5 py-0.5 text-[10px] tabular-nums',
          active ? 'bg-[var(--whale-cream)]/14' : 'bg-[var(--whale-cream-deep)] text-[var(--whale-ink-muted)]'
        )}
      >
        {count}
      </span>
    </button>
  );
}

function ActivityOverviewPanel({
  focusMonth,
  onFocusMonthChange,
  view,
  onViewChange,
  stats,
  dayActivity,
  maxDayTotal,
}: {
  focusMonth: { year: number; month: number };
  onFocusMonthChange: (m: { year: number; month: number }) => void;
  view: InsightPanelView;
  onViewChange: (view: InsightPanelView) => void;
  stats: PanelStats;
  dayActivity: DayActivityMap;
  maxDayTotal: number;
}) {
  const t = useTranslations('dashboard');
  const locale = useLocale();
  const nowYear = new Date().getFullYear();
  // Years from 2024 through 10 years ahead of today.
  const years: number[] = [];
  for (let y = 2024; y <= nowYear + 10; y++) years.push(y);
  const monthFmt = new Intl.DateTimeFormat(locale === 'en' ? 'en-US' : 'zh-CN', { month: 'short' });

  return (
    <section className="flex flex-col overflow-hidden rounded-xl border border-[var(--whale-divider)] bg-[var(--whale-card)] shadow-sm">
      <div className="flex shrink-0 items-center justify-between gap-3 border-b border-[var(--whale-divider)] px-4 py-3">
        <div className="inline-flex shrink-0 rounded-lg bg-[var(--whale-cream-soft)] p-0.5">
          {(['overview', 'models'] as InsightPanelView[]).map((item) => (
            <button
              key={item}
              type="button"
              onClick={() => onViewChange(item)}
              className={cn(
                'cursor-pointer rounded-md px-3 py-1 text-[12px] font-semibold transition-colors',
                view === item ? 'bg-[var(--whale-ink)] text-[var(--whale-cream)] shadow-sm' : 'text-[var(--whale-ink-muted)] hover:text-[var(--whale-ink)]'
              )}
            >
              {item === 'overview' ? t('insightsPanelOverview') : t('insightsPanelModels')}
            </button>
          ))}
        </div>
        {view === 'overview' && (
          <div className="flex shrink-0 items-center gap-1.5">
            <Select value={String(focusMonth.year)} onValueChange={(v) => onFocusMonthChange({ ...focusMonth, year: Number(v) })}>
              <SelectTrigger className="h-7 w-auto gap-1 rounded-lg border-[var(--whale-divider)] bg-[var(--whale-card)] px-2.5 text-[12px] font-medium text-[var(--whale-ink-soft)] shadow-none hover:bg-[var(--whale-cream-soft)]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="max-h-64">
                {years.map((y) => (
                  <SelectItem key={y} value={String(y)} className="text-xs">{t('insightsYear', { year: y })}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={String(focusMonth.month)} onValueChange={(v) => onFocusMonthChange({ ...focusMonth, month: Number(v) })}>
              <SelectTrigger className="h-7 w-auto gap-1 rounded-lg border-[var(--whale-divider)] bg-[var(--whale-card)] px-2.5 text-[12px] font-medium text-[var(--whale-ink-soft)] shadow-none hover:bg-[var(--whale-cream-soft)]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Array.from({ length: 12 }, (_, m) => (
                  <SelectItem key={m} value={String(m)} className="text-xs">{monthFmt.format(new Date(2020, m, 1))}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
      </div>
      <div className="flex-1 p-4">
        {view === 'overview'
          ? <ActivityMatrix stats={stats} focusMonth={focusMonth} dayActivity={dayActivity} maxDayTotal={maxDayTotal} />
          : <ModelUsageChart stats={stats} />}
      </div>
    </section>
  );
}

function PipelineFunnel({ agg }: { agg: JournalAggregate }) {
  const t = useTranslations('dashboard');
  const s = agg.byStatus;
  // Cumulative funnel: each stage counts applications that reached it or beyond.
  const applied = agg.totalApplications;
  const screening = s.screening + s.interview + s.offer;
  const interview = s.interview + s.offer;
  const offer = s.offer + agg.offerCount;
  const closed = s.rejected + s.declined + s.ghosted + agg.rejectCount;

  const stages: Array<{ key: string; label: string; count: number; tone: string }> = [
    { key: 'applied', label: t('funnelApplied'), count: applied, tone: 'bg-[var(--whale-ink)]' },
    { key: 'screening', label: t('funnelScreening'), count: screening, tone: 'bg-[var(--whale-ink-soft)]' },
    { key: 'interview', label: t('funnelInterview'), count: interview, tone: 'bg-amber-500' },
    { key: 'offer', label: t('funnelOffer'), count: offer, tone: 'bg-emerald-500' },
    { key: 'closed', label: t('funnelClosed'), count: closed, tone: 'bg-[var(--whale-ink-muted)]' },
  ];
  const max = Math.max(1, applied, screening, interview, offer, closed);
  const pct = (a: number, b: number) => (b > 0 ? `${Math.round((a / b) * 100)}%` : '—');
  const stageConv = [null, pct(screening, applied), pct(interview, screening), pct(offer, interview), null];
  const isEmpty = applied === 0 && closed === 0;

  return (
    <div className="flex flex-col rounded-xl border border-[var(--whale-divider)] bg-[var(--whale-card)] p-4 shadow-sm">
      <div className="mb-3 flex items-baseline justify-between">
        <h3 className="text-[13px] font-semibold text-[var(--whale-ink)]">{t('funnelTitle')}</h3>
        <span className="text-[11px] text-[var(--whale-ink-muted)]">
          {t('funnelOfferRate')} {pct(offer, applied)}
        </span>
      </div>

      {isEmpty ? (
        <div className="flex flex-1 items-center justify-center py-8 text-[13px] text-[var(--whale-ink-muted)]">
          {t('funnelEmpty')}
        </div>
      ) : (
        <div className="flex flex-1 flex-col justify-center gap-2">
          {stages.map((stage, i) => (
            <div key={stage.key} className="flex items-center gap-3">
              <span className="w-12 shrink-0 text-right text-[12px] font-medium text-[var(--whale-ink-soft)]">
                {stage.label}
              </span>
              <div className="relative h-6 flex-1 overflow-hidden rounded-md bg-[var(--whale-cream-soft)]">
                <div
                  className={cn('h-full rounded-md transition-all', stage.tone)}
                  style={{ width: `${Math.max(stage.count > 0 ? 6 : 0, (stage.count / max) * 100)}%` }}
                />
              </div>
              <span className="w-8 shrink-0 text-right text-[13px] font-bold tabular-nums text-[var(--whale-ink)]">
                {stage.count}
              </span>
              <span className="w-9 shrink-0 text-right text-[11px] tabular-nums text-[var(--whale-ink-muted)]">
                {stageConv[i] || ''}
              </span>
            </div>
          ))}
        </div>
      )}

      <div className="mt-3 flex items-center gap-4 border-t border-[var(--whale-divider)] pt-3 text-[11px]">
        <span className={cn('flex items-center gap-1', agg.overdueFollowUps > 0 ? 'text-red-600' : 'text-[var(--whale-ink-muted)]')}>
          <span className="inline-block h-1.5 w-1.5 rounded-full bg-current" />
          {t('funnelOverdue')} {agg.overdueFollowUps}
        </span>
        <span className="text-[var(--whale-ink-muted)]">
          {t('funnelInProgress')} {agg.pendingCount}
        </span>
        <span className="ml-auto text-[var(--whale-ink-muted)]">
          {t('funnelOffers')} {agg.offerCount}
        </span>
      </div>
    </div>
  );
}

const CAL_CELL = 12; // px

function ActivityMatrix({
  stats,
  focusMonth,
  dayActivity,
  maxDayTotal,
}: {
  stats: PanelStats;
  focusMonth: { year: number; month: number };
  dayActivity: DayActivityMap;
  maxDayTotal: number;
}) {
  const t = useTranslations('dashboard');
  const locale = useLocale();
  const outerRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const monthRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const didMount = useRef(false);
  const [hover, setHover] = useState<{ dayKey: string; date: Date; x: number; y: number } | null>(null);

  const tiles = ['active', 'streak', 'tokens', 'cost']
    .map((key) => stats.overviewMetrics.find((m) => m.key === key))
    .filter((m): m is PanelMetric => !!m);

  const focusKey = `${focusMonth.year}-${focusMonth.month}`;
  const todayStr = dayKey(new Date());
  const monthTitleFmt = new Intl.DateTimeFormat(locale === 'en' ? 'en-US' : 'zh-CN', { year: 'numeric', month: 'long' });
  const weekdays = locale === 'en' ? ['S', 'M', 'T', 'W', 'T', 'F', 'S'] : ['日', '一', '二', '三', '四', '五', '六'];

  // 13 months centred on the focus month, so neighbours show on both sides.
  const months = Array.from({ length: 13 }, (_, i) => {
    const d = new Date(focusMonth.year, focusMonth.month + i - 6, 1);
    return { year: d.getFullYear(), month: d.getMonth(), key: `${d.getFullYear()}-${d.getMonth()}` };
  });

  // Centre the focus month — instantly on first mount / tab-return (no visible
  // slide), and smoothly only when the user actually changes the month.
  useEffect(() => {
    const el = monthRefs.current[focusKey];
    const container = scrollRef.current;
    if (el && container) {
      const left = Math.max(0, el.offsetLeft - (container.clientWidth - el.clientWidth) / 2);
      container.scrollTo({ left, behavior: didMount.current ? 'smooth' : 'auto' });
    }
    didMount.current = true;
  }, [focusKey]);

  const onWheel = (e: React.WheelEvent) => {
    const container = scrollRef.current;
    if (!container || Math.abs(e.deltaY) <= Math.abs(e.deltaX)) return;
    container.scrollLeft += e.deltaY;
    e.preventDefault();
  };

  const hoverAct = hover ? dayActivity.get(hover.dayKey) : undefined;

  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-4 gap-2">
        {tiles.map((metric) => (
          <div key={metric.key} className="rounded-lg bg-gray-100 p-2.5">
            <div className="truncate text-[10px] font-medium text-[var(--whale-ink-muted)]">{metric.label}</div>
            <div className="mt-1 truncate text-[18px] font-bold leading-none text-[var(--whale-ink)]">{metric.value}</div>
          </div>
        ))}
      </div>

      <div ref={outerRef} className="relative">
        {hover && (
          <div
            className="pointer-events-none absolute z-30 -translate-x-1/2 whitespace-nowrap rounded-md border border-[var(--whale-divider)] bg-[var(--whale-card)] px-2 py-1.5 shadow-lg"
            style={{ left: hover.x, top: hover.y + CAL_CELL + 4 }}
          >
            <div className="mb-0.5 text-[11px] font-semibold text-[var(--whale-ink)]">{formatShortDate(hover.date)}</div>
            <div className="flex flex-col gap-px text-[10px] text-[var(--whale-ink-muted)]">
              <span>{t('insightsHeatJob')} <b className="text-[var(--whale-ink)]">{hoverAct?.jobCount ?? 0}</b></span>
              <span>{t('insightsHeatAi')} <b className="text-[var(--whale-ink)]">{hoverAct?.aiCount ?? 0}</b></span>
              <span>{t('insightsHeatVersion')} <b className="text-[var(--whale-ink)]">{hoverAct?.versionCount ?? 0}</b></span>
            </div>
          </div>
        )}

        <div ref={scrollRef} onWheel={onWheel} className="overflow-x-auto pb-1">
          <div className="flex gap-2.5">
            {months.map((mo) => {
              const first = new Date(mo.year, mo.month, 1);
              const lead = first.getDay();
              const daysInMonth = new Date(mo.year, mo.month + 1, 0).getDate();
              const cells: (number | null)[] = [...Array(lead).fill(null)];
              for (let d = 1; d <= daysInMonth; d++) cells.push(d);
              while (cells.length % 7 !== 0) cells.push(null);
              const isFocus = mo.key === focusKey;
              return (
                <div
                  key={mo.key}
                  ref={(el) => { monthRefs.current[mo.key] = el; }}
                  className={cn('shrink-0 rounded-lg border p-2', isFocus ? 'border-brand/40 bg-brand/[0.04]' : 'border-transparent')}
                >
                  <div className="mb-1 text-center text-[11px] font-semibold text-[var(--whale-ink)]">{monthTitleFmt.format(first)}</div>
                  <div className="mb-0.5 grid grid-cols-7 gap-0.5 text-center text-[8px] leading-none text-[var(--whale-ink-muted)]">
                    {weekdays.map((w, i) => <span key={i}>{w}</span>)}
                  </div>
                  <div className="grid grid-cols-7 gap-0.5">
                    {cells.map((d, idx) => {
                      if (d == null) return <span key={idx} style={{ width: CAL_CELL, height: CAL_CELL }} />;
                      const date = new Date(mo.year, mo.month, d);
                      const k = dayKey(date);
                      const total = dayActivity.get(k)?.total ?? 0;
                      return (
                        <span
                          key={idx}
                          onMouseEnter={(e) => {
                            if (total <= 0) { setHover(null); return; }
                            const c = outerRef.current?.getBoundingClientRect();
                            const r = e.currentTarget.getBoundingClientRect();
                            if (c) setHover({ dayKey: k, date, x: r.left - c.left + r.width / 2, y: r.top - c.top });
                          }}
                          onMouseLeave={() => setHover(null)}
                          className={cn(
                            'flex items-center justify-center rounded-[2px] text-[7px] leading-none text-[var(--whale-ink-muted)]',
                            total > 0 && 'cursor-default font-medium text-white',
                            heatTone({ total } as HeatmapDay, maxDayTotal),
                            k === todayStr && 'ring-1 ring-[var(--whale-ink)]'
                          )}
                          style={{ width: CAL_CELL, height: CAL_CELL }}
                        >
                          {d}
                        </span>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Caption + intensity legend */}
      <div className="flex items-center justify-between text-[10px] text-[var(--whale-ink-muted)]">
        <span>{t('insightsHeatCaption')}</span>
        <span className="flex items-center gap-1">
          {t('insightsHeatLess')}
          {[0, 0.25, 0.5, 0.75, 1].map((level) => (
            <span key={level} className={cn('h-2.5 w-2.5 rounded-[2px]', heatTone({ total: Math.round(level * maxDayTotal) } as HeatmapDay, maxDayTotal))} />
          ))}
          {t('insightsHeatMore')}
        </span>
      </div>
    </div>
  );
}

function ModelUsageChart({ stats }: { stats: PanelStats }) {
  const t = useTranslations('dashboard');
  const maxCalls = Math.max(1, ...stats.modelStats.map((item) => item.calls));
  const chartRows = stats.modelStats.slice(0, 6);
  const chartRef = useRef<HTMLDivElement>(null);
  const [hovered, setHovered] = useState<{ index: number; x: number; y: number } | null>(null);

  if (stats.modelStats.length === 0) {
    return (
      <div className="flex h-40 items-center justify-center text-[13px] text-[var(--whale-ink-muted)]">
        {t('insightsNoApiUsage')}
      </div>
    );
  }

  const active = hovered != null ? chartRows[hovered.index] : null;
  const rows = active
    ? [
        { label: t('insightsCallsLabel'), value: `${active.calls} ${t('insightsCallsUnit')}` },
        { label: t('insightsTokens'), value: active.tokens > 0 ? active.tokens.toLocaleString() : t('insightsNotMetered') },
        { label: t('insightsApiCost'), value: active.cost != null ? `$${active.cost.toFixed(4)}` : t('insightsNotMetered') },
        { label: t('insightsApiSuccess'), value: `${Math.round((active.success / active.calls) * 100)}%` },
      ]
    : [];

  const enter = (e: React.MouseEvent, index: number) => {
    const container = chartRef.current?.getBoundingClientRect();
    const rect = e.currentTarget.getBoundingClientRect();
    if (container) {
      // Clamp x so the card stays inside the panel.
      const x = Math.max(72, Math.min(container.width - 72, rect.left - container.left + rect.width / 2));
      setHovered({ index, x, y: rect.top - container.top });
    }
  };

  return (
    <div ref={chartRef} className="relative">
      {/* Hover detail card — follows the hovered bar. */}
      {active && hovered && (
        <div
          className="pointer-events-none absolute z-20 w-36 -translate-x-1/2 -translate-y-full rounded-md border border-[var(--whale-divider)] bg-[var(--whale-card)] px-2 py-1.5 shadow-md"
          style={{ left: hovered.x, top: hovered.y - 4 }}
        >
          <div className="mb-1 flex items-center gap-1.5">
            <span className="h-1.5 w-1.5 shrink-0 rounded-sm" style={{ backgroundColor: modelColor(hovered.index) }} />
            <span className="truncate text-[10px] font-semibold text-[var(--whale-ink)]">{active.model}</span>
          </div>
          <div className="space-y-px">
            {rows.map((r) => (
              <div key={r.label} className="flex items-center justify-between gap-2 text-[9px]">
                <span className="text-[var(--whale-ink-muted)]">{r.label}</span>
                <span className="tabular-nums font-medium text-[var(--whale-ink)]">{r.value}</span>
              </div>
            ))}
          </div>
        </div>
      )}
      <div className="grid grid-cols-[repeat(auto-fit,minmax(80px,1fr))] gap-2 pt-1">
        {chartRows.map((item, index) => (
          <div
            key={`${item.provider}-${item.model}`}
            className="flex cursor-default flex-col items-center"
            onMouseEnter={(e) => enter(e, index)}
            onMouseLeave={() => setHovered((h) => (h?.index === index ? null : h))}
          >
            <div className="relative mb-2 flex h-24 w-full items-end justify-center">
              <div
                className="w-12 rounded-t transition-opacity"
                style={{
                  height: `${Math.max(8, (item.calls / maxCalls) * 96)}px`,
                  backgroundColor: modelColor(index),
                  opacity: hovered == null || hovered.index === index ? 1 : 0.35,
                }}
              />
            </div>
            <div className="truncate text-center text-[11px] font-medium text-[var(--whale-ink)]" title={item.model}>{item.model}</div>
            <div className="mt-0.5 text-[10px] text-[var(--whale-ink-muted)]">{item.calls} {t('insightsCallsUnit')}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function ListPagination({
  page,
  pageCount,
  total,
  onPageChange,
}: {
  page: number;
  pageCount: number;
  total: number;
  onPageChange: (page: number) => void;
}) {
  const t = useTranslations('dashboard');
  const visiblePages = getVisiblePages(page, pageCount);

  return (
    <div className="flex shrink-0 items-center justify-between gap-3 border-t border-[var(--whale-divider)] px-4 py-2">
      <span className="text-[11px] text-[var(--whale-ink-muted)]">{t('insightsTotal', { count: total })}</span>
      <div className="flex items-center gap-1">
        <button
          type="button"
          disabled={page === 0}
          onClick={() => onPageChange(Math.max(0, page - 1))}
          className="inline-flex h-6 w-6 cursor-pointer items-center justify-center rounded-md bg-[var(--whale-cream-soft)] text-[var(--whale-ink-muted)] disabled:cursor-not-allowed disabled:opacity-40"
        >
          <ChevronLeft className="h-3.5 w-3.5" />
        </button>
        {visiblePages.map((item, index) => item === 'ellipsis' ? (
          <span key={`ellipsis-${index}`} className="px-1 text-[11px] text-[var(--whale-ink-muted)]">…</span>
        ) : (
          <button
            key={item}
            type="button"
            onClick={() => onPageChange(item)}
            className={cn(
              'h-6 min-w-6 cursor-pointer rounded-md px-2 text-[11px] font-semibold tabular-nums transition-colors',
              item === page
                ? 'bg-[var(--whale-ink)] text-[var(--whale-cream)]'
                : 'bg-[var(--whale-cream-soft)] text-[var(--whale-ink-muted)] hover:text-[var(--whale-ink)]'
            )}
          >
            {item + 1}
          </button>
        ))}
        <button
          type="button"
          disabled={page >= pageCount - 1}
          onClick={() => onPageChange(Math.min(pageCount - 1, page + 1))}
          className="inline-flex h-6 w-6 cursor-pointer items-center justify-center rounded-md bg-[var(--whale-cream-soft)] text-[var(--whale-ink-muted)] disabled:cursor-not-allowed disabled:opacity-40"
        >
          <ChevronRight className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}

const CELL_INPUT = 'h-6 w-full rounded border border-[var(--whale-divider)] bg-transparent px-1.5 text-[11px] outline-none focus:border-[var(--whale-ink-muted)]';

function ActivityRow({ app }: { app: Application }) {
  const t = useTranslations('dashboard');
  const tJournal = useTranslations('journal');
  const tCommon = useTranslations('common');
  const router = useRouter();
  const updateApplication = useJournalStore((s) => s.updateApplication);
  const updateInterview = useJournalStore((s) => s.updateInterview);
  const deleteApplication = useJournalStore((s) => s.deleteApplication);
  const latest = latestInterview(app);
  const created = new Date(normalizeTimestamp(app.createdAt));
  const tone =
    app.status === 'offer'
      ? 'bg-[var(--whale-mint)]/35 text-[var(--whale-ink)]'
      : app.status === 'rejected' || app.status === 'declined' || app.status === 'ghosted'
        ? 'bg-red-50 text-red-700'
        : 'bg-[var(--whale-cream-deep)] text-[var(--whale-ink-soft)]';

  return (
    <li className="grid grid-cols-[92px_minmax(150px,1.2fr)_104px_minmax(130px,1fr)_96px_150px_70px_40px] items-center gap-2 border-b border-[var(--whale-divider)] px-4 py-2.5 text-[12px] transition-colors hover:bg-[var(--whale-cream-soft)] last:border-b-0">
      <time className="text-[11px] leading-snug text-[var(--whale-ink-muted)] tabular-nums">
        {app.appliedDate}
        <br />
        {created.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
      </time>
      <div className="flex min-w-0 items-center gap-2">
        <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-[var(--whale-divider)] bg-[var(--whale-card)]">
          <Briefcase className="h-4 w-4 text-[var(--whale-ink-soft)]" />
        </span>
        <div className="min-w-0">
          <div className="truncate font-semibold text-[var(--whale-ink)]">{app.company || '—'}</div>
          <div className="mt-0.5 truncate text-[11px] text-[var(--whale-ink-muted)]">{app.role || '—'}</div>
        </div>
      </div>
      {/* Status — inline editable */}
      <Select value={app.status} onValueChange={(v) => updateApplication(app.id, { status: v as ApplicationStatus })}>
        <SelectTrigger size="sm" className={cn('h-7 w-full gap-1 rounded-full border-0 px-2.5 text-[11px] font-medium shadow-none', tone)}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {APP_STATUSES.map((s) => (
            <SelectItem key={s} value={s} className="text-xs">{tJournal(APP_STATUS_KEY[s])}</SelectItem>
          ))}
        </SelectContent>
      </Select>
      {/* HR & contact — inline editable */}
      <div className="flex flex-col gap-0.5">
        <input value={app.hrName || ''} onChange={(e) => updateApplication(app.id, { hrName: e.target.value })} placeholder={tJournal('fieldHrName')} className={CELL_INPUT} />
        <input value={app.hrContact || ''} onChange={(e) => updateApplication(app.id, { hrContact: e.target.value })} placeholder={tJournal('fieldHrContact')} className={CELL_INPUT} />
      </div>
      {/* Latest interview: format */}
      {latest ? (
        <Select value={latest.format ?? 'video'} onValueChange={(v) => updateInterview(app.id, latest.id, { format: v as InterviewFormat })}>
          <SelectTrigger size="sm" className="h-7 w-full text-[11px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            {APP_FORMATS.map((f) => <SelectItem key={f} value={f} className="text-xs">{tJournal(APP_FORMAT_KEY[f])}</SelectItem>)}
          </SelectContent>
        </Select>
      ) : (
        <span className="text-[var(--whale-ink-muted)]">—</span>
      )}
      {/* Latest interview: scheduled time */}
      {latest ? (
        <input
          type="datetime-local"
          value={latest.scheduledAt || ''}
          onChange={(e) => updateInterview(app.id, latest.id, { scheduledAt: e.target.value })}
          className="h-7 w-full rounded border border-[var(--whale-divider)] bg-transparent px-1 text-[10px] outline-none focus:border-[var(--whale-ink-muted)]"
        />
      ) : (
        <span className="text-[var(--whale-ink-muted)]">—</span>
      )}
      {/* Latest interview: duration */}
      {latest ? (
        <input
          type="number"
          min={0}
          value={latest.durationMin ?? ''}
          onChange={(e) => updateInterview(app.id, latest.id, { durationMin: e.target.value ? Number(e.target.value) : undefined })}
          className="h-7 w-full rounded border border-[var(--whale-divider)] bg-transparent px-1.5 text-[11px] tabular-nums outline-none focus:border-[var(--whale-ink-muted)]"
        />
      ) : (
        <span className="text-[var(--whale-ink-muted)]">—</span>
      )}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button type="button" className="inline-flex h-7 w-7 cursor-pointer items-center justify-center rounded-md text-[var(--whale-ink-muted)] hover:bg-[var(--whale-cream-deep)] hover:text-[var(--whale-ink)]">
            <MoreVertical className="h-4 w-4" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={() => router.push(`/editor/${app.resumeId}`)} className="cursor-pointer">
            <FileText className="mr-2 h-4 w-4" />
            {t('insightsRowOpenResume')}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => deleteApplication(app.id)} className="cursor-pointer text-red-600 focus:text-red-600">
            <Trash2 className="mr-2 h-4 w-4" />
            {tCommon('delete')}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </li>
  );
}

function buildPanelStats(
  entries: Application[],
  versions: ResumeVersion[],
  aiLogs: api.AIUsageLogEntry[],
  t: ReturnType<typeof useTranslations>
): PanelStats {
  const successfulAI = aiLogs.filter((log) => log.success).length;
  const aiSuccessRate = aiLogs.length > 0 ? `${Math.round((successfulAI / aiLogs.length) * 100)}%` : '—';
  const avgLatencyValue = aiLogs.length > 0
    ? Math.round(aiLogs.reduce((sum, log) => sum + log.durationMs, 0) / aiLogs.length)
    : 0;
  const favoriteModel = mostCommon(aiLogs.map((log) => log.model).filter(Boolean)) || t('insightsNoDataShort');
  const favoriteProvider = mostCommon(aiLogs.map((log) => log.provider).filter(Boolean)) || t('insightsNoDataShort');
  const measuredCost = aiLogs.reduce((sum, log) => sum + (computeLogCost(log) ?? 0), 0);
  const measuredTokens = aiLogs.reduce((sum, log) => sum + (typeof log.totalTokens === 'number' ? log.totalTokens : 0), 0);
  const costLabel = measuredCost > 0 ? `$${measuredCost.toFixed(4)}` : t('insightsNotMetered');
  const tokensLabel = measuredTokens > 0 ? measuredTokens.toLocaleString() : t('insightsNotMetered');
  const allDayCounts = collectDayCounts(entries, versions, aiLogs);
  const activeDays = Array.from(allDayCounts.values()).filter((count) => count > 0).length;
  const peak = Array.from(allDayCounts.entries()).sort((a, b) => b[1] - a[1])[0];
  const currentStreak = countCurrentStreak(allDayCounts);
  const modelStats = buildModelUsageStats(aiLogs);
  const topModelShare = modelStats.length > 0 && aiLogs.length > 0
    ? `${((modelStats[0].calls / aiLogs.length) * 100).toFixed(1)}%`
    : '—';

  return {
    overviewMetrics: [
      { key: 'active', label: t('insightsActiveDaysDense'), value: String(activeDays), sub: t('insightsPeakDay', { day: peak ? formatShortDate(parseDayKey(peak[0])) : t('insightsNoDataShort') }) },
      { key: 'streak', label: t('insightsCurrentStreak'), value: `${currentStreak}d`, sub: t('insightsActiveStatus') },
      { key: 'ai', label: t('insightsCallsLabel'), value: String(aiLogs.length), sub: t('insightsSuccessfulCalls', { count: successfulAI }) },
      { key: 'success', label: t('insightsApiSuccess'), value: aiSuccessRate, sub: t('insightsAvgLatencyValue', { value: aiLogs.length > 0 ? formatDuration(avgLatencyValue) : '—' }) },
      { key: 'latency', label: t('insightsAvgLatency'), value: aiLogs.length > 0 ? formatDuration(avgLatencyValue) : '—', sub: t('insightsAvgLatencyHint') },
      { key: 'tokens', label: t('insightsTokens'), value: tokensLabel, sub: t('insightsNotMetered') },
      { key: 'cost', label: t('insightsApiCost'), value: costLabel, sub: t('insightsUsageNote') },
      { key: 'model', label: t('insightsFavoriteModel'), value: favoriteModel, sub: favoriteProvider },
    ],
    aiCalls: aiLogs.length,
    aiSuccessRate,
    avgLatency: aiLogs.length > 0 ? formatDuration(avgLatencyValue) : '—',
    favoriteModel,
    favoriteProvider,
    costLabel,
    tokensLabel,
    activeDays,
    currentStreak,
    peakDay: peak ? formatShortDate(parseDayKey(peak[0])) : t('insightsNoDataShort'),
    topModelShare,
    modelStats,
  };
}

function buildHeatmapDays(
  entries: Application[],
  versions: ResumeVersion[],
  aiLogs: api.AIUsageLogEntry[],
  range: InsightRange
): HeatmapDay[] {
  const count = PANEL_DAY_COUNT[range];
  const today = startOfLocalDay(new Date());
  const days: HeatmapDay[] = [];
  const jobCounts = countByDay(entries.map((entry) => entry.createdAt));
  const versionCounts = countByDay(versions.map((version) => version.createdAt));
  const aiCounts = countByDay(aiLogs.map((log) => log.startedAt));

  for (let i = count - 1; i >= 0; i--) {
    const date = new Date(today.getTime() - i * DAY_MS);
    const key = dayKey(date);
    const jobCount = jobCounts.get(key) || 0;
    const aiCount = aiCounts.get(key) || 0;
    const versionCount = versionCounts.get(key) || 0;
    days.push({
      key,
      date,
      jobCount,
      aiCount,
      versionCount,
      total: jobCount + aiCount + versionCount,
    });
  }

  return days;
}

function collectDayCounts(
  entries: Application[],
  versions: ResumeVersion[],
  aiLogs: api.AIUsageLogEntry[]
): Map<string, number> {
  const counts = new Map<string, number>();
  for (const map of [
    countByDay(entries.map((entry) => entry.createdAt)),
    countByDay(versions.map((version) => version.createdAt)),
    countByDay(aiLogs.map((log) => log.startedAt)),
  ]) {
    for (const [key, count] of map) counts.set(key, (counts.get(key) || 0) + count);
  }
  return counts;
}

function countCurrentStreak(counts: Map<string, number>): number {
  const today = startOfLocalDay(new Date());
  let streak = 0;
  for (let i = 0; i < 365; i++) {
    const key = dayKey(new Date(today.getTime() - i * DAY_MS));
    if ((counts.get(key) || 0) <= 0) break;
    streak += 1;
  }
  return streak;
}

function countByDay(timestamps: number[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const value of timestamps) {
    const ms = normalizeTimestamp(value);
    if (!Number.isFinite(ms)) continue;
    const key = dayKey(new Date(ms));
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  return counts;
}

function getRangeStart(range: InsightRange): number | null {
  if (range === 'all') return null;
  const days = range === '7d' ? 7 : 30;
  const today = startOfLocalDay(new Date());
  return today.getTime() - (days - 1) * DAY_MS;
}

function isInRange(timestamp: number, rangeStart: number | null): boolean {
  if (rangeStart === null) return true;
  return normalizeTimestamp(timestamp) >= rangeStart;
}

function normalizeTimestamp(value: number): number {
  return value < 10_000_000_000 ? value * 1000 : value;
}

function startOfLocalDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function dayKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function parseDayKey(key: string): Date {
  const [year, month, day] = key.split('-').map(Number);
  return new Date(year, month - 1, day);
}

function heatTone(day: HeatmapDay, maxTotal: number): string {
  if (day.total === 0) return 'bg-gray-100';
  const ratio = day.total / maxTotal;
  if (ratio >= 0.75) return 'bg-blue-600';
  if (ratio >= 0.5) return 'bg-blue-500';
  if (ratio >= 0.25) return 'bg-blue-400';
  return 'bg-blue-300';
}

function formatShortDate(date: Date): string {
  return `${date.getMonth() + 1}/${date.getDate()}`;
}

function formatDuration(ms: number): string {
  if (!Number.isFinite(ms) || ms <= 0) return '—';
  if (ms < 1000) return `${Math.round(ms)}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(ms < 10_000 ? 1 : 0)}s`;
  return `${Math.round(ms / 60_000)}m`;
}

function buildModelUsageStats(aiLogs: api.AIUsageLogEntry[]): ModelUsageStat[] {
  const byModel = new Map<string, {
    model: string;
    provider: string;
    calls: number;
    success: number;
    totalDuration: number;
    lastUsed: number;
    tokens: number;
    cost: number;
    costKnown: boolean;
  }>();

  for (const log of aiLogs) {
    const model = (log.model || '').trim();
    if (!model || model === 'unknown') continue;
    const provider = (log.provider || 'unknown').trim();
    const key = `${provider}::${model}`;
    const current = byModel.get(key) || {
      model,
      provider,
      calls: 0,
      success: 0,
      totalDuration: 0,
      lastUsed: 0,
      tokens: 0,
      cost: 0,
      costKnown: false,
    };
    current.calls += 1;
    current.success += log.success ? 1 : 0;
    current.totalDuration += log.durationMs;
    current.lastUsed = Math.max(current.lastUsed, log.startedAt);
    current.tokens += typeof log.totalTokens === 'number' ? log.totalTokens : 0;
    const c = computeLogCost(log);
    if (c != null) {
      current.cost += c;
      current.costKnown = true;
    }
    byModel.set(key, current);
  }

  return Array.from(byModel.values())
    .sort((a, b) => b.calls - a.calls || b.lastUsed - a.lastUsed)
    .map((item) => ({
      model: item.model,
      provider: item.provider,
      calls: item.calls,
      success: item.success,
      avgLatency: formatDuration(Math.round(item.totalDuration / item.calls)),
      tokens: item.tokens,
      cost: item.costKnown ? item.cost : null,
    }));
}

function modelColor(index: number): string {
  return ['#1f1d1a', '#4f7dd9', '#7aa2e8', '#9cbcf2', '#d9a441'][index % 5];
}

function getVisiblePages(current: number, pageCount: number): Array<number | 'ellipsis'> {
  if (pageCount <= 7) return Array.from({ length: pageCount }, (_, index) => index);
  const pages = new Set([0, pageCount - 1, current - 1, current, current + 1]);
  const sorted = Array.from(pages)
    .filter((item) => item >= 0 && item < pageCount)
    .sort((a, b) => a - b);
  const result: Array<number | 'ellipsis'> = [];
  sorted.forEach((item, index) => {
    const prev = sorted[index - 1];
    if (index > 0 && item - prev > 1) result.push('ellipsis');
    result.push(item);
  });
  return result;
}

function mostCommon(items: string[]): string {
  const counts = new Map<string, number>();
  for (const item of items) {
    const key = item.trim();
    if (!key || key === 'unknown') continue;
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  return Array.from(counts.entries()).sort((a, b) => b[1] - a[1])[0]?.[0] || '';
}
