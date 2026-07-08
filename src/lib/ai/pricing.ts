import { invoke } from '@tauri-apps/api/core';
import type { AIUsageLogEntry } from '@/lib/tauri-api';

/**
 * Model pricing resolution.
 *
 * Two sources, no hand-maintained exhaustion:
 *  1. Relay stations (newapi / one-api): fetched live from `{host}/api/pricing`
 *     — the exact per-channel per-model rate the user is actually billed.
 *  2. Official endpoints (OpenAI / Anthropic / Gemini / xAI): a small built-in
 *     fallback table, since they expose no pricing API.
 *
 * All prices are USD per 1,000,000 tokens.
 */

export interface ModelPrice {
  input: number; // USD / 1M prompt tokens
  output: number; // USD / 1M completion tokens
  perCall?: number; // USD fixed per request (relay quota_type=1)
}

interface ChannelPricing {
  fetchedAt: number;
  models: Record<string, ModelPrice>;
}

const PRICING_CACHE_KEY = 'resumer_channel_pricing_v1';

/** Normalize a base URL to a stable host key (drop trailing / and /v1). */
export function pricingHostKey(baseUrl?: string): string {
  if (!baseUrl) return '';
  return baseUrl.trim().replace(/\/+$/, '').replace(/\/v1$/, '').replace(/\/+$/, '');
}

function isOfficialHost(host: string): boolean {
  const h = host.toLowerCase();
  return (
    h.includes('api.openai.com') ||
    h.includes('api.anthropic.com') ||
    h.includes('generativelanguage.googleapis.com') ||
    h.includes('api.x.ai')
  );
}

// Built-in official prices (USD per 1M tokens). Matched by substring, longest key first.
const BUILTIN_PRICES: Array<[string, number, number]> = ([
  // OpenAI
  ['gpt-4o-mini', 0.15, 0.6],
  ['gpt-4o', 2.5, 10],
  ['gpt-4.1-mini', 0.4, 1.6],
  ['gpt-4.1-nano', 0.1, 0.4],
  ['gpt-4.1', 2, 8],
  ['gpt-4-turbo', 10, 30],
  ['gpt-4', 30, 60],
  ['gpt-3.5-turbo', 0.5, 1.5],
  ['gpt-5-mini', 0.25, 2],
  ['gpt-5', 1.25, 10],
  ['o4-mini', 1.1, 4.4],
  ['o3-mini', 1.1, 4.4],
  ['o3', 2, 8],
  ['o1-mini', 1.1, 4.4],
  ['o1', 15, 60],
  // Anthropic
  ['claude-3-opus', 15, 75],
  ['claude-opus-4', 15, 75],
  ['claude-3-5-haiku', 0.8, 4],
  ['claude-3-haiku', 0.25, 1.25],
  ['claude-haiku', 0.8, 4],
  ['claude-3-5-sonnet', 3, 15],
  ['claude-3-7-sonnet', 3, 15],
  ['claude-sonnet-4', 3, 15],
  ['claude-sonnet', 3, 15],
  ['opus', 15, 75],
  ['haiku', 0.8, 4],
  ['sonnet', 3, 15],
  // Gemini
  ['gemini-1.5-flash', 0.075, 0.3],
  ['gemini-1.5-pro', 1.25, 5],
  ['gemini-2.0-flash', 0.1, 0.4],
  ['gemini-2.5-flash-lite', 0.1, 0.4],
  ['gemini-2.5-flash', 0.3, 2.5],
  ['gemini-2.5-pro', 1.25, 10],
  ['gemini-3-pro', 2, 12],
  ['gemini-3-flash', 0.3, 2.5],
  // xAI
  ['grok-4-fast', 0.2, 0.5],
  ['grok-4', 3, 15],
  ['grok-3-mini', 0.3, 0.5],
  ['grok-3', 3, 15],
] as Array<[string, number, number]>).sort((a, b) => b[0].length - a[0].length);

function builtinPrice(model: string): ModelPrice | null {
  const m = model.toLowerCase();
  for (const [key, input, output] of BUILTIN_PRICES) {
    if (m.includes(key)) return { input, output };
  }
  return null;
}

function readCache(): Record<string, ChannelPricing> {
  if (typeof window === 'undefined') return {};
  try {
    const raw = localStorage.getItem(PRICING_CACHE_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function writeCache(cache: Record<string, ChannelPricing>) {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(PRICING_CACHE_KEY, JSON.stringify(cache));
  } catch {
    /* ignore */
  }
}

/**
 * Fetch and cache relay pricing for a base URL. Returns the model count, or
 * throws with a human-readable message (e.g. the channel is not newapi/one-api).
 */
export async function fetchChannelPricing(baseUrl: string, apiKey?: string): Promise<number> {
  const host = pricingHostKey(baseUrl);
  if (!host) throw new Error('Base URL 为空');
  const res = await invoke<{ models: Array<{ model: string; input: number; output: number; perCall: number }> }>(
    'fetch_channel_pricing',
    { baseUrl, apiKey: apiKey || null }
  );
  const models: Record<string, ModelPrice> = {};
  for (const m of res.models || []) {
    if (!m.model) continue;
    models[m.model.toLowerCase()] = { input: m.input, output: m.output, perCall: m.perCall || 0 };
  }
  const cache = readCache();
  cache[host] = { fetchedAt: Date.now(), models };
  writeCache(cache);
  return Object.keys(models).length;
}

/** Resolve the price for a specific (host, model). Relay cache wins; else built-in. */
export function resolveModelPrice(baseUrl: string | undefined, model: string): ModelPrice | null {
  const host = pricingHostKey(baseUrl);
  if (host && !isOfficialHost(host)) {
    const channel = readCache()[host];
    if (channel) {
      const key = model.toLowerCase();
      if (channel.models[key]) return channel.models[key];
    }
  }
  return builtinPrice(model);
}

/** Compute the USD cost of one usage-log entry, or null if not resolvable. */
export function computeLogCost(entry: AIUsageLogEntry): number | null {
  const prompt = entry.promptTokens ?? 0;
  const totalKnown = entry.totalTokens ?? 0;
  const completion = entry.completionTokens ?? Math.max(0, totalKnown - prompt);
  if (prompt <= 0 && completion <= 0) return null;
  const price = resolveModelPrice(entry.baseUrl, entry.model);
  if (!price) return null;
  const cost = (prompt / 1e6) * price.input + (completion / 1e6) * price.output + (price.perCall || 0);
  return cost;
}

/** True when we have a cached relay-pricing table for this base URL. */
export function hasChannelPricing(baseUrl?: string): boolean {
  const host = pricingHostKey(baseUrl);
  if (!host) return false;
  return !!readCache()[host];
}
