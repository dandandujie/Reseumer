import { create } from 'zustand';
import * as api from '@/lib/tauri-api';

export type AIProvider = 'openai' | 'anthropic' | 'gemini';

interface SettingsStore {
  // AI settings
  aiProvider: AIProvider;
  aiApiKey: string; // stored locally only, never sent to server
  aiBaseURL: string;
  aiModel: string;
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
  setAutoSave: (enabled: boolean) => void;
  setAutoSaveInterval: (interval: number) => void;
  hydrate: () => void;
}

const API_KEY_STORAGE_KEY = 'jade_api_key';
const PROVIDER_CONFIGS_KEY = 'jade_provider_configs';
const ACTIVE_PROVIDER_STORAGE_KEY = 'jade_active_provider';

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

export function getAIHeaders(): Record<string, string> {
  const { aiProvider, aiApiKey, aiBaseURL, aiModel } = useSettingsStore.getState();
  const headers: Record<string, string> = {};
  if (aiProvider) headers['x-provider'] = aiProvider;
  if (aiApiKey) headers['x-api-key'] = aiApiKey;
  if (aiBaseURL) headers['x-base-url'] = aiBaseURL;
  if (aiModel) headers['x-model'] = aiModel;
  return headers;
}

export const useSettingsStore = create<SettingsStore>((set, get) => ({
  aiProvider: 'openai',
  aiApiKey: '',
  aiBaseURL: 'https://api.openai.com/v1',
  aiModel: 'gpt-4o',
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

    // Load other settings from Tauri backend
    try {
      const data = await api.getSettings();
      if (data && typeof data === 'object') {
        const provider = normalizeProvider(data.aiProvider);
        const resolved = resolveProviderConfig(provider, {
          baseURL: data.aiBaseURL,
          model: data.aiModel,
        });
        set({
          aiProvider: provider,
          aiApiKey: resolved.apiKey,
          aiBaseURL: resolved.baseURL,
          aiModel: resolved.model,
          ...(typeof data.autoSave === 'boolean' && { autoSave: data.autoSave }),
          ...(typeof data.autoSaveInterval === 'number' && { autoSaveInterval: data.autoSaveInterval }),
          _hydrated: true,
        });
        saveActiveProviderLocally(provider);
        saveApiKeyLocally(resolved.apiKey);
        syncProviderConfig(get());
        return;
      }
    } catch { /* fall through */ }

    const provider = loadActiveProviderLocally();
    const resolved = resolveProviderConfig(provider);
    set({
      aiProvider: provider,
      aiApiKey: resolved.apiKey,
      aiBaseURL: resolved.baseURL,
      aiModel: resolved.model,
      _hydrated: true,
    });
    saveActiveProviderLocally(provider);
    saveApiKeyLocally(resolved.apiKey);
    syncProviderConfig(get());
  },
}));

// Auto-hydrate on client side so settings are ready before any component uses them
if (typeof window !== 'undefined') {
  (window as any).__jadeSettingsStore = useSettingsStore;
  useSettingsStore.getState().hydrate();
}
