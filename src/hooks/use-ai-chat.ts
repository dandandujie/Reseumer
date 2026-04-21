import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { listen } from '@tauri-apps/api/event';
import * as api from '@/lib/tauri-api';
import { useResumeStore } from '@/stores/resume-store';
import { useSettingsStore } from '@/stores/settings-store';
import { generateId } from '@/lib/utils';
import type { UIMessage, MessagePart } from '@/types/chat';

export type { UIMessage, MessagePart };

interface UseAIChatOptions {
  resumeId: string;
  sessionId?: string;
  initialMessages?: UIMessage[];
  selectedModel?: string;
}

interface StreamEvent {
  streamId: string;
  event:
    | { type: 'textDelta'; text: string }
    | { type: 'toolCallStart'; id: string; name: string }
    | { type: 'toolCallArgs'; id: string; args: unknown }
    | { type: 'toolResult'; id: string; name: string; result: unknown }
    | { type: 'finish'; finalText: string }
    | { type: 'error'; message: string };
}

export function useAIChat({ resumeId, sessionId, initialMessages }: UseAIChatOptions) {
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<UIMessage[]>([]);
  const [localMessages, setLocalMessages] = useState<UIMessage[]>([]);
  const [status, setStatus] = useState<'idle' | 'submitted' | 'streaming'>('idle');
  const [error, setError] = useState<Error | null>(null);

  const isLoading = status === 'streaming' || status === 'submitted';
  const streamIdRef = useRef<string | null>(null);
  const assistantMsgIdRef = useRef<string | null>(null);

  // Hydrate initial messages
  useEffect(() => {
    if (initialMessages) {
      setMessages(initialMessages);
    }
  }, [initialMessages]);

  // Reload resume data after tool execution changes DB
  const reloadResume = useCallback(async () => {
    if (!resumeId) return;
    try {
      const store = useResumeStore.getState();
      if (store._saveTimeout) clearTimeout(store._saveTimeout);
      const data = await api.getResume(resumeId);
      if (data) {
        store.setResume({
          ...data,
          sections: (data as any).sections || [],
          themeConfig: (data as any).themeConfig || {},
          createdAt: new Date((data as any).createdAt * 1000),
          updatedAt: new Date((data as any).updatedAt * 1000),
        } as any);
      }
    } catch (err) {
      console.error('Failed to reload resume:', err);
    }
  }, [resumeId]);

  // Subscribe to Tauri streaming events
  useEffect(() => {
    let unlisten: (() => void) | undefined;
    let cancelled = false;

    listen<StreamEvent>('ai-chat-event', (evt) => {
      const payload = evt.payload;
      if (!payload || payload.streamId !== streamIdRef.current) return;

      setMessages((prev) => {
        const msgId = assistantMsgIdRef.current;
        if (!msgId) return prev;
        const idx = prev.findIndex((m) => m.id === msgId);
        if (idx === -1) return prev;
        const msg = { ...prev[idx] };
        const parts = [...msg.parts];

        switch (payload.event.type) {
          case 'textDelta': {
            // Append text to the last text part, or create a new one
            const lastPart = parts[parts.length - 1];
            if (lastPart?.type === 'text') {
              parts[parts.length - 1] = { type: 'text', text: lastPart.text + payload.event.text };
            } else {
              parts.push({ type: 'text', text: payload.event.text });
            }
            break;
          }
          case 'toolCallStart': {
            parts.push({ type: 'tool', toolName: payload.event.name, args: {}, state: 'input-available' });
            break;
          }
          case 'toolCallArgs': {
            // Update latest tool part with args
            for (let i = parts.length - 1; i >= 0; i--) {
              if (parts[i].type === 'tool' && (parts[i] as any).result === undefined) {
                parts[i] = { ...parts[i], args: payload.event.args } as MessagePart;
                break;
              }
            }
            break;
          }
          case 'toolResult': {
            for (let i = parts.length - 1; i >= 0; i--) {
              const p = parts[i];
              if (p.type === 'tool' && p.toolName === payload.event.name && p.result === undefined) {
                parts[i] = { ...p, result: payload.event.result, state: 'output-available' };
                break;
              }
            }
            // Trigger resume reload
            reloadResume();
            break;
          }
          case 'finish': {
            setStatus('idle');
            break;
          }
          case 'error': {
            setError(new Error(payload.event.message));
            setStatus('idle');
            break;
          }
        }

        msg.parts = parts;
        const out = [...prev];
        out[idx] = msg;
        return out;
      });
    }).then((un) => {
      if (cancelled) { un(); return; }
      unlisten = un;
    });

    return () => {
      cancelled = true;
      if (unlisten) unlisten();
    };
  }, [reloadResume]);

  const sendMessage = useCallback(
    async (data: { text: string }) => {
      setError(null);
      setStatus('submitted');

      const userMsg: UIMessage = {
        id: generateId(),
        role: 'user',
        parts: [{ type: 'text', text: data.text }],
        content: data.text,
      };
      const assistantMsg: UIMessage = {
        id: generateId(),
        role: 'assistant',
        parts: [],
      };

      const prevMessages = messages;
      setMessages([...prevMessages, userMsg, assistantMsg]);
      assistantMsgIdRef.current = assistantMsg.id;

      const streamId = generateId();
      streamIdRef.current = streamId;

      // Build messages for backend — convert parts to plain content
      const backendMessages = [...prevMessages, userMsg].map((m) => ({
        role: m.role,
        content: m.content || m.parts.filter((p) => p.type === 'text').map((p: any) => p.text).join(''),
      }));

      setStatus('streaming');
      try {
        await api.aiChat({
          streamId,
          messages: backendMessages,
          resumeId,
          sessionId,
        });
      } catch (err: any) {
        setError(err instanceof Error ? err : new Error(String(err)));
        setStatus('idle');
      }
    },
    [messages, resumeId, sessionId]
  );

  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value);
  }, []);

  const handleSubmit = useCallback(
    (e: React.FormEvent<HTMLFormElement>) => {
      e.preventDefault();
      if (!input.trim()) return;

      if (!useSettingsStore.getState().aiApiKey) {
        const userMsg: UIMessage = { id: generateId(), role: 'user', parts: [{ type: 'text', text: input }] };
        const errorMsg: UIMessage = {
          id: generateId(),
          role: 'assistant',
          parts: [{ type: 'text', text: '__API_KEY_MISSING__' }],
        };
        setLocalMessages((prev) => [...prev, userMsg, errorMsg]);
        setInput('');
        return;
      }

      if (localMessages.length > 0) setLocalMessages([]);
      sendMessage({ text: input });
      setInput('');
    },
    [input, localMessages, sendMessage]
  );

  const allMessages = useMemo(
    () => (localMessages.length > 0 ? [...messages, ...localMessages] : messages),
    [messages, localMessages]
  );

  const clearMessages = useCallback(() => {
    setMessages([]);
    setLocalMessages([]);
  }, []);

  return {
    messages: allMessages,
    input,
    handleInputChange,
    handleSubmit,
    isLoading,
    status,
    error,
    clearMessages,
    sendMessage,
  };
}
