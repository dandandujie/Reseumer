'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { listen } from '@tauri-apps/api/event';
import { AIInput } from '@/components/ai/ai-input';
import { AIMessage } from '@/components/ai/ai-message';
import { useResume } from '@/hooks/use-resume';
import { useJournalStore, aggregateJournal } from '@/stores/journal-store';
import { useSettingsStore } from '@/stores/settings-store';
import * as api from '@/lib/tauri-api';
import { generateId } from '@/lib/utils';
import { APP_NAME } from '@/lib/constants';
import type { UIMessage } from '@/types/chat';
import type { ResumeVersion } from '@/types/resume';
import type { AIProviderId, AIProviderOption } from '@/lib/tauri-api';

const GLOBAL_AGENT_MESSAGES_KEY = 'resumer_global_agent_messages_v1';

interface StreamEvent {
  streamId: string;
  event:
    | { type: 'textDelta'; text: string }
    | { type: 'finish'; finalText: string }
    | { type: 'error'; message: string }
    | { type: string; [key: string]: unknown };
}

function extractMessageText(message: UIMessage): string {
  return (message.parts || [])
    .filter((part) => part.type === 'text')
    .map((part) => (part as { type: 'text'; text: string }).text)
    .join('');
}

function isPersistableMessage(value: unknown): value is UIMessage {
  if (!value || typeof value !== 'object') return false;
  const message = value as UIMessage;
  return (
    typeof message.id === 'string' &&
    (message.role === 'user' || message.role === 'assistant' || message.role === 'system') &&
    Array.isArray(message.parts)
  );
}

export default function AgentPage() {
  const t = useTranslations('dashboard');
  const hydrate = useJournalStore((s) => s.hydrate);
  const byResume = useJournalStore((s) => s.byResume);
  const { resumes, fetchResumes } = useResume();
  const [versions, setVersions] = useState<ResumeVersion[]>([]);
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<UIMessage[]>([]);
  const [status, setStatus] = useState<'idle' | 'submitted' | 'streaming'>('idle');
  const [models, setModels] = useState<string[]>([]);
  const [providerOptions, setProviderOptions] = useState<AIProviderOption[]>([]);
  const [selectedProvider, setSelectedProvider] = useState<AIProviderId | undefined>();
  const [selectedModel, setSelectedModel] = useState<string | undefined>();
  const [isHydrated, setIsHydrated] = useState(false);
  const streamIdRef = useRef<string | null>(null);
  const assistantMsgIdRef = useRef<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const isNearBottomRef = useRef(true);

  const settingsProvider = useSettingsStore((s) => s.aiProvider);
  const settingsBaseURL = useSettingsStore((s) => s.aiBaseURL);
  const settingsApiKey = useSettingsStore((s) => s.aiApiKey);
  const settingsModel = useSettingsStore((s) => s.aiModel);
  const effectiveProvider = selectedProvider || settingsProvider;
  const effectiveProviderOption = providerOptions.find((provider) => provider.id === effectiveProvider);
  const effectiveModel = selectedModel || effectiveProviderOption?.model || settingsModel;
  const isLoading = status === 'submitted' || status === 'streaming';

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(GLOBAL_AGENT_MESSAGES_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        setMessages(parsed.filter(isPersistableMessage).slice(-40));
      }
    } catch {
      // Ignore corrupted local chat history.
    }
  }, []);

  useEffect(() => {
    try {
      window.localStorage.setItem(GLOBAL_AGENT_MESSAGES_KEY, JSON.stringify(messages.slice(-40)));
    } catch {
      // Chat history persistence should never block the conversation.
    }
  }, [messages]);

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
      if (!payload || payload.streamId !== streamIdRef.current) return;

      if (payload.event.type === 'textDelta') {
        setStatus('streaming');
        const text = typeof payload.event.text === 'string' ? payload.event.text : '';
        if (!text) return;
        setMessages((prev) => {
          const msgId = assistantMsgIdRef.current;
          if (!msgId) return prev;
          const idx = prev.findIndex((m) => m.id === msgId);
          if (idx === -1) return prev;
          const msg = { ...prev[idx] };
          const parts = [...msg.parts];
          const lastPart = parts[parts.length - 1];
          if (lastPart?.type === 'text') {
            parts[parts.length - 1] = { type: 'text', text: lastPart.text + text };
          } else {
            parts.push({ type: 'text', text });
          }
          msg.parts = parts;
          msg.content = (msg.content || '') + text;
          const out = [...prev];
          out[idx] = msg;
          return out;
        });
        return;
      }

      if (payload.event.type === 'finish') {
        const finalText = typeof payload.event.finalText === 'string' ? payload.event.finalText : '';
        if (finalText) {
          setMessages((prev) => {
            const msgId = assistantMsgIdRef.current;
            if (!msgId) return prev;
            const idx = prev.findIndex((m) => m.id === msgId);
            if (idx === -1 || prev[idx].content) return prev;
            const out = [...prev];
            out[idx] = { ...out[idx], content: finalText, parts: [{ type: 'text', text: finalText }] };
            return out;
          });
        }
        setStatus('idle');
        streamIdRef.current = null;
        assistantMsgIdRef.current = null;
        return;
      }

      if (payload.event.type === 'error') {
        setStatus('idle');
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
  }, [t]);

  useEffect(() => {
    const el = scrollRef.current;
    if (el && isNearBottomRef.current) {
      el.scrollTop = el.scrollHeight;
    }
  }, [messages, status]);

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
    return [
      '你是 Resumer 的全局 AI Agent，不局限于单份简历。',
      '你的职责：跨简历分析求职数据、发现漏斗问题、给出优化建议，并可以提出如何改进简历 AI 系统提示词的建议。',
      '当前不要声称已经直接修改简历或系统提示词；如果需要修改，先给出明确方案和风险。',
      '',
      `简历数量：${resumes.length}`,
      `版本快照：${versions.length}`,
      `投递：${agg.totalApplications}，面试：${agg.totalInterviews}，Offer：${agg.offerCount}，被拒：${agg.rejectCount}，待跟进：${agg.pendingCount}，Offer率：${successLabel}`,
      `热门公司：${topCompanies}`,
      `最近动态数：${activityEntries.length}`,
      `简历概览：${JSON.stringify(resumeSummaries.slice(0, 20))}`,
    ].join('\n');
  }, [activityEntries.length, agg, resumeSummaries, resumes.length, successLabel, versions.length]);

  async function sendGlobalMessage(text: string) {
    if (!isHydrated) {
      await useSettingsStore.getState().hydrate();
      setIsHydrated(true);
    }

    if (!api.isAISelectionConfigured({ provider: selectedProvider, model: selectedModel })) {
      const userMsg: UIMessage = { id: generateId(), role: 'user', parts: [{ type: 'text', text }], content: text };
      const errorMsg: UIMessage = {
        id: generateId(),
        role: 'assistant',
        parts: [{ type: 'text', text: '__API_KEY_MISSING__' }],
        content: '__API_KEY_MISSING__',
      };
      setMessages((prev) => [...prev, userMsg, errorMsg]);
      return;
    }

    const userMsg: UIMessage = { id: generateId(), role: 'user', parts: [{ type: 'text', text }], content: text };
    const assistantMsg: UIMessage = { id: generateId(), role: 'assistant', parts: [], content: '' };
    const conversationContext = messages
      .slice(-8)
      .map((message) => `${message.role === 'user' ? '用户' : 'Agent'}：${message.content || extractMessageText(message)}`)
      .join('\n');
    const nextMessages = [...messages, userMsg, assistantMsg];
    setMessages(nextMessages);
    setStatus('submitted');
    const streamId = generateId();
    streamIdRef.current = streamId;
    assistantMsgIdRef.current = assistantMsg.id;

    try {
      // Use dedicated global_agent_chat command with backend context aggregation
      const journalContext = `${contextText}\n\n最近对话：\n${conversationContext || '暂无'}\n\n结构化求职动态：${JSON.stringify(agg, null, 2)}`;

      const response = await api.globalAgentChat({
        streamId,
        message: text,
        journalContext,
        selectedProvider,
        selectedModel,
      });

      if (!response) {
        setMessages((prev) =>
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
      setMessages((prev) =>
        prev.map((m) =>
          m.id === assistantMsg.id
            ? { ...m, content: t('globalAgentError'), parts: [{ type: 'text', text: t('globalAgentError') }] }
            : m
        )
      );
    } finally {
      setStatus('idle');
    }
  }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const text = input.trim();
    if (!text || isLoading) return;
    setInput('');
    void sendGlobalMessage(text);
  }

  return (
    <div className="-mx-4 -my-6 h-[calc(100vh-3.5rem-3rem)] overflow-hidden bg-[var(--whale-card)] md:-mx-8 md:-my-8">
      <section className="flex h-full min-h-0 w-full flex-col overflow-hidden">
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
                  <AIMessage key={message.id} message={message} isStreaming={status === 'streaming' && index === messages.length - 1} />
                ))}
                {status === 'submitted' && (
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
        />
      </section>
    </div>
  );
}
