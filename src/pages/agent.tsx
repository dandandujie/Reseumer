'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { listen } from '@tauri-apps/api/event';
import { PanelLeft, Plus, Trash2 } from 'lucide-react';
import { AIInput } from '@/components/ai/ai-input';
import { AIMessage } from '@/components/ai/ai-message';
import { Button } from '@/components/ui/button';
import { useResume } from '@/hooks/use-resume';
import { useJournalStore, aggregateJournal } from '@/stores/journal-store';
import { useSettingsStore } from '@/stores/settings-store';
import * as api from '@/lib/tauri-api';
import { GLOBAL_AGENT_RESUME_ID } from '@/lib/tauri-api';
import { generateId } from '@/lib/utils';
import { APP_NAME } from '@/lib/constants';
import type { UIMessage } from '@/types/chat';
import type { ResumeVersion } from '@/types/resume';
import type { AIProviderId, AIProviderOption } from '@/lib/tauri-api';

interface StreamEvent {
  streamId: string;
  event:
    | { type: 'textDelta'; text: string }
    | { type: 'reasoningDelta'; text: string }
    | { type: 'finish'; finalText: string }
    | { type: 'error'; message: string }
    | { type: string; [key: string]: unknown };
}

interface AgentSession {
  id: string;
  title: string;
  updatedAt: number;
}

function extractMessageText(message: UIMessage): string {
  return (message.parts || [])
    .filter((part) => part.type === 'text')
    .map((part) => (part as { type: 'text'; text: string }).text)
    .join('');
}

function dbMessageToUI(m: { id: string; role: string; content: string }): UIMessage {
  return {
    id: m.id,
    role: m.role as UIMessage['role'],
    content: m.content,
    parts: [{ type: 'text', text: m.content }],
  };
}

function formatSessionTime(ts: number) {
  const d = new Date(ts * 1000);
  return `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()} · ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

export default function AgentPage() {
  const t = useTranslations('dashboard');
  const hydrate = useJournalStore((s) => s.hydrate);
  const byResume = useJournalStore((s) => s.byResume);
  const { resumes, fetchResumes } = useResume();
  const [versions, setVersions] = useState<ResumeVersion[]>([]);
  const [input, setInput] = useState('');
  // Topic-scoped message store (CherryStudio pattern): streams bind to a
  // session, not to the visible view — multiple sessions can run in parallel.
  const [messagesBySession, setMessagesBySession] = useState<Record<string, UIMessage[]>>({});
  const [busySessions, setBusySessions] = useState<Set<string>>(new Set());
  const [sessions, setSessions] = useState<AgentSession[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | undefined>();
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [models, setModels] = useState<string[]>([]);
  const [providerOptions, setProviderOptions] = useState<AIProviderOption[]>([]);
  const [selectedProvider, setSelectedProvider] = useState<AIProviderId | undefined>();
  const [selectedModel, setSelectedModel] = useState<string | undefined>();
  const [isHydrated, setIsHydrated] = useState(false);
  // streamId → owning session + target assistant message
  const streamsRef = useRef<Map<string, { sessionId: string; msgId: string }>>(new Map());
  const busySessionsRef = useRef<Set<string>>(new Set());
  const scrollRef = useRef<HTMLDivElement>(null);
  const isNearBottomRef = useRef(true);

  const settingsProvider = useSettingsStore((s) => s.aiProvider);
  const settingsBaseURL = useSettingsStore((s) => s.aiBaseURL);
  const settingsApiKey = useSettingsStore((s) => s.aiApiKey);
  const settingsModel = useSettingsStore((s) => s.aiModel);
  const effectiveProvider = selectedProvider || settingsProvider;
  const effectiveProviderOption = providerOptions.find((provider) => provider.id === effectiveProvider);
  const effectiveModel = selectedModel || effectiveProviderOption?.model || settingsModel;
  const messages = (activeSessionId && messagesBySession[activeSessionId]) || [];
  const isLoading = !!activeSessionId && busySessions.has(activeSessionId);

  const setBusy = useCallback((sid: string, busy: boolean) => {
    setBusySessions((prev) => {
      const next = new Set(prev);
      if (busy) next.add(sid);
      else next.delete(sid);
      busySessionsRef.current = next;
      return next;
    });
  }, []);

  const updateSessionMessages = useCallback(
    (sid: string, fn: (prev: UIMessage[]) => UIMessage[]) => {
      setMessagesBySession((prev) => ({ ...prev, [sid]: fn(prev[sid] || []) }));
    },
    []
  );

  // ── Session persistence (SQLite via the __global__ sentinel resume id) ──
  const loadSessionMessages = useCallback(async (sessionId: string) => {
    // A streaming session's in-memory state is fresher than the DB.
    if (busySessionsRef.current.has(sessionId)) return;
    try {
      const res = await api.listChatMessages(sessionId, 200, 0);
      const msgs = (res?.messages || []) as { id: string; role: string; content: string }[];
      setMessagesBySession((prev) => ({
        ...prev,
        [sessionId]: msgs.filter((m) => m.role === 'user' || m.role === 'assistant').map(dbMessageToUI),
      }));
    } catch {
      /* keep whatever is in memory */
    }
  }, []);

  const createSession = useCallback(async () => {
    try {
      const newId = await api.createChatSession(GLOBAL_AGENT_RESUME_ID);
      const session = await api.getChatSession(newId);
      if (session) {
        setSessions((prev) => [{ id: session.id, title: session.title, updatedAt: session.updatedAt }, ...prev]);
      }
      setActiveSessionId(newId);
      setMessagesBySession((prev) => ({ ...prev, [newId]: [] }));
      return newId;
    } catch {
      return undefined;
    }
  }, []);

  const switchSession = useCallback(
    async (sessionId: string) => {
      if (sessionId === activeSessionId) return;
      setActiveSessionId(sessionId);
      await loadSessionMessages(sessionId);
    },
    [activeSessionId, loadSessionMessages]
  );

  const deleteSession = useCallback(
    async (sessionId: string) => {
      try {
        await api.deleteChatSession(sessionId);
      } catch {
        return;
      }
      setSessions((prev) => prev.filter((s) => s.id !== sessionId));
      if (sessionId === activeSessionId) {
        const remaining = sessions.filter((s) => s.id !== sessionId);
        if (remaining.length > 0) {
          setActiveSessionId(remaining[0].id);
          await loadSessionMessages(remaining[0].id);
        } else {
          await createSession();
        }
      }
    },
    [activeSessionId, sessions, loadSessionMessages, createSession]
  );

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const list = (await api.listChatSessions(GLOBAL_AGENT_RESUME_ID)) as AgentSession[];
        if (cancelled) return;
        if (list.length > 0) {
          setSessions(list);
          setActiveSessionId(list[0].id);
          await loadSessionMessages(list[0].id);
        } else {
          await createSession();
        }
      } catch {
        /* Tauri unavailable (browser preview) — keep in-memory chat */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [loadSessionMessages, createSession]);

  // Ensure settings store is hydrated before using AI
  useEffect(() => {
    const hydrateSettings = async () => {
      await useSettingsStore.getState().hydrate();
      setIsHydrated(true);
    };
    hydrateSettings();
  }, []);

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
    if (!isHydrated) return;
    setProviderOptions(api.listAIProviderOptions());
  }, [isHydrated, settingsProvider, settingsBaseURL, settingsApiKey, settingsModel]);

  useEffect(() => {
    if (!isHydrated) return;
    api.aiListModelsForSelection({ provider: selectedProvider, model: selectedModel })
      .then((items) => {
        const ids = (items || []).map((m: { id: string }) => m.id);
        if (effectiveModel && !ids.includes(effectiveModel)) ids.unshift(effectiveModel);
        setModels(ids);
      })
      .catch(() => {
        if (effectiveModel) setModels([effectiveModel]);
      });
  }, [isHydrated, selectedProvider, selectedModel, settingsProvider, settingsBaseURL, settingsApiKey, settingsModel, effectiveModel]);

  useEffect(() => {
    let unlisten: (() => void) | undefined;
    let cancelled = false;

    listen<StreamEvent>('ai-chat-event', (evt) => {
      const payload = evt.payload;
      if (!payload) return;
      const meta = streamsRef.current.get(payload.streamId);
      if (!meta) return;
      const { sessionId: sid, msgId } = meta;

      if (payload.event.type === 'textDelta' || payload.event.type === 'reasoningDelta') {
        const text = typeof payload.event.text === 'string' ? payload.event.text : '';
        if (!text) return;
        const partType = payload.event.type === 'reasoningDelta' ? ('reasoning' as const) : ('text' as const);
        updateSessionMessages(sid, (prev) => {
          const idx = prev.findIndex((m) => m.id === msgId);
          if (idx === -1) return prev;
          const msg = { ...prev[idx] };
          const parts = [...msg.parts];
          const lastPart = parts[parts.length - 1];
          if (lastPart?.type === partType) {
            parts[parts.length - 1] = { ...lastPart, text: (lastPart as { text: string }).text + text };
          } else {
            // Thinking→answer transition: stamp the reasoning end time.
            if (partType === 'text' && lastPart?.type === 'reasoning' && !lastPart.endedAt) {
              parts[parts.length - 1] = { ...lastPart, endedAt: Date.now() };
            }
            parts.push(
              partType === 'reasoning'
                ? { type: 'reasoning', text, startedAt: Date.now() }
                : { type: 'text', text }
            );
          }
          msg.parts = parts;
          if (partType === 'text') {
            msg.content = (msg.content || '') + text;
          }
          const out = [...prev];
          out[idx] = msg;
          return out;
        });
        return;
      }

      if (payload.event.type === 'toolCallStart') {
        const { id, name } = payload.event as unknown as { id: string; name: string };
        updateSessionMessages(sid, (prev) => {
          const idx = prev.findIndex((m) => m.id === msgId);
          if (idx === -1) return prev;
          const out = [...prev];
          out[idx] = {
            ...out[idx],
            parts: [...out[idx].parts, { type: 'tool', toolName: name, toolCallId: id, args: {}, state: 'input-available' }],
          };
          return out;
        });
        return;
      }

      if (payload.event.type === 'toolCallArgs' || payload.event.type === 'toolResult') {
        const ev = payload.event as unknown as { type: string; id: string; args?: unknown; result?: unknown };
        updateSessionMessages(sid, (prev) => {
          const idx = prev.findIndex((m) => m.id === msgId);
          if (idx === -1) return prev;
          const parts = [...prev[idx].parts];
          for (let i = parts.length - 1; i >= 0; i--) {
            const part = parts[i];
            if (part.type === 'tool' && part.toolCallId === ev.id) {
              parts[i] =
                ev.type === 'toolResult'
                  ? { ...part, result: ev.result, state: 'output-available' }
                  : { ...part, args: ev.args ?? part.args };
              break;
            }
          }
          const out = [...prev];
          out[idx] = { ...out[idx], parts };
          return out;
        });
        return;
      }

      if (payload.event.type === 'finish') {
        updateSessionMessages(sid, (prev) => {
          const idx = prev.findIndex((m) => m.id === msgId);
          if (idx === -1) return prev;
          const parts = [...prev[idx].parts];
          const last = parts[parts.length - 1];
          if (last?.type === 'reasoning' && !last.endedAt) {
            parts[parts.length - 1] = { ...last, endedAt: Date.now() };
            const out = [...prev];
            out[idx] = { ...out[idx], parts };
            return out;
          }
          return prev;
        });
        const finalText = typeof payload.event.finalText === 'string' ? payload.event.finalText : '';
        if (finalText) {
          updateSessionMessages(sid, (prev) => {
            const idx = prev.findIndex((m) => m.id === msgId);
            if (idx === -1 || prev[idx].content) return prev;
            const out = [...prev];
            // Keep tool/reasoning parts — only append the missing text.
            out[idx] = {
              ...out[idx],
              content: finalText,
              parts: [...out[idx].parts, { type: 'text', text: finalText }],
            };
            return out;
          });
        }
        streamsRef.current.delete(payload.streamId);
        setBusy(sid, false);
        return;
      }

      if (payload.event.type === 'error') {
        streamsRef.current.delete(payload.streamId);
        setBusy(sid, false);
        const message = typeof payload.event.message === 'string' ? payload.event.message : t('globalAgentError');
        toast.error(t('globalAgentError'), { description: message.slice(0, 180) });
      }
    }).then((un) => {
      if (cancelled) {
        un();
        return;
      }
      unlisten = un;
    });

    return () => {
      cancelled = true;
      if (unlisten) unlisten();
    };
  }, [t, updateSessionMessages, setBusy]);

  useEffect(() => {
    const el = scrollRef.current;
    if (el && isNearBottomRef.current) {
      el.scrollTop = el.scrollHeight;
    }
  }, [messages, busySessions]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const handleScroll = () => {
      const { scrollTop, scrollHeight, clientHeight } = el;
      isNearBottomRef.current = scrollHeight - scrollTop - clientHeight < 80;
    };
    el.addEventListener('scroll', handleScroll, { passive: true });
    return () => el.removeEventListener('scroll', handleScroll);
  }, []);

  const agg = useMemo(() => aggregateJournal(byResume), [byResume]);
  const resumeSummaries = useMemo(
    () =>
      resumes.map((resume) => ({
        title: resume.title,
        language: resume.language,
        template: resume.template,
        sections: Array.isArray(resume.sections) ? resume.sections.length : 0,
        updatedAt: resume.updatedAt,
      })),
    [resumes]
  );
  const activityEntries = useMemo(
    () => Object.values(byResume).flat().sort((a, b) => b.createdAt - a.createdAt),
    [byResume]
  );
  const closedCount = agg.offerCount + agg.rejectCount;
  const successLabel = closedCount > 0 ? `${Math.round(agg.successRate * 100)}%` : '—';

  const contextText = useMemo(() => {
    const topCompanies = agg.topCompanies.map((c) => `${c.company}(${c.count})`).join('、') || '暂无';
    const channelStats = agg.byChannel.length
      ? agg.byChannel
          .map((c) => `${c.channel}：投${c.total}/进面${c.reachedInterview}/offer${c.offers}`)
          .join('；')
      : '暂无渠道数据';
    return [
      '你是 Resumer 的全局 AI Agent，不局限于单份简历。',
      '你的职责：跨简历分析求职数据、发现漏斗问题、给出优化建议，并可以提出如何改进简历 AI 系统提示词的建议。',
      '当前不要声称已经直接修改简历或系统提示词；如果需要修改，先给出明确方案和风险。',
      '',
      `简历数量：${resumes.length}`,
      `版本快照：${versions.length}`,
      `投递：${agg.totalApplications}，面试：${agg.totalInterviews}，Offer：${agg.offerCount}，被拒：${agg.rejectCount}，待跟进：${agg.pendingCount}，Offer率：${successLabel}`,
      `热门公司：${topCompanies}`,
      `渠道分布：${channelStats}`,
      `逾期待跟进：${agg.overdueFollowUps} 条`,
      `最近动态数：${activityEntries.length}`,
      `简历概览：${JSON.stringify(resumeSummaries.slice(0, 20))}`,
    ].join('\n');
  }, [activityEntries.length, agg, resumeSummaries, resumes.length, successLabel, versions.length]);

  async function sendGlobalMessage(text: string) {
    if (!isHydrated) {
      await useSettingsStore.getState().hydrate();
      setIsHydrated(true);
    }

    // Bind everything to the session that was active at send time — the user
    // may switch away while this streams.
    const sid = activeSessionId || (await createSession());
    if (!sid) return;
    if (busySessionsRef.current.has(sid)) return; // per-session lock only

    if (!api.isAISelectionConfigured({ provider: selectedProvider, model: selectedModel })) {
      const userMsg: UIMessage = { id: generateId(), role: 'user', parts: [{ type: 'text', text }], content: text };
      const errorMsg: UIMessage = {
        id: generateId(),
        role: 'assistant',
        parts: [{ type: 'text', text: '__API_KEY_MISSING__' }],
        content: '__API_KEY_MISSING__',
      };
      updateSessionMessages(sid, (prev) => [...prev, userMsg, errorMsg]);
      return;
    }

    const userMsg: UIMessage = { id: generateId(), role: 'user', parts: [{ type: 'text', text }], content: text };
    const assistantMsg: UIMessage = { id: generateId(), role: 'assistant', parts: [], content: '' };
    const history = messagesBySession[sid] || [];
    const conversationContext = history
      .slice(-8)
      .map((message) => `${message.role === 'user' ? '用户' : 'Agent'}：${message.content || extractMessageText(message)}`)
      .join('\n');
    updateSessionMessages(sid, (prev) => [...prev, userMsg, assistantMsg]);
    setBusy(sid, true);
    const streamId = generateId();
    streamsRef.current.set(streamId, { sessionId: sid, msgId: assistantMsg.id });

    // First message names the session locally (backend does the same in DB).
    setSessions((prev) =>
      prev.map((s) => (s.id === sid && s.title === '新对话' ? { ...s, title: text.slice(0, 50) } : s))
    );

    try {
      // Use dedicated global_agent_chat command with backend context aggregation
      const journalContext = `${contextText}\n\n最近对话：\n${conversationContext || '暂无'}\n\n结构化求职动态：${JSON.stringify(agg, null, 2)}`;

      const response = (await api.globalAgentChat({
        streamId,
        message: text,
        journalContext,
        sessionId: sid,
        selectedProvider,
        selectedModel,
      })) as unknown as { text?: string; userMessageId?: string; assistantMessageId?: string } | string | null;

      // Remap temp ids to DB ids so rollback/edit target real rows.
      if (response && typeof response === 'object') {
        const { userMessageId, assistantMessageId } = response;
        if (userMessageId || assistantMessageId) {
          updateSessionMessages(sid, (prev) =>
            prev.map((m) => {
              if (m.id === userMsg.id && userMessageId) return { ...m, id: userMessageId };
              if (m.id === assistantMsg.id && assistantMessageId) return { ...m, id: assistantMessageId };
              return m;
            })
          );
        }
      }

      const responseText = typeof response === 'string' ? response : response?.text;
      if (!responseText) {
        updateSessionMessages(sid, (prev) =>
          prev.map((m) =>
            m.id === assistantMsg.id
              ? { ...m, content: t('globalAgentEmptyReply'), parts: [{ type: 'text', text: t('globalAgentEmptyReply') }] }
              : m
          )
        );
      }
    } catch (err: any) {
      const message = err?.message || String(err);
      toast.error(t('globalAgentError'), { description: message.slice(0, 180) });
      updateSessionMessages(sid, (prev) =>
        prev.map((m) =>
          m.id === assistantMsg.id && !m.content
            ? { ...m, content: t('globalAgentError'), parts: [...m.parts, { type: 'text', text: t('globalAgentError') }] }
            : m
        )
      );
    } finally {
      streamsRef.current.delete(streamId);
      setBusy(sid, false);
    }
  }


  const handleStop = useCallback(() => {
    const sid = activeSessionId;
    if (!sid) return;
    for (const [streamId, meta] of streamsRef.current) {
      if (meta.sessionId === sid) {
        void api.cancelAiStream(streamId);
      }
    }
  }, [activeSessionId]);

  const handleRollback = useCallback(
    async (messageId: string) => {
      const sid = activeSessionId;
      if (!sid || busySessionsRef.current.has(sid)) return;
      try {
        await api.truncateChatMessages(sid, messageId);
      } catch {
        /* DB truncation failed — keep UI unchanged */
        return;
      }
      updateSessionMessages(sid, (prev) => {
        const i = prev.findIndex((m) => m.id === messageId);
        return i === -1 ? prev : prev.slice(0, i);
      });
    },
    [activeSessionId, updateSessionMessages]
  );

  const handleEditResend = useCallback(
    (messageId: string, text: string) => {
      void handleRollback(messageId).then(() => setInput(text));
    },
    [handleRollback]
  );

  const handleRegenerate = useCallback(
    (assistantMessageId: string) => {
      const sid = activeSessionId;
      if (!sid || busySessionsRef.current.has(sid)) return;
      const list = messagesBySession[sid] || [];
      const idx = list.findIndex((m) => m.id === assistantMessageId);
      if (idx === -1) return;
      // Find the user message driving this reply, roll back to it, resend.
      let userIdx = idx - 1;
      while (userIdx >= 0 && list[userIdx].role !== 'user') userIdx--;
      if (userIdx < 0) return;
      const userText = list[userIdx].content || extractMessageText(list[userIdx]);
      void handleRollback(list[userIdx].id).then(() => {
        if (userText.trim()) void sendGlobalMessage(userText);
      });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [activeSessionId, messagesBySession, handleRollback]
  );

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const text = input.trim();
    if (!text || isLoading) return;
    setInput('');
    void sendGlobalMessage(text);
  }

  return (
    <div className="-mx-4 -my-6 flex h-[calc(100vh-3.5rem-3rem)] overflow-hidden bg-[var(--whale-card)] md:-mx-8 md:-my-8">
      {/* Left conversation sidebar — collapsible */}
      <aside
        className={`flex h-full shrink-0 flex-col border-r border-[var(--whale-divider)] bg-[var(--whale-sidebar)] transition-[width] duration-200 ${
          sidebarOpen ? 'w-60' : 'w-0 overflow-hidden border-r-0'
        }`}
      >
        <div className="flex shrink-0 items-center justify-between px-3 pb-1 pt-3">
          <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--whale-ink-muted)]">
            {t('globalAgentHistory')}
          </span>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 w-7 cursor-pointer p-0 text-[var(--whale-ink-soft)]"
            onClick={() => void createSession()}
            title={t('globalAgentNewChat')}
          >
            <Plus className="h-4 w-4" />
          </Button>
        </div>
        <div className="min-h-0 flex-1 space-y-0.5 overflow-y-auto px-2 pb-3">
          {sessions.map((session) => {
            const active = session.id === activeSessionId;
            return (
              <div
                key={session.id}
                className={`group flex cursor-pointer items-center gap-2 rounded-lg px-2.5 py-2 transition-colors ${
                  active
                    ? 'bg-[var(--whale-ink)] text-[var(--whale-cream)]'
                    : 'text-[var(--whale-ink-soft)] hover:bg-[var(--whale-cream-deep)]'
                }`}
                onClick={() => void switchSession(session.id)}
              >
                <div className="min-w-0 flex-1">
                  <p className="flex items-center gap-1.5 truncate text-[12.5px] font-medium">
                    {busySessions.has(session.id) && (
                      <span className="inline-block h-1.5 w-1.5 shrink-0 animate-pulse rounded-full bg-[var(--whale-mint-deep)]" />
                    )}
                    <span className="truncate">{session.title}</span>
                  </p>
                  <p className={`mt-0.5 text-[10px] ${active ? 'text-[var(--whale-cream)]/55' : 'text-[var(--whale-ink-muted)]'}`}>
                    {formatSessionTime(session.updatedAt)}
                  </p>
                </div>
                <button
                  className={`hidden shrink-0 cursor-pointer rounded p-1 group-hover:block ${
                    active
                      ? 'text-[var(--whale-cream)]/60 hover:text-[var(--whale-cream)]'
                      : 'text-[var(--whale-ink-muted)] hover:text-[var(--whale-ink)]'
                  }`}
                  onClick={(e) => {
                    e.stopPropagation();
                    void deleteSession(session.id);
                  }}
                >
                  <Trash2 className="h-3 w-3" />
                </button>
              </div>
            );
          })}
          {sessions.length === 0 && (
            <p className="px-2 py-4 text-center text-[11px] text-[var(--whale-ink-muted)]">{t('globalAgentEmptyBody')}</p>
          )}
        </div>
      </aside>

      <section className="flex h-full min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        {/* Slim header — collapse toggle + current session title */}
        <div className="flex shrink-0 items-center gap-2 border-b border-[var(--whale-divider)] bg-[var(--whale-card)] px-3 py-2">
          <Button
            variant="ghost"
            size="sm"
            className="h-7 w-7 cursor-pointer p-0 text-[var(--whale-ink-soft)]"
            onClick={() => setSidebarOpen((v) => !v)}
            title={t('globalAgentHistory')}
          >
            <PanelLeft className="h-4 w-4" />
          </Button>
          <span className="truncate text-[13px] font-medium text-[var(--whale-ink-soft)]">
            {sessions.find((s) => s.id === activeSessionId)?.title || t('globalAgent')}
          </span>
        </div>
        <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto px-4 py-5 md:px-8 md:py-6">
            {messages.length === 0 ? (
              <div className="flex h-full min-h-[380px] items-center justify-center">
                <div className="max-w-lg text-center">
                  <img src="/logo-icon.svg" alt={APP_NAME} className="mx-auto h-14 w-14 rounded-2xl" />
                  <h2 className="font-display mt-4 text-xl font-semibold text-[var(--whale-ink)]">{t('globalAgent')}</h2>
                  <p className="mt-2 text-[13px] leading-relaxed text-[var(--whale-ink-muted)]">{t('globalAgentEmptyBody')}</p>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                {messages.map((message, index) => (
                  <AIMessage
                    key={message.id}
                    message={message}
                    isStreaming={isLoading && index === messages.length - 1}
                    onEditResend={handleEditResend}
                    onRollback={handleRollback}
                    onRegenerate={handleRegenerate}
                  />
                ))}
                {isLoading && !(messages[messages.length - 1]?.content) && (
                  <div className="flex items-center gap-2 text-xs text-[var(--whale-ink-muted)]">
                    <span className="flex gap-1">
                      <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-[var(--whale-mint-deep)] [animation-delay:0ms]" />
                      <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-[var(--whale-mint-deep)] [animation-delay:150ms]" />
                      <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-[var(--whale-mint-deep)] [animation-delay:300ms]" />
                    </span>
                    {t('globalAgentThinking')}
                  </div>
                )}
              </div>
            )}
        </div>
        <AIInput
          input={input}
          onChange={(e) => setInput(e.target.value)}
          onSubmit={handleSubmit}
          isLoading={isLoading}
          models={models}
          providers={providerOptions}
          selectedProvider={selectedProvider}
          effectiveProvider={effectiveProvider as AIProviderId}
          onProviderChange={(provider) => {
            setSelectedProvider(provider);
            setSelectedModel(undefined);
          }}
          selectedModel={selectedModel}
          effectiveModel={effectiveModel}
          onModelChange={setSelectedModel}
          onStop={handleStop}
        />
      </section>
    </div>
  );
}
