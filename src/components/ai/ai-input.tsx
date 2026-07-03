'use client';

import { useTranslations } from 'next-intl';
import { SendHorizonal, ServerCog } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import type { FormEvent, ChangeEvent } from 'react';
import type { AIProviderId, AIProviderOption } from '@/lib/tauri-api';

interface AIInputProps {
  input: string;
  onChange: (e: ChangeEvent<HTMLTextAreaElement>) => void;
  onSubmit: (e: FormEvent<HTMLFormElement>) => void;
  isLoading: boolean;
  models: string[];
  providers?: AIProviderOption[];
  selectedProvider?: AIProviderId;
  effectiveProvider?: AIProviderId;
  onProviderChange?: (provider: AIProviderId | undefined) => void;
  selectedModel?: string;
  effectiveModel?: string;
  onModelChange: (model: string) => void;
}

const DEFAULT_PROVIDER_VALUE = '__settings_default__';

export function AIInput({
  input,
  onChange,
  onSubmit,
  isLoading,
  models,
  providers = [],
  selectedProvider,
  effectiveProvider,
  onProviderChange,
  selectedModel,
  effectiveModel,
  onModelChange,
}: AIInputProps) {
  const t = useTranslations('ai');
  const activeProvider = providers.find((provider) => provider.id === effectiveProvider);
  const providerValue = selectedProvider || DEFAULT_PROVIDER_VALUE;
  const modelValue = selectedModel || effectiveModel || undefined;

  return (
    <form onSubmit={onSubmit} className="p-3">
      <div className="rounded-2xl border border-[var(--whale-divider)] bg-[var(--whale-cream-soft)] transition-all focus-within:border-[var(--whale-ink)]/30 focus-within:bg-[var(--whale-card)] focus-within:ring-2 focus-within:ring-[var(--whale-ink)]/8">
        {/* Textarea */}
        <textarea
          value={input}
          onChange={onChange}
          placeholder={t('placeholder')}
          rows={2}
          className="w-full resize-none bg-transparent px-4 pt-3 pb-2 text-sm text-[var(--whale-ink)] placeholder:text-[var(--whale-ink-muted)] focus:outline-none"
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault();
              const form = e.currentTarget.closest('form');
              if (form) form.requestSubmit();
            }
          }}
        />

        {/* Bottom toolbar */}
        <div className="flex items-center justify-between gap-2 px-3 pb-2.5">
          <div className="flex min-w-0 flex-1 items-center gap-1.5">
            {onProviderChange && providers.length > 0 && (
              <Select
                value={providerValue}
                onValueChange={(value) => {
                  onProviderChange(value === DEFAULT_PROVIDER_VALUE ? undefined : (value as AIProviderId));
                }}
              >
                <SelectTrigger className="h-7 max-w-[150px] gap-1 rounded-full border-[var(--whale-divider)] bg-[var(--whale-card)] px-2.5 text-[11px] font-medium text-[var(--whale-ink-soft)] shadow-none hover:bg-[var(--whale-cream-soft)]">
                  <ServerCog className="h-3 w-3 shrink-0 text-[var(--whale-ink-muted)]" />
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={DEFAULT_PROVIDER_VALUE} className="text-xs">
                    {t('followSettings')} · {activeProvider?.label || t('service')}
                  </SelectItem>
                  {providers.map((provider) => (
                    <SelectItem
                      key={provider.id}
                      value={provider.id}
                      disabled={!provider.configured}
                      className="text-xs"
                    >
                      {provider.label}{provider.configured ? '' : ` · ${t('notConfigured')}`}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}

            <Select value={modelValue} onValueChange={onModelChange}>
              <SelectTrigger className="h-7 max-w-[190px] gap-1 rounded-full border-[var(--whale-divider)] bg-[var(--whale-card)] px-2.5 text-[11px] font-medium text-[var(--whale-ink-soft)] shadow-none hover:bg-[var(--whale-cream-soft)]">
                <span className="mr-0.5 inline-block h-1.5 w-1.5 rounded-full bg-[var(--whale-ink-muted)]" />
                <SelectValue placeholder={t('model')} />
              </SelectTrigger>
              <SelectContent>
                {models.map((id) => (
                  <SelectItem key={id} value={id} className="text-xs">
                    {id}
                  </SelectItem>
                ))}
                {modelValue && !models.includes(modelValue) && (
                  <SelectItem value={modelValue} className="text-xs">
                    {modelValue}
                  </SelectItem>
                )}
              </SelectContent>
            </Select>
          </div>

          {/* Send button */}
          <button
            type="submit"
            disabled={isLoading || !input.trim()}
            className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-full bg-[var(--whale-cream-deep)] text-[var(--whale-ink-muted)] transition-all hover:bg-[var(--whale-cream-deep)] disabled:cursor-not-allowed disabled:opacity-40 [&:not(:disabled)]:bg-[var(--whale-ink)] [&:not(:disabled)]:text-[var(--whale-cream)] [&:not(:disabled)]:hover:scale-105 [&:not(:disabled)]:hover:bg-[var(--whale-ink-soft)]"
          >
            <SendHorizonal className="h-4 w-4" />
          </button>
        </div>
      </div>
    </form>
  );
}
