export type MessagePart =
  | { type: 'text'; text: string }
  | { type: 'tool'; toolName: string; toolCallId?: string; args: unknown; result?: unknown; state?: string };

export interface UIMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  parts: MessagePart[];
  content?: string;
}
