import { create } from 'zustand';
import * as api from '@/lib/tauri-api';

export type AIProvider = 'openai' | 'anthropic' | 'gemini';
export type WebSearchMode = 'off' | 'native' | 'free' | 'bing' | 'google' | 'baidu' | 'tavily' | 'grok';

/** A saved, named API channel the user can switch between without re-entering config. */
export interface AIChannel {
  id: string;
  name: string;
  provider: AIProvider; // 模型协议: openai | anthropic | gemini (openai covers all OpenAI-format relays)
  baseURL: string;
  apiKey: string;
  model: string; // 默认模型
  models: string[]; // 常用模型列表 (empty = show all fetched)
  builtin?: boolean; // seeded official preset
}

/** Official channel presets seeded on first run (keys empty until the user fills them). */
export const CHANNEL_PRESETS: Array<Omit<AIChannel, 'id' | 'apiKey' | 'models'>> = [
  { name: 'OpenAI', provider: 'openai', baseURL: 'https://api.openai.com/v1', model: 'gpt-4o', builtin: true },
  { name: 'Anthropic', provider: 'anthropic', baseURL: 'https://api.anthropic.com', model: 'claude-sonnet-4-20250514', builtin: true },
  { name: 'Gemini', provider: 'gemini', baseURL: 'https://generativelanguage.googleapis.com/v1beta', model: 'gemini-2.5-flash', builtin: true },
  { name: 'Grok (xAI)', provider: 'openai', baseURL: 'https://api.x.ai/v1', model: 'grok-4-fast', builtin: true },
  { name: 'DeepSeek', provider: 'openai', baseURL: 'https://api.deepseek.com/v1', model: 'deepseek-chat', builtin: true },
  { name: 'Moonshot (Kimi)', provider: 'openai', baseURL: 'https://api.moonshot.cn/v1', model: 'moonshot-v1-8k', builtin: true },
  { name: 'MiniMax', provider: 'openai', baseURL: 'https://api.minimax.chat/v1', model: 'abab6.5s-chat', builtin: true },
  { name: '智谱 (Zhipu GLM)', provider: 'openai', baseURL: 'https://open.bigmodel.cn/api/paas/v4', model: 'glm-4-plus', builtin: true },
];

interface SettingsStore {
  // AI settings
  aiProvider: AIProvider;
  aiApiKey: string; // stored locally only, never sent to server
  aiBaseURL: string;
  aiModel: string;
  // Web search
  webSearchMode: WebSearchMode;
  tavilyApiKey: string;
  // Grok (xAI) as a search backend
  grokApiKey: string;
  grokBaseURL: string;
  grokModel: string;
  // API channels the user switches between (presets + custom)
  channels: AIChannel[];
  activeChannelId: string | null;
  // Editor settings
  autoSave: boolean;
  autoSaveInterval: number; // in milliseconds

  // Hydration state
  _hydrated: boolean;
  _syncing: boolean;

  // Actions
  setAIProvider: (provider: AIProvider) => void;
  setAIApiKey: (key: string) => void;
  setAIBaseURL: (url: string) => void;
  setAIModel: (model: string) => void;
  setWebSearchMode: (mode: WebSearchMode) => void;
  setTavilyApiKey: (key: string) => void;
  setGrokApiKey: (key: string) => void;
  setGrokBaseURL: (url: string) => void;
  setGrokModel: (model: string) => void;
  selectChannel: (id: string) => void;
  addChannel: (name: string) => string;
  updateChannel: (id: string, patch: Partial<Omit<AIChannel, 'id' | 'builtin'>>) => void;
  deleteChannel: (id: string) => void;
  toggleChannelModel: (id: string, model: string) => void;
  setChannelModels: (id: string, models: string[]) => void;
  setAutoSave: (enabled: boolean) => void;
  setAutoSaveInterval: (interval: number) => void;
  hydrate: () => void;
}

const API_KEY_STORAGE_KEY = 'jade_api_key';
const PROVIDER_CONFIGS_KEY = 'jade_provider_configs';
const ACTIVE_PROVIDER_STORAGE_KEY = 'jade_active_provider';
const WEB_SEARCH_MODE_KEY = 'jade_web_search_mode';
const TAVILY_KEY_STORAGE_KEY = 'jade_tavily_key';
const GROK_KEY_STORAGE_KEY = 'jade_grok_key';
const GROK_BASE_URL_KEY = 'jade_grok_base_url';
const GROK_MODEL_KEY = 'jade_grok_model';
const GROK_DEFAULT_BASE_URL = 'https://api.x.ai/v1';
const GROK_DEFAULT_MODEL = 'grok-4-fast';

function loadWebSearchMode(): WebSearchMode {
  if (typeof window === 'undefined') return 'off';
  const v = localStorage.getItem(WEB_SEARCH_MODE_KEY);
  return v === 'native' || v === 'free' || v === 'tavily' || v === 'grok' ? v : 'off';
}

function loadTavilyKey(): string {
  if (typeof window === 'undefined') return '';
  return localStorage.getItem(TAVILY_KEY_STORAGE_KEY) || '';
}

function loadGrokKey(): string {
  if (typeof window === 'undefined') return '';
  return localStorage.getItem(GROK_KEY_STORAGE_KEY) || '';
}

function loadGrokBaseURL(): string {
  if (typeof window === 'undefined') return GROK_DEFAULT_BASE_URL;
  return localStorage.getItem(GROK_BASE_URL_KEY) || GROK_DEFAULT_BASE_URL;
}

function loadGrokModel(): string {
  if (typeof window === 'undefined') return GROK_DEFAULT_MODEL;
  return localStorage.getItem(GROK_MODEL_KEY) || GROK_DEFAULT_MODEL;
}

const CHANNELS_KEY = 'jade_channels';
const ACTIVE_CHANNEL_KEY = 'jade_active_channel';

function genChannelId(): string {
  return `ch_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
}

function normHost(url: string): string {
  return (url || '').trim().replace(/\/+$/, '').replace(/\/v1$/, '').replace(/\/+$/, '').toLowerCase();
}

function saveChannels(channels: AIChannel[]) {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(CHANNELS_KEY, JSON.stringify(channels));
  } catch {
    /* ignore */
  }
}

function saveActiveChannelId(id: string | null) {
  if (typeof window === 'undefined') return;
  try {
    if (id) localStorage.setItem(ACTIVE_CHANNEL_KEY, id);
    else localStorage.removeItem(ACTIVE_CHANNEL_KEY);
  } catch {
    /* ignore */
  }
}

/**
 * Load channels, seeding the official presets on first run and migrating the
 * user's existing single-provider config into the matching preset so their API
 * key/model isn't lost.
 */
function loadOrSeedChannels(): { channels: AIChannel[]; activeChannelId: string | null } {
  if (typeof window === 'undefined') return { channels: [], activeChannelId: null };

  let stored: AIChannel[] = [];
  try {
    const raw = localStorage.getItem(CHANNELS_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    if (Array.isArray(parsed)) stored = parsed as AIChannel[];
  } catch {
    stored = [];
  }

  if (stored.length > 0) {
    // Backfill: a channel's default model always belongs in its shortlist.
    let mutated = false;
    for (const c of stored) {
      if (!c.models) {
        c.models = c.model ? [c.model] : [];
        mutated = true;
      } else if (c.model && !c.models.includes(c.model)) {
        c.models.push(c.model);
        mutated = true;
      }
    }
    if (mutated) saveChannels(stored);
    const activeId = localStorage.getItem(ACTIVE_CHANNEL_KEY);
    const activeChannelId = stored.some((c) => c.id === activeId) ? activeId : stored[0].id;
    return { channels: stored, activeChannelId };
  }

  // First run: seed presets, migrating any existing provider config.
  const curProvider = normalizeProvider(localStorage.getItem(ACTIVE_PROVIDER_STORAGE_KEY));
  const curKey = loadApiKeyLocally();
  const curConfigs = loadProviderConfigs();
  const curCfg = curConfigs[curProvider];
  const curBaseURL = curCfg?.baseURL || '';
  const curModel = curCfg?.model || '';

  const channels: AIChannel[] = CHANNEL_PRESETS.map((preset, i) => ({
    id: `ch_seed_${i}`,
    apiKey: '',
    // Seed the shortlist with the preset's default model.
    models: preset.model ? [preset.model] : [],
    ...preset,
  }));

  let activeChannelId: string | null = channels[0].id;
  if (curKey) {
    // Prefer an exact host match; else first provider match.
    const byHost = channels.find(
      (c) => c.provider === curProvider && normHost(c.baseURL) === normHost(curBaseURL)
    );
    const byProvider = channels.find((c) => c.provider === curProvider);
    const target = byHost || byProvider;
    if (target) {
      target.apiKey = curKey;
      if (curModel) {
        target.model = curModel;
        if (!target.models.includes(curModel)) target.models.push(curModel);
      }
      activeChannelId = target.id;
    } else {
      const model = curModel || PROVIDER_DEFAULTS[curProvider].model;
      const custom: AIChannel = {
        id: genChannelId(),
        name: '我的配置',
        provider: curProvider,
        baseURL: curBaseURL || PROVIDER_DEFAULTS[curProvider].baseURL,
        apiKey: curKey,
        model,
        models: model ? [model] : [],
      };
      channels.push(custom);
      activeChannelId = custom.id;
    }
  }

  saveChannels(channels);
  saveActiveChannelId(activeChannelId);
  return { channels, activeChannelId };
}

interface ProviderConfig {
  baseURL: string;
  model: string;
  apiKey: string;
}

const PROVIDER_DEFAULTS: Record<AIProvider, ProviderConfig> = {
  openai: { baseURL: 'https://api.openai.com/v1', model: 'gpt-4o', apiKey: '' },
  anthropic: { baseURL: 'https://api.anthropic.com', model: 'claude-sonnet-4-20250514', apiKey: '' },
  gemini: { baseURL: 'https://generativelanguage.googleapis.com/v1beta', model: 'gemini-2.0-flash', apiKey: '' },
};

function normalizeProvider(value: unknown): AIProvider {
  return value === 'anthropic' || value === 'gemini' ? value : 'openai';
}

function resolveProviderConfig(
  provider: AIProvider,
  overrides?: Partial<Omit<ProviderConfig, 'apiKey'>>
): ProviderConfig {
  const cached = loadProviderConfigs()[provider];
  const defaults = PROVIDER_DEFAULTS[provider];
  const fallbackApiKey = loadApiKeyLocally();

  return {
    baseURL: cached?.baseURL || overrides?.baseURL || defaults.baseURL,
    model: cached?.model || overrides?.model || defaults.model,
    apiKey: cached?.apiKey || fallbackApiKey || defaults.apiKey,
  };
}

function loadProviderConfigs(): Partial<Record<AIProvider, ProviderConfig>> {
  if (typeof window === 'undefined') return {};
  try {
    const raw = localStorage.getItem(PROVIDER_CONFIGS_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch { return {}; }
}

function saveProviderConfigs(configs: Partial<Record<AIProvider, ProviderConfig>>) {
  if (typeof window === 'undefined') return;
  try { localStorage.setItem(PROVIDER_CONFIGS_KEY, JSON.stringify(configs)); } catch { /* ignore */ }
}

function saveActiveProviderLocally(provider: AIProvider) {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(ACTIVE_PROVIDER_STORAGE_KEY, provider);
  } catch { /* ignore */ }
}

function loadActiveProviderLocally(): AIProvider {
  if (typeof window === 'undefined') return 'openai';
  try {
    return normalizeProvider(localStorage.getItem(ACTIVE_PROVIDER_STORAGE_KEY));
  } catch {
    return 'openai';
  }
}

// Sync settings to server (debounced)
let syncTimeout: ReturnType<typeof setTimeout> | null = null;

function syncToServer(state: SettingsStore) {
  if (syncTimeout) clearTimeout(syncTimeout);
  syncTimeout = setTimeout(async () => {
    try {
      await api.updateSettings({
        aiProvider: state.aiProvider,
        aiBaseURL: state.aiBaseURL,
        aiModel: state.aiModel,
        autoSave: state.autoSave,
        autoSaveInterval: state.autoSaveInterval,
      });
    } catch {
      // silently fail, local state is still correct
    }
  }, 500);
}

function syncProviderConfig(state: SettingsStore) {
  const configs = loadProviderConfigs();
  configs[state.aiProvider] = {
    baseURL: state.aiBaseURL,
    model: state.aiModel,
    apiKey: state.aiApiKey,
  };
  saveProviderConfigs(configs);
}

function saveApiKeyLocally(key: string) {
  if (typeof window === 'undefined') return;
  try {
    if (key) {
      localStorage.setItem(API_KEY_STORAGE_KEY, key);
    } else {
      localStorage.removeItem(API_KEY_STORAGE_KEY);
    }
  } catch { /* ignore */ }
}

function loadApiKeyLocally(): string {
  if (typeof window === 'undefined') return '';
  try {
    return localStorage.getItem(API_KEY_STORAGE_KEY) || '';
  } catch {
    return '';
  }
}

function initialAIState() {
  const { channels, activeChannelId } = loadOrSeedChannels();
  const active = channels.find((c) => c.id === activeChannelId);
  return {
    channels,
    activeChannelId,
    aiProvider: active?.provider ?? 'openai',
    aiBaseURL: active?.baseURL ?? 'https://api.openai.com/v1',
    aiModel: active?.model ?? 'gpt-4o',
    aiApiKey: active?.apiKey ?? '',
  };
}

export const useSettingsStore = create<SettingsStore>((set, get) => ({
  ...initialAIState(),
  webSearchMode: loadWebSearchMode(),
  tavilyApiKey: loadTavilyKey(),
  grokApiKey: loadGrokKey(),
  grokBaseURL: loadGrokBaseURL(),
  grokModel: loadGrokModel(),
  autoSave: true,
  autoSaveInterval: 500,
  _hydrated: false,
  _syncing: false,

  setAIProvider: (provider) => {
    const { aiProvider: prev, aiBaseURL, aiModel, aiApiKey } = get();

    // Save current provider's config before switching
    const configs = loadProviderConfigs();
    configs[prev] = { baseURL: aiBaseURL, model: aiModel, apiKey: aiApiKey };
    saveProviderConfigs(configs);

    // Restore target provider's cached config, or use defaults
    const cached = configs[provider];
    const defaults = PROVIDER_DEFAULTS[provider];
    const restored = cached || defaults;

    set({
      aiProvider: provider,
      aiBaseURL: restored.baseURL,
      aiModel: restored.model,
      aiApiKey: restored.apiKey,
    });
    saveActiveProviderLocally(provider);
    saveApiKeyLocally(restored.apiKey);
    syncProviderConfig(get());
    syncToServer(get());
  },

  setAIApiKey: (key) => {
    set({ aiApiKey: key });
    saveApiKeyLocally(key);
    syncProviderConfig(get());
  },

  setAIBaseURL: (url) => {
    set({ aiBaseURL: url });
    syncToServer(get());
    syncProviderConfig(get());
  },

  setAIModel: (model) => {
    set({ aiModel: model });
    syncToServer(get());
    syncProviderConfig(get());
  },

  setWebSearchMode: (mode) => {
    set({ webSearchMode: mode });
    try { localStorage.setItem(WEB_SEARCH_MODE_KEY, mode); } catch { /* ignore */ }
  },

  setTavilyApiKey: (key) => {
    set({ tavilyApiKey: key });
    try {
      if (key) localStorage.setItem(TAVILY_KEY_STORAGE_KEY, key);
      else localStorage.removeItem(TAVILY_KEY_STORAGE_KEY);
    } catch { /* ignore */ }
  },

  setGrokApiKey: (key) => {
    set({ grokApiKey: key });
    try {
      if (key) localStorage.setItem(GROK_KEY_STORAGE_KEY, key);
      else localStorage.removeItem(GROK_KEY_STORAGE_KEY);
    } catch { /* ignore */ }
  },

  setGrokBaseURL: (url) => {
    set({ grokBaseURL: url });
    try {
      if (url) localStorage.setItem(GROK_BASE_URL_KEY, url);
      else localStorage.removeItem(GROK_BASE_URL_KEY);
    } catch { /* ignore */ }
  },

  setGrokModel: (model) => {
    set({ grokModel: model });
    try {
      if (model) localStorage.setItem(GROK_MODEL_KEY, model);
      else localStorage.removeItem(GROK_MODEL_KEY);
    } catch { /* ignore */ }
  },

  // Select a channel and mirror it into the live AI config the app resolves from.
  selectChannel: (id) => {
    const channel = get().channels.find((c) => c.id === id);
    if (!channel) return;
    set({
      activeChannelId: id,
      aiProvider: channel.provider,
      aiBaseURL: channel.baseURL,
      aiModel: channel.model,
      aiApiKey: channel.apiKey,
    });
    saveActiveChannelId(id);
    saveActiveProviderLocally(channel.provider);
    saveApiKeyLocally(channel.apiKey);
    syncProviderConfig(get());
    syncToServer(get());
  },

  addChannel: (name) => {
    const channel: AIChannel = {
      id: genChannelId(),
      name: name.trim() || '自定义渠道',
      provider: 'openai',
      baseURL: 'https://api.openai.com/v1',
      apiKey: '',
      model: '',
      models: [],
    };
    const next = [...get().channels, channel];
    set({ channels: next });
    saveChannels(next);
    get().selectChannel(channel.id);
    return channel.id;
  },

  updateChannel: (id, patch) => {
    const next = get().channels.map((c) => {
      if (c.id !== id) return c;
      const merged = { ...c, ...patch };
      // A default model is always part of its channel's shortlist.
      if (typeof patch.model === 'string' && patch.model && !merged.models.includes(patch.model)) {
        merged.models = [...merged.models, patch.model];
      }
      return merged;
    });
    set({ channels: next });
    saveChannels(next);
    // Keep the live config mirrored when editing the active channel.
    if (get().activeChannelId === id) {
      const c = next.find((x) => x.id === id)!;
      const mirror: Partial<SettingsStore> = {};
      if ('provider' in patch) mirror.aiProvider = c.provider;
      if ('baseURL' in patch) mirror.aiBaseURL = c.baseURL;
      if ('model' in patch) mirror.aiModel = c.model;
      if ('apiKey' in patch) mirror.aiApiKey = c.apiKey;
      if (Object.keys(mirror).length) {
        set(mirror);
        if ('provider' in patch) saveActiveProviderLocally(c.provider);
        if ('apiKey' in patch) saveApiKeyLocally(c.apiKey);
        syncProviderConfig(get());
        syncToServer(get());
      }
    }
  },

  deleteChannel: (id) => {
    const remaining = get().channels.filter((c) => c.id !== id);
    set({ channels: remaining });
    saveChannels(remaining);
    if (get().activeChannelId === id) {
      if (remaining.length > 0) get().selectChannel(remaining[0].id);
      else {
        set({ activeChannelId: null });
        saveActiveChannelId(null);
      }
    }
  },

  toggleChannelModel: (id, model) => {
    const channel = get().channels.find((c) => c.id === id);
    if (!channel) return;
    const models = channel.models.includes(model)
      ? channel.models.filter((m) => m !== model)
      : [...channel.models, model];
    get().updateChannel(id, { models });
  },

  setChannelModels: (id, models) => {
    get().updateChannel(id, { models });
  },

  setAutoSave: (enabled) => {
    set({ autoSave: enabled });
    syncToServer(get());
  },

  setAutoSaveInterval: (interval) => {
    set({ autoSaveInterval: interval });
    syncToServer(get());
  },

  hydrate: async () => {
    if (get()._hydrated) return;
    // AI config is now driven by channels (already seeded at init); only pull
    // the editor preferences from the backend here.
    try {
      const data = await api.getSettings();
      if (data && typeof data === 'object') {
        set({
          ...(typeof data.autoSave === 'boolean' && { autoSave: data.autoSave }),
          ...(typeof data.autoSaveInterval === 'number' && { autoSaveInterval: data.autoSaveInterval }),
          _hydrated: true,
        });
        return;
      }
    } catch { /* fall through */ }
    set({ _hydrated: true });
  },
}));

// Auto-hydrate on client side so settings are ready before any component uses them
if (typeof window !== 'undefined') {
  (window as any).__jadeSettingsStore = useSettingsStore;
  useSettingsStore.getState().hydrate();
}
