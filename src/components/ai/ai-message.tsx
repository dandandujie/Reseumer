'use client';

import { Bot, User, AlertTriangle, Settings, Wand2 } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeRaw from 'rehype-raw';
import rehypeSanitize, { defaultSchema } from 'rehype-sanitize';
import { useTranslations } from 'next-intl';
import type { UIMessage, MessagePart } from '@/types/chat';
import { useUIStore } from '@/stores/ui-store';
import { useProposalsStore, isMutationTool } from '@/stores/proposals-store';
import { AIProposalCard } from './ai-proposal-card';
import type { CSSProperties } from 'react';

interface AIMessageProps {
  message: UIMessage;
  /** True for the assistant message currently being streamed.
   *  Skips markdown rendering (uses plain &lt;pre&gt;) to keep re-render cost low. */
  isStreaming?: boolean;
}

type ToolPart = Extract<MessagePart, { type: 'tool' }>;

const htmlVisualTags = [
  'div',
  'span',
  'details',
  'summary',
  'table',
  'thead',
  'tbody',
  'tr',
  'th',
  'td',
  'br',
  'hr',
  'p',
  'ul',
  'ol',
  'li',
  'strong',
  'em',
  'code',
  'pre',
];

const htmlVisualSanitizeSchema = {
  ...defaultSchema,
  tagNames: Array.from(new Set([...(defaultSchema.tagNames || []), ...htmlVisualTags])),
  attributes: {
    ...defaultSchema.attributes,
    '*': [
      ...(((defaultSchema.attributes || {}) as Record<string, unknown[]>)['*'] || []),
      'style',
      'title',
    ],
    details: [
      ...(((defaultSchema.attributes || {}) as Record<string, unknown[]>)['details'] || []),
      'open',
      'style',
    ],
    th: [
      ...(((defaultSchema.attributes || {}) as Record<string, unknown[]>)['th'] || []),
      'colspan',
      'rowspan',
      'style',
    ],
    td: [
      ...(((defaultSchema.attributes || {}) as Record<string, unknown[]>)['td'] || []),
      'colspan',
      'rowspan',
      'style',
    ],
  },
};

function readCssSize(value: unknown): number | null {
  if (typeof value === 'number') return value;
  if (typeof value !== 'string') return null;
  const trimmed = value.trim().toLowerCase();
  const numeric = Number.parseFloat(trimmed);
  if (!Number.isFinite(numeric)) return null;
  if (trimmed.endsWith('rem')) return numeric * 16;
  if (trimmed.endsWith('em')) return numeric * 14;
  if (trimmed.endsWith('px') || /^\d+(\.\d+)?$/.test(trimmed)) return numeric;
  if (trimmed.endsWith('vh')) return (numeric / 100) * 900;
  if (trimmed.endsWith('vw')) return (numeric / 100) * 1440;
  return null;
}

function compactVisualStyle(style: unknown, element: 'block' | 'inline' | 'table' = 'block'): CSSProperties {
  const next: CSSProperties = style && typeof style === 'object' ? { ...(style as CSSProperties) } : {};

  const height = readCssSize(next.height);
  const minHeight = readCssSize(next.minHeight);
  const width = readCssSize(next.width);
  const minWidth = readCssSize(next.minWidth);
  const fontSize = readCssSize(next.fontSize);

  if (height === null && typeof next.height === 'string' && /vh|vw|%|calc|min|max/.test(next.height)) {
    next.height = 'auto';
  } else if (height !== null && height > 260) {
    next.height = 'auto';
  }

  if (minHeight === null && typeof next.minHeight === 'string' && /vh|vw|%|calc|min|max/.test(next.minHeight)) {
    next.minHeight = undefined;
  } else if (minHeight !== null && minHeight > 180) {
    next.minHeight = undefined;
  }

  if (width === null && typeof next.width === 'string' && /vw/.test(next.width)) {
    next.width = '100%';
  } else if (width !== null && width > 980) {
    next.width = '100%';
  }

  if (minWidth !== null && minWidth > 720) {
    next.minWidth = undefined;
  }

  if (next.position === 'fixed' || next.position === 'sticky' || next.position === 'absolute') {
    next.position = 'relative';
    next.inset = undefined;
    next.top = undefined;
    next.right = undefined;
    next.bottom = undefined;
    next.left = undefined;
    next.zIndex = undefined;
  }

  if (fontSize !== null && fontSize > 24) {
    next.fontSize = '16px';
  }

  for (const key of [
    'margin',
    'marginTop',
    'marginRight',
    'marginBottom',
    'marginLeft',
    'padding',
    'paddingTop',
    'paddingRight',
    'paddingBottom',
    'paddingLeft',
    'gap',
  ] as const) {
    const size = readCssSize(next[key]);
    if (size !== null && size > 28) next[key] = '12px' as never;
  }

  next.transform = undefined;
  next.scale = undefined;
  next.translate = undefined;
  next.rotate = undefined;
  next.backgroundImage = undefined;
  if (next.whiteSpace === 'nowrap') next.whiteSpace = 'normal';

  if (element !== 'inline') {
    next.maxWidth = '100%';
    next.boxSizing = 'border-box';
    next.overflowX = 'auto';
  }

  if (element === 'table') {
    next.width = '100%';
    next.borderCollapse = next.borderCollapse || 'collapse';
  }

  return next;
}

function cleanAssistantText(text: string): string {
  return text
    .replace(/^.*You[’']ve used\s+~?\d+[×x]\s+more tokens than Animal Farm\.\s*$/gim, '')
    .replace(/\bdashboard\.thinking\b/g, '思考中...')
    .trim();
}

const markdownComponents = {
  div: ({ node: _node, style, ...props }: any) => <div {...props} style={compactVisualStyle(style)} />,
  span: ({ node: _node, style, ...props }: any) => <span {...props} style={compactVisualStyle(style, 'inline')} />,
  p: ({ node: _node, style, ...props }: any) => <p {...props} style={compactVisualStyle(style)} />,
  ul: ({ node: _node, style, ...props }: any) => <ul {...props} style={compactVisualStyle(style)} />,
  ol: ({ node: _node, style, ...props }: any) => <ol {...props} style={compactVisualStyle(style)} />,
  li: ({ node: _node, style, ...props }: any) => <li {...props} style={compactVisualStyle(style)} />,
  details: ({ node: _node, style, ...props }: any) => <details {...props} style={compactVisualStyle(style)} />,
  summary: ({ node: _node, style, ...props }: any) => <summary {...props} style={compactVisualStyle(style)} />,
  table: ({ node: _node, style, ...props }: any) => <table {...props} style={compactVisualStyle(style, 'table')} />,
  thead: ({ node: _node, style, ...props }: any) => <thead {...props} style={compactVisualStyle(style, 'table')} />,
  tbody: ({ node: _node, style, ...props }: any) => <tbody {...props} style={compactVisualStyle(style, 'table')} />,
  tr: ({ node: _node, style, ...props }: any) => <tr {...props} style={compactVisualStyle(style, 'table')} />,
  th: ({ node: _node, style, ...props }: any) => <th {...props} style={compactVisualStyle(style, 'table')} />,
  td: ({ node: _node, style, ...props }: any) => <td {...props} style={compactVisualStyle(style, 'table')} />,
};

function isToolPart(part: MessagePart): part is ToolPart {
  return part.type === 'tool';
}

/** Compact pill rendered while a non-mutation tool is running.
 *  Mutation tools get a full ProposalCard instead — see below. */
function ToolPill({ part }: { part: ToolPart }) {
  const t = useTranslations('ai');
  const state = part.state;
  const isCompleted = state === 'output-available' || state === 'output-error';

  return (
    <div className="my-1.5 inline-flex items-center gap-1.5 rounded-full border border-[var(--whale-divider)] bg-[var(--whale-cream-soft)] px-2.5 py-0.5 text-[11px] text-[var(--whale-ink-muted)]">
      {!isCompleted && (
        <span className="h-2.5 w-2.5 shrink-0 animate-spin rounded-full border-[1.5px] border-[var(--whale-divider)] border-t-[var(--whale-mint-deep)]" />
      )}
      {isCompleted && (
        <Wand2 className="h-2.5 w-2.5 shrink-0 text-[var(--whale-mint-deep)]" />
      )}
      <span>{t('toolCalling') || '正在调用'} {part.toolName}</span>
    </div>
  );
}

function ToolBlock({ part }: { part: ToolPart }) {
  const toolCallId = (part as any).toolCallId as string | undefined;
  const hasPendingProposal = useProposalsStore((s) =>
    toolCallId ? s.proposals.some((p) => p.toolCallId === toolCallId) : false
  );

  // If this is a pending mutation, surface the proposal card (the only UI the user sees).
  if (hasPendingProposal && toolCallId) {
    return <AIProposalCard toolCallId={toolCallId} />;
  }

  // Mutation tool already accepted/rejected — render nothing.
  if (isMutationTool(part.toolName)) {
    return null;
  }

  // Non-mutation tools (e.g. analyzeJdMatch): show a tiny status pill while running, hide when done.
  if (part.state === 'output-available') {
    return null;
  }
  return <ToolPill part={part} />;
}

function APIKeyMissingCard() {
  const t = useTranslations('ai');
  const { openModal, setSettingsTab } = useUIStore();

  return (
    <div className="flex flex-col gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3">
      <div className="flex items-center gap-2 text-amber-700">
        <AlertTriangle className="h-4 w-4 shrink-0" />
        <span className="text-[13px] font-medium">{t('apiKeyMissing')}</span>
      </div>
      <p className="text-[12px] leading-relaxed text-amber-600">
        {t('apiKeyMissingHint')}
      </p>
      <button
        type="button"
        className="inline-flex w-fit cursor-pointer items-center gap-1.5 rounded-lg bg-amber-100 px-3 py-1.5 text-[12px] font-medium text-amber-700 transition-colors hover:bg-amber-200"
        onClick={() => {
          setSettingsTab('ai');
          openModal('settings');
        }}
      >
        <Settings className="h-3.5 w-3.5" />
        {t('goToSettings')}
      </button>
    </div>
  );
}

function AIMessageImpl({ message }: AIMessageProps) {
  const isUser = message.role === 'user';

  const userText = isUser
    ? (message.parts || [])
        .filter((p) => p.type === 'text')
        .map((p) => (p as { type: 'text'; text: string }).text)
        .join('')
    : '';

  return (
    <div className={`flex gap-2.5 ${isUser ? 'flex-row-reverse' : ''}`}>
      <div
        className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full ${
          isUser
            ? 'bg-[var(--whale-ink)]'
            : 'bg-[var(--whale-ink)]'
        }`}
      >
        {isUser ? (
          <User className="h-3 w-3 text-[var(--whale-cream)]" />
        ) : (
          <Bot className="h-3 w-3 text-[var(--whale-cream)]" />
        )}
      </div>
      <div
        className={`min-w-0 rounded-2xl px-3 py-2 text-[13px] leading-relaxed ${
          isUser
            ? 'max-w-[min(720px,calc(100%-2.5rem))] bg-[var(--whale-ink)] text-[var(--whale-cream)]'
            : 'w-full max-w-[calc(100%-2.5rem)] bg-[var(--whale-cream-soft)] text-[var(--whale-ink-soft)] ring-1 ring-[var(--whale-divider)]'
        }`}
      >
        {isUser ? (
          <p className="whitespace-pre-wrap">{userText}</p>
        ) : (
          (message.parts || []).map((part, i) => {
            if (part.type === 'text') {
              const text = cleanAssistantText(part.text);
              if (!text) return null;
              if (text === '__API_KEY_MISSING__') {
                return <APIKeyMissingCard key={i} />;
              }
              // Always render markdown (even during streaming) for better UX
              // ReactMarkdown is optimized enough to handle incremental updates
              return (
                <div key={i} className="ai-markdown">
		                  <ReactMarkdown
		                    remarkPlugins={[remarkGfm]}
		                    rehypePlugins={[rehypeRaw, [rehypeSanitize, htmlVisualSanitizeSchema]]}
		                    components={markdownComponents}
		                  >
                    {text}
                  </ReactMarkdown>
                </div>
              );
            }
            if (isToolPart(part)) {
              return <ToolBlock key={i} part={part} />;
            }
            return null;
          })
        )}
      </div>
    </div>
  );
}

// Export without memo to ensure external state changes (like proposal acceptance) trigger re-renders
export const AIMessage = AIMessageImpl;
