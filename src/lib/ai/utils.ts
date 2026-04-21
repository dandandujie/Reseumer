import type { UIMessage, MessagePart } from '@/types/chat';

interface DBMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  metadata?: Record<string, unknown> | null;
  createdAt: Date | number | null;
}

export function dbMessagesToUIMessages(dbMessages: DBMessage[]): UIMessage[] {
  return dbMessages.map((msg) => {
    const parts: MessagePart[] = [];
    const metadata = (msg.metadata || {}) as Record<string, unknown>;

    if (msg.role === 'assistant' && metadata.orderedParts) {
      const orderedParts = metadata.orderedParts as (
        | { type: 'text'; text: string }
        | { type: 'tool'; toolName: string; args: unknown; result: unknown }
      )[];
      for (const op of orderedParts) {
        if (op.type === 'text') {
          parts.push({ type: 'text', text: op.text });
        } else if (op.type === 'tool') {
          parts.push({
            type: 'tool',
            toolName: op.toolName,
            args: op.args,
            result: op.result ?? { success: true },
            state: 'output-available',
          });
        }
      }
    } else if (msg.content) {
      parts.push({ type: 'text', text: msg.content });
    }

    return {
      id: msg.id,
      role: msg.role,
      content: msg.content,
      parts,
    };
  });
}
