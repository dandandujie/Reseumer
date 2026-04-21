import { useCallback, useRef, useState } from 'react';
import { dbMessagesToUIMessages } from '@/lib/ai/utils';
import * as api from '@/lib/tauri-api';

const PAGE_SIZE = 50;

export function useMessagePagination() {
  const [historicalMessages, setHistoricalMessages] = useState<any[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const offsetRef = useRef(0);
  const totalRef = useRef(0);
  const activeSessionIdRef = useRef<string | undefined>(undefined);

  const loadInitial = useCallback(async (sessionId: string): Promise<any[]> => {
    activeSessionIdRef.current = sessionId;
    setHistoricalMessages([]);
    setHasMore(false);
    offsetRef.current = 0;
    totalRef.current = 0;

    try {
      const data = await api.listChatMessages(sessionId, PAGE_SIZE, 0);
      if (activeSessionIdRef.current !== sessionId) return [];

      const messages = data.messages || [];
      const total = data.total || 0;
      totalRef.current = total;

      // Load the most recent PAGE_SIZE messages (from end)
      // Our backend returns in ascending order; get the last page
      const start = Math.max(0, total - PAGE_SIZE);
      const latest = start > 0
        ? (await api.listChatMessages(sessionId, PAGE_SIZE, start)).messages || []
        : messages;

      offsetRef.current = start;
      setHasMore(start > 0);

      return dbMessagesToUIMessages(latest);
    } catch {
      return [];
    }
  }, []);

  const loadMore = useCallback(async (scrollRef: React.RefObject<HTMLDivElement | null>) => {
    const sessionId = activeSessionIdRef.current;
    if (!sessionId || isLoadingMore || offsetRef.current <= 0) return;

    setIsLoadingMore(true);
    const el = scrollRef.current;
    const prevScrollHeight = el?.scrollHeight ?? 0;
    const prevScrollTop = el?.scrollTop ?? 0;

    try {
      const newStart = Math.max(0, offsetRef.current - PAGE_SIZE);
      const count = offsetRef.current - newStart;
      const data = await api.listChatMessages(sessionId, count, newStart);

      if (activeSessionIdRef.current !== sessionId) return;

      const olderMessages = dbMessagesToUIMessages(data.messages || []);
      offsetRef.current = newStart;
      setHasMore(newStart > 0);
      setHistoricalMessages((prev) => [...olderMessages, ...prev]);

      requestAnimationFrame(() => {
        if (el) {
          const newScrollHeight = el.scrollHeight;
          el.scrollTop = prevScrollTop + (newScrollHeight - prevScrollHeight);
        }
      });
    } catch {
      // Silently fail
    } finally {
      setIsLoadingMore(false);
    }
  }, [isLoadingMore]);

  const reset = useCallback(() => {
    setHistoricalMessages([]);
    setHasMore(false);
    setIsLoadingMore(false);
    offsetRef.current = 0;
    totalRef.current = 0;
    activeSessionIdRef.current = undefined;
  }, []);

  return {
    historicalMessages,
    hasMore,
    isLoadingMore,
    loadInitial,
    loadMore,
    reset,
  };
}
