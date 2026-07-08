import { create } from 'zustand';
import { generateId } from '@/lib/utils';

/* ────────────────────────────────────────────────────────────────────────────
   Resume journal (v2) — thread-based job-search CRM.

   The primary unit is an **Application**: one job application thread (company +
   role + this specific attempt). Each application OWNS its interview rounds and
   its outcome, so a résumé can have many applications, each with its own
   multi-round interview history. There is one source of truth per field, so
   editing anywhere syncs everywhere (dynamics list, journal dialog, funnel, AI).

   Mock-interview archives (from the interview assistant) are kept separately
   since they aren't tied to a real application.
   ──────────────────────────────────────────────────────────────────────────── */

export type ApplicationStatus =
  | 'submitted'
  | 'screening'
  | 'interview'
  | 'offer'
  | 'rejected'
  | 'declined'
  | 'ghosted';

export type InterviewFormat = 'phone' | 'video' | 'onsite' | 'take-home' | 'other';
export type OutcomeResult = 'offer' | 'rejected' | 'withdrew' | 'ghosted';

export interface InterviewRound {
  id: string;
  round: string; // 一面 / 二面 / HR 面 …
  format?: InterviewFormat;
  scheduledAt?: string; // 约定面试时间 (YYYY-MM-DDTHH:mm)
  durationMin?: number; // 面试时长（分钟）
  interviewer?: string;
  topics?: string;
  notes?: string;
  createdAt: number;
}

export interface Outcome {
  result: OutcomeResult;
  reason?: string;
  reflection?: string;
  date?: string;
}

export interface Application {
  id: string;
  resumeId: string;
  createdAt: number;
  updatedAt: number;
  company: string;
  role: string;
  channel?: string;
  appliedDate: string; // YYYY-MM-DD
  status: ApplicationStatus;
  hrName?: string; // HR 姓名
  hrContact?: string; // HR 联系方式
  jdSnippet?: string;
  notes?: string;
  nextFollowUp?: string; // YYYY-MM-DD
  interviews: InterviewRound[];
  outcome?: Outcome | null;
}

export interface MockInterview {
  id: string;
  resumeId: string;
  createdAt: number;
  company?: string;
  role?: string;
  feedback?: string;
  transcript?: string;
}

const STORAGE_KEY = 'jade_journal_v2';

interface Persisted {
  applications: Record<string, Application[]>;
  mocks: Record<string, MockInterview[]>;
}

function loadAll(): Persisted {
  if (typeof window === 'undefined') return { applications: {}, mocks: {} };
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return { applications: {}, mocks: {} };
    const parsed = JSON.parse(raw);
    return {
      applications: parsed?.applications && typeof parsed.applications === 'object' ? parsed.applications : {},
      mocks: parsed?.mocks && typeof parsed.mocks === 'object' ? parsed.mocks : {},
    };
  } catch {
    return { applications: {}, mocks: {} };
  }
}

function persistAll(applications: Record<string, Application[]>, mocks: Record<string, MockInterview[]>) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ applications, mocks }));
  } catch {
    /* quota / privacy mode — silent ignore */
  }
}

/** The latest interview round of an application (by scheduled time, else creation). */
export function latestInterview(app: Application): InterviewRound | undefined {
  if (!app.interviews?.length) return undefined;
  return [...app.interviews].sort((a, b) => {
    const ta = a.scheduledAt ? Date.parse(a.scheduledAt) : a.createdAt;
    const tb = b.scheduledAt ? Date.parse(b.scheduledAt) : b.createdAt;
    return tb - ta;
  })[0];
}

interface JournalStore {
  applications: Record<string, Application[]>;
  mocks: Record<string, MockInterview[]>;
  hydrate: () => void;
  applicationsFor: (resumeId: string) => Application[];
  mocksFor: (resumeId: string) => MockInterview[];
  addApplication: (resumeId: string, data?: Partial<Application>) => Application;
  updateApplication: (id: string, patch: Partial<Application>) => void;
  deleteApplication: (id: string) => void;
  addInterview: (appId: string, round?: Partial<InterviewRound>) => InterviewRound | undefined;
  updateInterview: (appId: string, roundId: string, patch: Partial<InterviewRound>) => void;
  removeInterview: (appId: string, roundId: string) => void;
  setOutcome: (appId: string, outcome: Outcome | null) => void;
  addMock: (resumeId: string, data: Omit<MockInterview, 'id' | 'resumeId' | 'createdAt'>) => void;
  removeMock: (id: string) => void;
  clearForResume: (resumeId: string) => void;
}

function mapApps(
  applications: Record<string, Application[]>,
  id: string,
  fn: (app: Application) => Application
): Record<string, Application[]> {
  const next: Record<string, Application[]> = {};
  for (const [rid, list] of Object.entries(applications)) {
    next[rid] = list.map((a) => (a.id === id ? fn(a) : a));
  }
  return next;
}

export const useJournalStore = create<JournalStore>((set, get) => ({
  applications: {},
  mocks: {},

  hydrate: () => {
    const { applications, mocks } = loadAll();
    set({ applications, mocks });
  },

  applicationsFor: (resumeId) =>
    [...(get().applications[resumeId] || [])].sort((a, b) => b.createdAt - a.createdAt),

  mocksFor: (resumeId) =>
    [...(get().mocks[resumeId] || [])].sort((a, b) => b.createdAt - a.createdAt),

  addApplication: (resumeId, data = {}) => {
    const now = Date.now();
    const app: Application = {
      id: generateId(),
      resumeId,
      createdAt: now,
      updatedAt: now,
      company: '',
      role: '',
      appliedDate: new Date().toISOString().slice(0, 10),
      status: 'submitted',
      interviews: [],
      outcome: null,
      ...data,
    };
    set((state) => {
      const list = state.applications[resumeId] || [];
      const applications = { ...state.applications, [resumeId]: [...list, app] };
      persistAll(applications, state.mocks);
      return { applications };
    });
    return app;
  },

  updateApplication: (id, patch) => {
    set((state) => {
      const applications = mapApps(state.applications, id, (a) => ({ ...a, ...patch, updatedAt: Date.now() }));
      persistAll(applications, state.mocks);
      return { applications };
    });
  },

  deleteApplication: (id) => {
    set((state) => {
      const applications: Record<string, Application[]> = {};
      for (const [rid, list] of Object.entries(state.applications)) {
        applications[rid] = list.filter((a) => a.id !== id);
      }
      persistAll(applications, state.mocks);
      return { applications };
    });
  },

  addInterview: (appId, round = {}) => {
    const created: InterviewRound = {
      id: generateId(),
      round: round.round || '',
      createdAt: Date.now(),
      ...round,
    };
    set((state) => {
      const applications = mapApps(state.applications, appId, (a) => ({
        ...a,
        updatedAt: Date.now(),
        interviews: [...a.interviews, created],
        // Advance an open application into the interview stage automatically.
        status: a.status === 'submitted' || a.status === 'screening' ? 'interview' : a.status,
      }));
      persistAll(applications, state.mocks);
      return { applications };
    });
    return created;
  },

  updateInterview: (appId, roundId, patch) => {
    set((state) => {
      const applications = mapApps(state.applications, appId, (a) => ({
        ...a,
        updatedAt: Date.now(),
        interviews: a.interviews.map((r) => (r.id === roundId ? { ...r, ...patch } : r)),
      }));
      persistAll(applications, state.mocks);
      return { applications };
    });
  },

  removeInterview: (appId, roundId) => {
    set((state) => {
      const applications = mapApps(state.applications, appId, (a) => ({
        ...a,
        updatedAt: Date.now(),
        interviews: a.interviews.filter((r) => r.id !== roundId),
      }));
      persistAll(applications, state.mocks);
      return { applications };
    });
  },

  setOutcome: (appId, outcome) => {
    set((state) => {
      const applications = mapApps(state.applications, appId, (a) => {
        // Reflect the outcome in the application status.
        let status = a.status;
        if (outcome) {
          status =
            outcome.result === 'offer'
              ? 'offer'
              : outcome.result === 'rejected'
                ? 'rejected'
                : outcome.result === 'withdrew'
                  ? 'declined'
                  : 'ghosted';
        }
        return { ...a, outcome, status, updatedAt: Date.now() };
      });
      persistAll(applications, state.mocks);
      return { applications };
    });
  },

  addMock: (resumeId, data) => {
    const mock: MockInterview = { id: generateId(), resumeId, createdAt: Date.now(), ...data };
    set((state) => {
      const list = state.mocks[resumeId] || [];
      const mocks = { ...state.mocks, [resumeId]: [...list, mock] };
      persistAll(state.applications, mocks);
      return { mocks };
    });
  },

  removeMock: (id) => {
    set((state) => {
      const mocks: Record<string, MockInterview[]> = {};
      for (const [rid, list] of Object.entries(state.mocks)) {
        mocks[rid] = list.filter((m) => m.id !== id);
      }
      persistAll(state.applications, mocks);
      return { mocks };
    });
  },

  clearForResume: (resumeId) => {
    set((state) => {
      const applications = { ...state.applications };
      const mocks = { ...state.mocks };
      delete applications[resumeId];
      delete mocks[resumeId];
      persistAll(applications, mocks);
      return { applications, mocks };
    });
  },
}));

/* ─── Aggregations used by the dashboard analytics & the global Agent ─── */

export interface ChannelStat {
  channel: string;
  total: number;
  reachedInterview: number;
  offers: number;
}

export interface JournalAggregate {
  totalApplications: number;
  totalInterviews: number; // total interview rounds
  interviewedApplications: number; // applications that reached ≥1 interview
  totalOutcomes: number;
  offerCount: number;
  rejectCount: number;
  pendingCount: number;
  successRate: number;
  topCompanies: { company: string; count: number }[];
  byStatus: Record<ApplicationStatus, number>;
  byChannel: ChannelStat[];
  overdueFollowUps: number;
  mockInterviewCount: number;
  recentApplications: Application[];
}

export const CHANNEL_PRESETS = [
  'Boss直聘',
  '猎聘',
  '拉勾',
  '智联招聘',
  '前程无忧',
  '内推',
  '官网直投',
  '脉脉',
  '猎头',
  '校招系统',
] as const;

const OPEN_STATUSES: ApplicationStatus[] = ['submitted', 'screening', 'interview'];

export function aggregateJournal(
  applications: Record<string, Application[]>,
  mocks: Record<string, MockInterview[]> = {}
): JournalAggregate {
  const apps = Object.values(applications).flat();
  const mockCount = Object.values(mocks).flat().length;

  const offerCount = apps.filter((a) => a.outcome?.result === 'offer').length;
  const rejectCount = apps.filter((a) => a.outcome?.result === 'rejected').length;
  const pendingCount = apps.filter((a) => OPEN_STATUSES.includes(a.status)).length;
  const totalInterviews = apps.reduce((sum, a) => sum + (a.interviews?.length || 0), 0);
  const interviewedApplications = apps.filter((a) => (a.interviews?.length || 0) > 0).length;
  const totalOutcomes = apps.filter((a) => !!a.outcome).length;

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

  const channelMap: Record<string, ChannelStat> = {};
  for (const a of apps) {
    const key = (a.channel || '').trim() || '未记录';
    if (!channelMap[key]) channelMap[key] = { channel: key, total: 0, reachedInterview: 0, offers: 0 };
    channelMap[key].total++;
    if ((a.interviews?.length || 0) > 0 || a.status === 'offer') channelMap[key].reachedInterview++;
    if (a.outcome?.result === 'offer') channelMap[key].offers++;
  }
  const byChannel = Object.values(channelMap).sort((a, b) => b.total - a.total);

  const today = new Date().toISOString().slice(0, 10);
  const overdueFollowUps = apps.filter(
    (a) => a.nextFollowUp && a.nextFollowUp < today && OPEN_STATUSES.includes(a.status)
  ).length;

  const recentApplications = [...apps].sort((a, b) => b.updatedAt - a.updatedAt).slice(0, 8);

  return {
    totalApplications: apps.length,
    totalInterviews,
    interviewedApplications,
    totalOutcomes,
    offerCount,
    rejectCount,
    pendingCount,
    successRate: offerCount + rejectCount > 0 ? offerCount / (offerCount + rejectCount) : 0,
    topCompanies,
    byStatus,
    byChannel,
    overdueFollowUps,
    mockInterviewCount: mockCount,
    recentApplications,
  };
}

/** Summarize a résumé's job-search threads for the AI knowledge base. */
export function summarizeForAI(apps: Application[], mocks: MockInterview[] = []): string {
  if (apps.length === 0 && mocks.length === 0) return '';
  const lines: string[] = [];
  if (apps.length > 0) {
    lines.push(
      `投递主线（${apps.length}）：` +
        apps
          .slice(0, 6)
          .map((a) => {
            const rounds = a.interviews?.length || 0;
            const oc = a.outcome ? `→${a.outcome.result}` : '';
            return `${a.company || '?'}·${a.role || '?'}[${a.status}${rounds ? `·${rounds}轮面试` : ''}${oc}]`;
          })
          .join('；')
    );
  }
  if (mocks.length > 0) {
    lines.push(`模拟面试存档（${mocks.length}）：` + mocks.slice(0, 3).map((m) => `${m.company || ''}${m.role || ''}`.trim() || '未命名').join('；'));
  }
  return lines.join('\n');
}
