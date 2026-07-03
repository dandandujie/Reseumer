'use client';

import { useEffect, useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
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
  type ApplicationEntry,
  type DebriefEntry,
  type InterviewEntry,
  type JournalEntry,
  type JournalEntryType,
  type OutcomeEntry,
} from '@/stores/journal-store';
import { useResume } from '@/hooks/use-resume';
import { cn } from '@/lib/utils';
import * as api from '@/lib/tauri-api';
import type { ResumeVersion } from '@/types/resume';

type ActivityFilter = 'all' | 'pending' | JournalEntryType | 'evolution';
type InsightRange = 'all' | '30d' | '7d';
type InsightPanelView = 'overview' | 'models';
type SortMode = 'newest' | 'oldest';

const DAY_MS = 24 * 60 * 60 * 1000;
const ACTIVITY_PAGE_SIZE = 5;
const PANEL_DAY_COUNT: Record<InsightRange, number> = {
  all: 84,
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
}

interface PanelMetric {
  key: string;
  label: string;
  value: string;
  sub: string;
}

interface PanelStats {
  overviewMetrics: PanelMetric[];
  heatmapDays: HeatmapDay[];
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
  const byResume = useJournalStore((s) => s.byResume);
  const { resumes, fetchResumes } = useResume();
  const [versions, setVersions] = useState<ResumeVersion[]>([]);
  const [aiUsageLogs, setAIUsageLogs] = useState<api.AIUsageLogEntry[]>([]);
  const [filter, setFilter] = useState<ActivityFilter>('all');
  const [range, setRange] = useState<InsightRange>('30d');
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

  const agg = useMemo(() => aggregateJournal(byResume), [byResume]);
  const activityEntries = useMemo(
    () => Object.values(byResume).flat().sort((a, b) => b.createdAt - a.createdAt),
    [byResume]
  );
  const versionCount = versions.length;
  const rangeStart = useMemo(() => getRangeStart(range), [range]);
  const rangeEntries = useMemo(
    () => activityEntries.filter((entry) => isInRange(entry.createdAt, rangeStart)),
    [activityEntries, rangeStart]
  );
  const rangeVersions = useMemo(
    () => versions.filter((version) => isInRange(version.createdAt, rangeStart)),
    [versions, rangeStart]
  );
  const rangeAIUsageLogs = useMemo(
    () => aiUsageLogs.filter((log) => isInRange(log.startedAt, rangeStart)),
    [aiUsageLogs, rangeStart]
  );
  const panelStats = useMemo(
    () => buildPanelStats(rangeEntries, rangeVersions, rangeAIUsageLogs, range, t),
    [rangeAIUsageLogs, rangeEntries, rangeVersions, range, t]
  );
  const resumeMap = useMemo(() => {
    const m = new Map<string, string>();
    resumes.forEach((r) => m.set(r.id, r.title));
    return m;
  }, [resumes]);

  const baseFilteredEntries = useMemo(() => {
    if (filter === 'all') return activityEntries;
    if (filter === 'pending') {
      return activityEntries.filter(
        (entry): entry is ApplicationEntry =>
          entry.type === 'application' &&
          ['submitted', 'screening', 'interview'].includes(entry.status)
      );
    }
    if (filter === 'evolution') return [];
    return activityEntries.filter((entry) => entry.type === filter);
  }, [activityEntries, filter]);

  const filteredEntries = useMemo(() => {
    const keyword = query.trim().toLowerCase();
    const matched = keyword
      ? baseFilteredEntries.filter((entry) => searchableEntryText(entry, resumeMap).includes(keyword))
      : baseFilteredEntries;
    return [...matched].sort((a, b) => sortMode === 'newest' ? b.createdAt - a.createdAt : a.createdAt - b.createdAt);
  }, [baseFilteredEntries, query, resumeMap, sortMode]);

  useEffect(() => {
    setPage(0);
  }, [filter, filteredEntries.length, query, sortMode]);

  const pageCount = Math.max(1, Math.ceil(filteredEntries.length / ACTIVITY_PAGE_SIZE));
  const currentPage = Math.min(page, pageCount - 1);
  const pagedEntries = filteredEntries.slice(
    currentPage * ACTIVITY_PAGE_SIZE,
    currentPage * ACTIVITY_PAGE_SIZE + ACTIVITY_PAGE_SIZE
  );

  const filters: { key: ActivityFilter; label: string; count: number }[] = [
    { key: 'all', label: t('insightsFilterAll'), count: activityEntries.length },
    { key: 'pending', label: t('journalPending'), count: agg.pendingCount },
    { key: 'application', label: t('journalApplications'), count: agg.totalApplications },
    { key: 'interview', label: t('journalInterviews'), count: agg.totalInterviews },
    { key: 'outcome', label: tJournal('tabOutcome'), count: agg.totalOutcomes },
    { key: 'debrief', label: tJournal('tabDebrief'), count: activityEntries.filter((e) => e.type === 'debrief').length },
    { key: 'evolution', label: t('resumeEvolution'), count: versionCount },
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

        <div className="grid shrink-0 gap-4 lg:grid-cols-[minmax(0,380px)_minmax(0,1fr)]">
          <ActivityOverviewPanel
            range={range}
            onRangeChange={setRange}
            view={panelView}
            onViewChange={setPanelView}
            stats={panelStats}
          />
          <ActivitySummary stats={panelStats} />
        </div>

        <section className="flex shrink-0 flex-nowrap items-center gap-2 overflow-x-auto">
          {filters.map((item) => (
            <button
              key={item.key}
              type="button"
              onClick={() => {
                if (item.key === 'evolution') {
                  router.push('/insights/evolution');
                  return;
                }
                setFilter(item.key);
              }}
              className={cn(
                'inline-flex shrink-0 cursor-pointer items-center gap-2 rounded-full px-3 py-1.5 text-[12px] font-medium transition-colors',
                filter === item.key
                  ? 'bg-[var(--whale-ink)] text-[var(--whale-cream)]'
                  : 'bg-[var(--whale-card)] text-[var(--whale-ink-soft)] hover:bg-[var(--whale-cream-soft)]'
              )}
            >
              <span>{item.label}</span>
              <span className={cn(
                'rounded-full px-1.5 py-0.5 text-[10px] tabular-nums',
                filter === item.key ? 'bg-[var(--whale-cream)]/14' : 'bg-[var(--whale-cream-deep)] text-[var(--whale-ink-muted)]'
              )}>
                {item.count}
              </span>
            </button>
          ))}
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
            <select
              value={sortMode}
              onChange={(event) => setSortMode(event.target.value as SortMode)}
              className="h-8 cursor-pointer rounded-lg border border-[var(--whale-divider)] bg-[var(--whale-card)] px-3 text-[12px] font-medium text-[var(--whale-ink-soft)] outline-none"
            >
              <option value="newest">{t('insightsSortNewest')}</option>
              <option value="oldest">{t('insightsSortOldest')}</option>
            </select>
          </div>
          <div className="grid shrink-0 grid-cols-[100px_minmax(200px,1fr)_100px_130px_130px_minmax(100px,1fr)_40px] gap-3 border-b border-[var(--whale-divider)] bg-[var(--whale-cream-soft)] px-4 py-2 text-[10px] font-semibold uppercase tracking-wider text-[var(--whale-ink-muted)]">
            <span>{t('insightsColumnTime')}</span>
            <span>{t('insightsColumnCompanyRole')}</span>
            <span>{t('insightsColumnStatus')}</span>
            <span>{t('insightsColumnProgress')}</span>
            <span>{t('insightsColumnAIAnalysis')}</span>
            <span>{t('insightsColumnNotes')}</span>
            <span className="text-right">{t('insightsColumnAction')}</span>
          </div>
          {filteredEntries.length === 0 ? (
            <div className="flex min-h-0 flex-1 items-center justify-center text-[13px] text-[var(--whale-ink-muted)]">
              {activityEntries.length === 0 ? t('journalEmpty') : t('insightsNoFilteredActivity')}
            </div>
          ) : (
            <ul className="min-h-0 flex-1 overflow-y-auto">
              {pagedEntries.map((entry) => (
                <ActivityRow
                  key={entry.id}
                  entry={entry}
                  resumeTitle={resumeMap.get(entry.resumeId)}
                />
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

function ActivityOverviewPanel({
  range,
  onRangeChange,
  view,
  onViewChange,
  stats,
}: {
  range: InsightRange;
  onRangeChange: (range: InsightRange) => void;
  view: InsightPanelView;
  onViewChange: (view: InsightPanelView) => void;
  stats: PanelStats;
}) {
  const t = useTranslations('dashboard');

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
        <select
          value={range}
          onChange={(event) => onRangeChange(event.target.value as InsightRange)}
          className="h-7 cursor-pointer rounded-lg border border-[var(--whale-divider)] bg-[var(--whale-card)] px-2.5 text-[12px] font-medium text-[var(--whale-ink-soft)] outline-none"
        >
          <option value="all">{t('insightsRangeAll')}</option>
          <option value="30d">{t('insightsRange30d')}</option>
          <option value="7d">{t('insightsRange7d')}</option>
        </select>
      </div>
      <div className="flex-1 p-4">
        {view === 'overview' ? <ActivityMatrix stats={stats} /> : <ModelUsageChart stats={stats} />}
      </div>
    </section>
  );
}

function ActivitySummary({ stats }: { stats: PanelStats }) {
  return (
    <div className="grid grid-cols-2 gap-3 rounded-xl border border-[var(--whale-divider)] bg-[var(--whale-card)] p-4 shadow-sm">
      {stats.overviewMetrics.slice(0, 8).map((metric) => (
        <div key={metric.key} className="min-w-0">
          <div className="truncate text-[11px] font-medium text-[var(--whale-ink-muted)]">{metric.label}</div>
          <div className="mt-1 truncate text-[22px] font-bold leading-none text-[var(--whale-ink)]">{metric.value}</div>
        </div>
      ))}
    </div>
  );
}

function ActivityMatrix({ stats }: { stats: PanelStats }) {
  const maxTotal = Math.max(1, ...stats.heatmapDays.map((day) => day.total));
  const rows = 8;
  const cellSize = 10;
  const gap = 2;
  // 计算容器宽度大约能放多少列（假设容器宽度约 340px）
  const targetCols = Math.floor(340 / (cellSize + gap));
  const totalCells = rows * targetCols;

  // 用空白方格填充不足的部分
  const allCells = [...stats.heatmapDays];
  while (allCells.length < totalCells) {
    allCells.push({
      key: `empty-${allCells.length}`,
      date: new Date(),
      jobCount: 0,
      aiCount: 0,
      versionCount: 0,
      total: 0
    });
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-4 gap-2">
        {stats.overviewMetrics.slice(0, 4).map((metric) => (
          <div key={metric.key} className="rounded-lg bg-gray-100 p-2.5">
            <div className="truncate text-[10px] font-medium text-[var(--whale-ink-muted)]">{metric.label}</div>
            <div className="mt-1 truncate text-[18px] font-bold leading-none text-[var(--whale-ink)]">{metric.value}</div>
          </div>
        ))}
      </div>
      <div
        className="grid grid-flow-col gap-0.5"
        style={{ gridTemplateColumns: `repeat(${targetCols}, ${cellSize}px)`, gridTemplateRows: `repeat(${rows}, ${cellSize}px)` }}
      >
        {allCells.slice(0, totalCells).map((day) => (
          <span
            key={day.key}
            title={day.total > 0 ? `${formatShortDate(day.date)} · ${day.total} 活动` : ''}
            className={cn('h-2.5 w-2.5', heatTone(day, maxTotal))}
          />
        ))}
      </div>
    </div>
  );
}

function ModelUsageChart({ stats }: { stats: PanelStats }) {
  const t = useTranslations('dashboard');
  const maxCalls = Math.max(1, ...stats.modelStats.map((item) => item.calls));
  const chartRows = stats.modelStats.slice(0, 6);

  if (stats.modelStats.length === 0) {
    return (
      <div className="flex h-40 items-center justify-center text-[13px] text-[var(--whale-ink-muted)]">
        {t('insightsNoApiUsage')}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-[repeat(auto-fit,minmax(80px,1fr))] gap-2">
        {chartRows.map((item, index) => (
          <div key={`${item.provider}-${item.model}`} className="flex flex-col items-center">
            <div className="relative mb-2 flex h-24 w-full items-end justify-center">
              <div
                className="w-12 rounded-t"
                style={{
                  height: `${Math.max(8, (item.calls / maxCalls) * 96)}px`,
                  backgroundColor: modelColor(index),
                }}
              />
            </div>
            <div className="truncate text-center text-[11px] font-medium text-[var(--whale-ink)]">{item.model}</div>
            <div className="mt-0.5 text-[10px] text-[var(--whale-ink-muted)]">{item.calls} 次</div>
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

function ActivityRow({ entry }: { entry: JournalEntry; resumeTitle?: string }) {
  const t = useTranslations('dashboard');
  const tJournal = useTranslations('journal');
  const desc = describeEntry(entry, tJournal);
  const Icon = desc.Icon;
  const progress = getProgressInfo(entry, t);
  const insight = getAIInsight(entry, t);
  const timeParts = formatEntryDateParts(entry);
  const notes = getEntryNotes(entry);

  return (
    <li className="grid grid-cols-[100px_minmax(200px,1fr)_100px_130px_130px_minmax(100px,1fr)_40px] items-center gap-3 border-b border-[var(--whale-divider)] px-4 py-3 text-[12px] transition-colors hover:bg-[var(--whale-cream-soft)] last:border-b-0">
      <time className="text-[11px] leading-snug text-[var(--whale-ink-muted)] tabular-nums">
        {timeParts.date}<br/>{timeParts.time}
      </time>
      <div className="flex min-w-0 items-center gap-2.5">
        <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-[var(--whale-divider)] bg-[var(--whale-card)]">
          <Icon className="h-4 w-4 text-[var(--whale-ink-soft)]" />
        </span>
        <div className="min-w-0">
          <div className="truncate font-semibold text-[var(--whale-ink)]">{desc.company}</div>
          <div className="mt-0.5 truncate text-[11px] text-[var(--whale-ink-muted)]">{desc.role}</div>
        </div>
      </div>
      <span className={cn('h-fit w-fit max-w-full truncate rounded-full px-2.5 py-1 text-[11px] font-medium', desc.toneClass)}>
        {desc.status}
      </span>
      <div className="flex items-center gap-1.5">
        {Array.from({ length: progress.total }, (_, index) => (
          <span
            key={index}
            className={cn(
              'h-2 w-2 rounded-full',
              index < progress.current
                ? 'bg-[var(--whale-ink)]'
                : 'bg-[var(--whale-divider)]'
            )}
          />
        ))}
        <span className="ml-1 text-[11px] text-[var(--whale-ink-muted)]">{progress.current}/{progress.total}</span>
      </div>
      <div className="truncate text-[11px] text-[var(--whale-ink-soft)]">{typeof insight === 'string' ? insight : insight.label}</div>
      <div className="truncate text-[11px] text-[var(--whale-ink-muted)]">{notes}</div>
      <button
        type="button"
        className="inline-flex h-7 w-7 cursor-pointer items-center justify-center rounded-md text-[var(--whale-ink-muted)] hover:bg-[var(--whale-cream-deep)] hover:text-[var(--whale-ink)]"
      >
        <MoreVertical className="h-4 w-4" />
      </button>
    </li>
  );
}

function describeEntry(entry: JournalEntry, tJournal: ReturnType<typeof useTranslations>): {
  Icon: typeof Briefcase;
  typeLabel: string;
  company: string;
  role: string;
  meta?: string;
  status: string;
  toneClass: string;
} {
  if (entry.type === 'application') {
    const a = entry as ApplicationEntry;
    return {
      Icon: Briefcase,
      typeLabel: tJournal('tabApplication'),
      company: a.company || '—',
      role: a.role || '—',
      meta: a.channel,
      status: tJournal(`status${cap(a.status)}`),
      toneClass: a.status === 'offer'
        ? 'bg-[var(--whale-mint)]/35 text-[var(--whale-ink)]'
        : a.status === 'rejected'
          ? 'bg-red-50 text-red-700'
          : 'bg-[var(--whale-cream-deep)] text-[var(--whale-ink-soft)]',
    };
  }
  if (entry.type === 'interview') {
    const i = entry as InterviewEntry;
    return {
      Icon: MessageSquare,
      typeLabel: tJournal('tabInterview'),
      company: i.company || '—',
      role: i.role || '—',
      meta: i.round || i.topics,
      status: i.round || tJournal('tabInterview'),
      toneClass: 'bg-[var(--whale-cream-deep)] text-[var(--whale-ink-soft)]',
    };
  }
  if (entry.type === 'outcome') {
    const o = entry as OutcomeEntry;
    return {
      Icon: o.outcome === 'offer' ? CheckCircle2 : XCircle,
      typeLabel: tJournal('tabOutcome'),
      company: o.company || '—',
      role: o.role || '—',
      meta: o.reason || o.reflection,
      status: tJournal(`outcome${cap(o.outcome)}`),
      toneClass: o.outcome === 'offer' ? 'bg-[var(--whale-mint)]/35 text-[var(--whale-ink)]' : 'bg-red-50 text-red-700',
    };
  }
  const d = entry as DebriefEntry;
  return {
    Icon: BookOpenCheck,
    typeLabel: tJournal('tabDebrief'),
    company: d.title || '—',
    role: tJournal('tabDebrief'),
    meta: d.improvements,
    status: tJournal('tabDebrief'),
    toneClass: 'bg-[var(--whale-cream-deep)] text-[var(--whale-ink-soft)]',
  };
}

function formatEntryDate(entry: JournalEntry) {
  const date =
    entry.type === 'application' || entry.type === 'interview'
      ? entry.date
      : undefined;
  if (date) return date;
  return new Date(entry.createdAt).toLocaleDateString();
}

function formatEntryDateParts(entry: JournalEntry): { date: string; time: string } {
  const date = formatEntryDate(entry);
  const created = new Date(normalizeTimestamp(entry.createdAt));
  return {
    date,
    time: created.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
  };
}

function searchableEntryText(entry: JournalEntry, resumeMap: Map<string, string>): string {
  const parts = [resumeMap.get(entry.resumeId), entry.type];
  if (entry.type === 'application') {
    parts.push(entry.company, entry.role, entry.channel, entry.contact, entry.jdSnippet, entry.notes, entry.status);
  } else if (entry.type === 'interview') {
    parts.push(entry.company, entry.role, entry.round, entry.format, entry.interviewer, entry.topics, entry.notes);
  } else if (entry.type === 'outcome') {
    parts.push(entry.company, entry.role, entry.outcome, entry.reason, entry.reflection);
  } else {
    parts.push(entry.title, entry.wins, entry.losses, entry.improvements);
  }
  return parts.filter(Boolean).join(' ').toLowerCase();
}

function getProgressInfo(entry: JournalEntry, t: ReturnType<typeof useTranslations>): {
  current: number;
  total: number;
  label: string;
} {
  const total = 6;
  if (entry.type === 'application') {
    const statusStep: Record<ApplicationEntry['status'], number> = {
      submitted: 1,
      screening: 2,
      interview: 4,
      offer: 6,
      rejected: 6,
      declined: 6,
      ghosted: 6,
    };
    return {
      current: statusStep[entry.status] || 1,
      total,
      label: t(`insightsProgress${cap(entry.status)}`),
    };
  }
  if (entry.type === 'interview') {
    return { current: 4, total, label: entry.round || t('journalInterviews') };
  }
  if (entry.type === 'outcome') {
    return { current: 6, total, label: t(`insightsProgress${cap(entry.outcome)}`) };
  }
  return { current: 2, total, label: t('journalViewDetails') };
}

function getAIInsight(entry: JournalEntry, t: ReturnType<typeof useTranslations>): {
  label: string;
  hint: string;
  toneClass: string;
} {
  const fields = entry.type === 'application'
    ? [entry.jdSnippet, entry.notes, entry.channel, entry.contact]
    : entry.type === 'interview'
      ? [entry.topics, entry.notes, entry.interviewer]
      : entry.type === 'outcome'
        ? [entry.reason, entry.reflection]
        : [entry.wins, entry.losses, entry.improvements];
  const filled = fields.filter((value) => value && value.trim()).length;
  if (filled >= 2) {
    return {
      label: t('insightsAIReady'),
      hint: t('insightsAIReadyHint'),
      toneClass: 'bg-[var(--whale-mint)]/45 text-[var(--whale-ink)]',
    };
  }
  if (filled === 1) {
    return {
      label: t('insightsAINeedContext'),
      hint: t('insightsAINeedContextHint'),
      toneClass: 'bg-[var(--whale-cream-deep)] text-[var(--whale-ink-soft)]',
    };
  }
  return {
    label: t('insightsAIPending'),
    hint: t('insightsAIPendingHint'),
    toneClass: 'bg-[var(--whale-cream-soft)] text-[var(--whale-ink-muted)]',
  };
}

function getEntryNotes(entry: JournalEntry): string {
  if (entry.type === 'application') return entry.notes || entry.jdSnippet || '—';
  if (entry.type === 'interview') return entry.notes || entry.topics || '—';
  if (entry.type === 'outcome') return entry.reflection || entry.reason || '—';
  return entry.improvements || entry.wins || entry.losses || '—';
}

function cap(s: string): string {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : '';
}

function buildPanelStats(
  entries: JournalEntry[],
  versions: ResumeVersion[],
  aiLogs: api.AIUsageLogEntry[],
  range: InsightRange,
  t: ReturnType<typeof useTranslations>
): PanelStats {
  const successfulAI = aiLogs.filter((log) => log.success).length;
  const aiSuccessRate = aiLogs.length > 0 ? `${Math.round((successfulAI / aiLogs.length) * 100)}%` : '—';
  const avgLatencyValue = aiLogs.length > 0
    ? Math.round(aiLogs.reduce((sum, log) => sum + log.durationMs, 0) / aiLogs.length)
    : 0;
  const favoriteModel = mostCommon(aiLogs.map((log) => log.model).filter(Boolean)) || t('insightsNoDataShort');
  const favoriteProvider = mostCommon(aiLogs.map((log) => log.provider).filter(Boolean)) || t('insightsNoDataShort');
  const measuredCost = aiLogs.reduce((sum, log) => sum + (typeof log.costUsd === 'number' ? log.costUsd : 0), 0);
  const measuredTokens = aiLogs.reduce((sum, log) => sum + (typeof log.totalTokens === 'number' ? log.totalTokens : 0), 0);
  const costLabel = measuredCost > 0 ? `$${measuredCost.toFixed(4)}` : t('insightsNotMetered');
  const tokensLabel = measuredTokens > 0 ? measuredTokens.toLocaleString() : t('insightsNotMetered');
  const heatmapDays = buildHeatmapDays(entries, versions, aiLogs, range);
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
    heatmapDays,
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
  entries: JournalEntry[],
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
  entries: JournalEntry[],
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
    };
    current.calls += 1;
    current.success += log.success ? 1 : 0;
    current.totalDuration += log.durationMs;
    current.lastUsed = Math.max(current.lastUsed, log.startedAt);
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
