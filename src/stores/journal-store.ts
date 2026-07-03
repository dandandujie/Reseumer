import { create } from 'zustand';
import { generateId } from '@/lib/utils';

/* ────────────────────────────────────────────────────────────────────────────
   Resume journal — per-resume entries the user records about their job search
   journey: applications, interviews, outcomes, retrospectives. Stored in
   localStorage so it survives reloads without needing a backend migration.
   Acts as a knowledge base for the AI chat (scoped to the current resume).
   ──────────────────────────────────────────────────────────────────────────── */

export type JournalEntryType = 'application' | 'interview' | 'outcome' | 'debrief';

interface JournalBase {
  id: string;
  resumeId: string;
  type: JournalEntryType;
  createdAt: number;
  updatedAt: number;
}

export type ApplicationStatus =
  | 'submitted'
  | 'screening'
  | 'interview'
  | 'offer'
  | 'rejected'
  | 'declined'
  | 'ghosted';

export interface ApplicationEntry extends JournalBase {
  type: 'application';
  company: string;
  role: string;
  channel?: string;
  date: string;
  status: ApplicationStatus;
  contact?: string;
  jdSnippet?: string;
  notes?: string;
}

export interface InterviewEntry extends JournalBase {
  type: 'interview';
  company: string;
  role: string;
  round: string;
  date: string;
  format?: 'phone' | 'video' | 'onsite' | 'take-home';
  interviewer?: string;
  topics?: string;
  notes?: string;
}

export type Outcome = 'offer' | 'rejected' | 'withdrew' | 'ghosted';

export interface OutcomeEntry extends JournalBase {
  type: 'outcome';
  company: string;
  role: string;
  outcome: Outcome;
  reason?: string;
  reflection?: string;
}

export interface DebriefEntry extends JournalBase {
  type: 'debrief';
  title: string;
  wins?: string;
  losses?: string;
  improvements?: string;
}

export type JournalEntry =
  | ApplicationEntry
  | InterviewEntry
  | OutcomeEntry
  | DebriefEntry;

const STORAGE_KEY = 'jade_journal_v1';

function loadAll(): Record<string, JournalEntry[]> {
  if (typeof window === 'undefined') return {};
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return {};
    return parsed as Record<string, JournalEntry[]>;
  } catch {
    return {};
  }
}

function persistAll(data: Record<string, JournalEntry[]>) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch {
    /* quota / privacy mode — silent ignore */
  }
}

interface JournalStore {
  byResume: Record<string, JournalEntry[]>;
  hydrate: () => void;
  entriesFor: (resumeId: string) => JournalEntry[];
  add: (entry: Omit<JournalEntry, 'id' | 'createdAt' | 'updatedAt'>) => JournalEntry;
  update: (id: string, patch: Partial<JournalEntry>) => void;
  remove: (id: string) => void;
  clearForResume: (resumeId: string) => void;
}

export const useJournalStore = create<JournalStore>((set, get) => ({
  byResume: {},

  hydrate: () => {
    set({ byResume: loadAll() });
  },

  entriesFor: (resumeId) => {
    const all = get().byResume[resumeId] || [];
    // newest first
    return [...all].sort((a, b) => b.createdAt - a.createdAt);
  },

  add: (entry) => {
    const now = Date.now();
    const full = {
      ...entry,
      id: generateId(),
      createdAt: now,
      updatedAt: now,
    } as JournalEntry;
    set((state) => {
      const list = state.byResume[entry.resumeId] || [];
      const next = { ...state.byResume, [entry.resumeId]: [...list, full] };
      persistAll(next);
      return { byResume: next };
    });
    return full;
  },

  update: (id, patch) => {
    set((state) => {
      const next: Record<string, JournalEntry[]> = {};
      for (const [rid, list] of Object.entries(state.byResume)) {
        next[rid] = list.map((e) =>
          e.id === id ? ({ ...e, ...patch, updatedAt: Date.now() } as JournalEntry) : e
        );
      }
      persistAll(next);
      return { byResume: next };
    });
  },

  remove: (id) => {
    set((state) => {
      const next: Record<string, JournalEntry[]> = {};
      for (const [rid, list] of Object.entries(state.byResume)) {
        next[rid] = list.filter((e) => e.id !== id);
      }
      persistAll(next);
      return { byResume: next };
    });
  },

  clearForResume: (resumeId) => {
    set((state) => {
      const next = { ...state.byResume };
      delete next[resumeId];
      persistAll(next);
      return { byResume: next };
    });
  },
}));

/* ─── Aggregations used by the dashboard analytics card ─── */

export interface JournalAggregate {
  totalApplications: number;
  totalInterviews: number;
  totalOutcomes: number;
  offerCount: number;
  rejectCount: number;
  pendingCount: number;
  successRate: number; // offers / (offers + rejects), 0..1
  topCompanies: { company: string; count: number }[];
  byStatus: Record<ApplicationStatus, number>;
  recentEntries: JournalEntry[];
}

export function aggregateJournal(byResume: Record<string, JournalEntry[]>): JournalAggregate {
  const all = Object.values(byResume).flat();
  const apps = all.filter((e): e is ApplicationEntry => e.type === 'application');
  const ints = all.filter((e): e is InterviewEntry => e.type === 'interview');
  const outs = all.filter((e): e is OutcomeEntry => e.type === 'outcome');

  const offerCount = outs.filter((o) => o.outcome === 'offer').length;
  const rejectCount = outs.filter((o) => o.outcome === 'rejected').length;
  const pendingCount = apps.filter(
    (a) => a.status === 'submitted' || a.status === 'screening' || a.status === 'interview'
  ).length;

  const companies: Record<string, number> = {};
  for (const a of apps) {
    const k = a.company.trim();
    if (k) companies[k] = (companies[k] || 0) + 1;
  }
  const topCompanies = Object.entries(companies)
    .map(([company, count]) => ({ company, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);

  const byStatus: Record<ApplicationStatus, number> = {
    submitted: 0,
    screening: 0,
    interview: 0,
    offer: 0,
    rejected: 0,
    declined: 0,
    ghosted: 0,
  };
  for (const a of apps) byStatus[a.status]++;

  const recentEntries = [...all].sort((a, b) => b.createdAt - a.createdAt).slice(0, 6);

  return {
    totalApplications: apps.length,
    totalInterviews: ints.length,
    totalOutcomes: outs.length,
    offerCount,
    rejectCount,
    pendingCount,
    successRate:
      offerCount + rejectCount > 0 ? offerCount / (offerCount + rejectCount) : 0,
    topCompanies,
    byStatus,
    recentEntries,
  };
}

/** Summarize a resume's journal for the AI knowledge base (≤ ~600 chars). */
export function summarizeForAI(entries: JournalEntry[]): string {
  if (entries.length === 0) return '';
  const apps = entries.filter((e): e is ApplicationEntry => e.type === 'application');
  const ints = entries.filter((e): e is InterviewEntry => e.type === 'interview');
  const outs = entries.filter((e): e is OutcomeEntry => e.type === 'outcome');
  const debs = entries.filter((e): e is DebriefEntry => e.type === 'debrief');

  const lines: string[] = [];
  if (apps.length > 0) {
    lines.push(`投递（${apps.length}）：` + apps.slice(0, 5).map((a) => `${a.company}·${a.role}[${a.status}]`).join('；'));
  }
  if (ints.length > 0) {
    lines.push(`面试（${ints.length}）：` + ints.slice(0, 5).map((i) => `${i.company}·${i.round}`).join('；'));
  }
  if (outs.length > 0) {
    lines.push(`结果（${outs.length}）：` + outs.slice(0, 5).map((o) => `${o.company}·${o.outcome}${o.reason ? ` (${o.reason.slice(0, 30)})` : ''}`).join('；'));
  }
  if (debs.length > 0) {
    lines.push(`复盘要点：` + debs.slice(0, 3).map((d) => d.title).join('；'));
  }
  return lines.join('\n');
}
