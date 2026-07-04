/**
 * Tauri API adapter.
 * Replaces fetch('/api/...') calls with Tauri invoke() calls.
 * Keeps the same data interface so hooks/stores need minimal changes.
 */
import { invoke } from '@tauri-apps/api/core';
import { getOrCreateClientFingerprint } from '@/lib/client-fingerprint';

const LOCAL_AI_PROVIDER_KEY = 'jade_active_provider';
const LOCAL_AI_API_KEY = 'jade_api_key';
const LOCAL_AI_PROVIDER_CONFIGS = 'jade_provider_configs';
const LOCAL_AI_USAGE_LOGS = 'resumer_ai_usage_logs_v1';
const LOCAL_AI_DEFAULTS = {
  openai: { baseURL: 'https://api.openai.com/v1', model: 'gpt-4o' },
  anthropic: { baseURL: 'https://api.anthropic.com', model: 'claude-sonnet-4-20250514' },
  gemini: { baseURL: 'https://generativelanguage.googleapis.com/v1beta', model: 'gemini-2.0-flash' },
} as const;

export type AIProviderId = keyof typeof LOCAL_AI_DEFAULTS;

export interface AIConfigSelection {
  provider?: AIProviderId;
  model?: string;
}

export interface AIProviderOption {
  id: AIProviderId;
  label: string;
  model: string;
  configured: boolean;
  active: boolean;
}

export type AIUsageAction =
  | 'grammar_check'
  | 'jd_analysis'
  | 'translate'
  | 'generate_resume'
  | 'parse_resume'
  | 'project_chat'
  | 'global_agent'
  | 'cover_letter';

export interface AIUsageLogEntry {
  id: string;
  action: AIUsageAction;
  provider: string;
  model: string;
  startedAt: number;
  endedAt: number;
  durationMs: number;
  success: boolean;
  totalTokens?: number;
  costUsd?: number;
  error?: string;
}

const LOCAL_AI_PROVIDER_LABELS: Record<AIProviderId, string> = {
  openai: 'OpenAI',
  anthropic: 'Anthropic',
  gemini: 'Gemini',
};

function normalizeAIProvider(value: unknown): AIProviderId {
  return value === 'anthropic' || value === 'gemini' ? value : 'openai';
}

function loadLocalProviderConfigs(): Record<string, any> {
  try {
    return JSON.parse(localStorage.getItem(LOCAL_AI_PROVIDER_CONFIGS) || '{}') || {};
  } catch {
    return {};
  }
}

function getActiveAIProvider(): AIProviderId {
  return normalizeAIProvider(localStorage.getItem(LOCAL_AI_PROVIDER_KEY));
}

function readAIUsageLogs(): AIUsageLogEntry[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(LOCAL_AI_USAGE_LOGS);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed as AIUsageLogEntry[] : [];
  } catch {
    return [];
  }
}

function persistAIUsageLog(entry: AIUsageLogEntry) {
  if (typeof window === 'undefined') return;
  try {
    const logs = readAIUsageLogs();
    localStorage.setItem(LOCAL_AI_USAGE_LOGS, JSON.stringify([entry, ...logs].slice(0, 500)));
  } catch {
    // Ignore private-mode/quota failures. AI calls must not fail because analytics cannot persist.
  }
}

export function listAIUsageLogs(limit = 500): AIUsageLogEntry[] {
  return readAIUsageLogs()
    .sort((a, b) => b.startedAt - a.startedAt)
    .slice(0, limit);
}

async function withAIUsageLog<T>(
  action: AIUsageAction,
  config: { provider?: string; model?: string },
  run: () => Promise<T>
): Promise<T> {
  const startedAt = Date.now();
  try {
    const result = await run();
    const endedAt = Date.now();
    persistAIUsageLog({
      id: `${startedAt}-${Math.random().toString(36).slice(2, 8)}`,
      action,
      provider: config.provider || 'unknown',
      model: config.model || 'unknown',
      startedAt,
      endedAt,
      durationMs: endedAt - startedAt,
      success: true,
    });
    return result;
  } catch (err) {
    const endedAt = Date.now();
    persistAIUsageLog({
      id: `${startedAt}-${Math.random().toString(36).slice(2, 8)}`,
      action,
      provider: config.provider || 'unknown',
      model: config.model || 'unknown',
      startedAt,
      endedAt,
      durationMs: endedAt - startedAt,
      success: false,
      error: err instanceof Error ? err.message : String(err),
    });
    throw err;
  }
}

function getAIConfigFromLocalCache(providerOverride?: AIProviderId) {
  const provider = providerOverride || getActiveAIProvider();
  const defaults = LOCAL_AI_DEFAULTS[provider];
  const configs = loadLocalProviderConfigs();
  const cached = configs?.[provider] || {};
  const activeProvider = getActiveAIProvider();

  const webSearchMode = localStorage.getItem('jade_web_search_mode') || 'off';
  return {
    provider,
    apiKey: cached.apiKey || (provider === activeProvider ? localStorage.getItem(LOCAL_AI_API_KEY) : '') || '',
    baseUrl: cached.baseURL || defaults.baseURL,
    model: cached.model || defaults.model,
    webSearchMode: webSearchMode === 'native' || webSearchMode === 'free' || webSearchMode === 'tavily' ? webSearchMode : 'off',
    tavilyApiKey: localStorage.getItem('jade_tavily_key') || '',
  };
}

async function getUserId(): Promise<string> {
  const fingerprint = getOrCreateClientFingerprint();
  if (!fingerprint) throw new Error('No fingerprint');
  const user = await invoke<any>('ensure_user', { fingerprint });
  return user.id;
}

// Cache user ID after first resolve
let _cachedUserId: string | null = null;
async function getCachedUserId(): Promise<string> {
  if (!_cachedUserId) {
    _cachedUserId = await getUserId();
  }
  return _cachedUserId;
}

// ── Resume CRUD ──

export async function listResumes() {
  const userId = await getCachedUserId();
  return invoke<any[]>('list_resumes', { userId });
}

export async function getResume(id: string) {
  const userId = await getCachedUserId();
  return invoke<any>('get_resume', { id, userId });
}

export async function createResume(data: {
  title?: string;
  language?: string;
  template?: string;
  themeConfig?: any;
  sections?: any[];
}) {
  const userId = await getCachedUserId();
  return invoke<string>('create_resume', {
    userId,
    title: data.title || '未命名简历',
    template: data.template,
    language: data.language,
    themeConfig: data.themeConfig,
    sections: data.sections,
  });
}

export async function updateResume(
  id: string,
  data: {
    title: string;
    template?: string;
    themeConfig?: any;
    sections?: any[];
    snapshotEvent?: 'save' | 'ai_accept' | 'ai_reject';
  }
) {
  const userId = await getCachedUserId();
  const payload = JSON.parse(JSON.stringify({
    id,
    userId,
    title: data.title,
    template: data.template || 'classic',
    themeConfig: data.themeConfig || {},
    sections: data.sections,
    snapshotEvent: data.snapshotEvent || 'save',
  }));

  return invoke<void>('update_resume', { payload });
}

export async function listResumeVersions(resumeId?: string) {
  const userId = await getCachedUserId();
  return invoke<any[]>('list_resume_versions', { userId, resumeId });
}

export async function createResumeVersionSnapshot(
  resumeId: string,
  event: 'save' | 'ai_accept' | 'ai_reject'
) {
  const userId = await getCachedUserId();
  return invoke<string>('create_resume_version_snapshot', { userId, resumeId, event });
}

export async function deleteResume(id: string) {
  const userId = await getCachedUserId();
  return invoke<void>('delete_resume', { id, userId });
}

export async function duplicateResume(id: string) {
  const userId = await getCachedUserId();
  return invoke<string>('duplicate_resume', { id, userId });
}

// ── User / Settings ──

export async function getSettings() {
  const userId = await getCachedUserId();
  return invoke<any>('get_settings', { userId });
}

export async function updateSettings(settings: Record<string, any>) {
  const userId = await getCachedUserId();
  return invoke<void>('update_settings', { userId, settings });
}

// ── AI Config ──

export function listAIProviderOptions(): AIProviderOption[] {
  if (typeof window === 'undefined') {
    return Object.keys(LOCAL_AI_DEFAULTS).map((id) => ({
      id: id as AIProviderId,
      label: LOCAL_AI_PROVIDER_LABELS[id as AIProviderId],
      model: LOCAL_AI_DEFAULTS[id as AIProviderId].model,
      configured: false,
      active: id === 'openai',
    }));
  }

  const w = window as any;
  const store = w.__jadeSettingsStore;
  const state = store?.getState?.();
  const activeProvider = normalizeAIProvider(state?.aiProvider || localStorage.getItem(LOCAL_AI_PROVIDER_KEY));
  const configs = loadLocalProviderConfigs();

  return (Object.keys(LOCAL_AI_DEFAULTS) as AIProviderId[]).map((provider) => {
    const defaults = LOCAL_AI_DEFAULTS[provider];
    const cached = configs?.[provider] || {};
    const isActive = provider === activeProvider;
    const apiKey = isActive
      ? state?.aiApiKey || cached.apiKey || localStorage.getItem(LOCAL_AI_API_KEY) || ''
      : cached.apiKey || '';
    const model = isActive
      ? state?.aiModel || cached.model || defaults.model
      : cached.model || defaults.model;

    return {
      id: provider,
      label: LOCAL_AI_PROVIDER_LABELS[provider],
      model,
      configured: Boolean(String(apiKey).trim()),
      active: isActive,
    };
  });
}

function getAIConfigFromStore(selection?: AIConfigSelection) {
  if (typeof window === 'undefined') return { provider: 'openai', apiKey: '', baseUrl: 'https://api.openai.com/v1', model: 'gpt-4o' };
  const providerOverride = selection?.provider;
  const modelOverride = selection?.model?.trim();

  if (providerOverride) {
    const config = getAIConfigFromLocalCache(providerOverride);
    if (modelOverride) config.model = modelOverride;
    return config;
  }

  // Access the global store lazily to avoid import cycles
  const w = window as any;
  const store = w.__jadeSettingsStore;
  if (store) {
    const s = store.getState();
    const local = (() => {
      try {
        return getAIConfigFromLocalCache();
      } catch {
        return null;
      }
    })();

    const providerReady = s._hydrated || !!s.aiApiKey;
    const providerChanged = local && s.aiProvider !== local.provider;
    const missingApiKey = local && !s.aiApiKey && !!local.apiKey;
    const usingDefaultBaseUrl =
      s.aiProvider === 'openai' &&
      s.aiBaseURL === LOCAL_AI_DEFAULTS.openai.baseURL &&
      s.aiModel === LOCAL_AI_DEFAULTS.openai.model;

    if (local && (!providerReady || providerChanged || missingApiKey || usingDefaultBaseUrl)) {
      if (modelOverride) local.model = modelOverride;
      return local;
    }

    return {
      provider: s.aiProvider,
      apiKey: s.aiApiKey,
      baseUrl: s.aiBaseURL,
      model: modelOverride || s.aiModel,
      webSearchMode: s.webSearchMode || 'off',
      tavilyApiKey: s.tavilyApiKey || '',
    };
  }

  try {
    const config = getAIConfigFromLocalCache();
    if (modelOverride) config.model = modelOverride;
    return config;
  } catch {
    // ignore local fallback failure
  }

  return { provider: 'openai', apiKey: '', baseUrl: 'https://api.openai.com/v1', model: modelOverride || 'gpt-4o' };
}

/* getAIConfigFromLocalCache already appends webSearchMode/tavilyApiKey. */

export function isAISelectionConfigured(selection?: AIConfigSelection) {
  const config = getAIConfigFromStore(selection);
  return Boolean(String(config.apiKey || '').trim());
}

export async function aiListModels(config?: any) {
  return invoke<any[]>('ai_list_models', { config: config || getAIConfigFromStore() });
}

export async function aiListModelsForSelection(selection?: AIConfigSelection) {
  return invoke<any[]>('ai_list_models', { config: getAIConfigFromStore(selection) });
}

export async function aiTestConnection(config?: any) {
  return invoke<any>('ai_test_connection', { config: config || getAIConfigFromStore() });
}

export async function aiGrammarCheck(data: { resumeId: string; language?: string }) {
  const config = getAIConfigFromStore();
  return withAIUsageLog('grammar_check', config, () =>
    invoke<any>('ai_grammar_check', {
      config,
      resumeId: data.resumeId,
      language: data.language,
    })
  );
}

export type CoverLetterStyle = 'boss_greeting' | 'email' | 'self_intro';

export async function aiCoverLetter(data: {
  resumeId: string;
  jobDescription?: string;
  style: CoverLetterStyle;
  language?: string;
}) {
  const config = getAIConfigFromStore();
  return withAIUsageLog('cover_letter', config, () =>
    invoke<string>('ai_cover_letter', {
      config,
      resumeId: data.resumeId,
      jobDescription: data.jobDescription,
      style: data.style,
      language: data.language,
    })
  );
}

export async function aiJdAnalysis(data: { resumeId: string; jobDescription: string }) {
  const config = getAIConfigFromStore();
  return withAIUsageLog('jd_analysis', config, () =>
    invoke<any>('ai_jd_analysis', {
      config,
      resumeId: data.resumeId,
      jobDescription: data.jobDescription,
    })
  );
}

export async function aiTranslate(data: { resumeId: string; targetLanguage: 'zh' | 'en' }) {
  const config = getAIConfigFromStore();
  return withAIUsageLog('translate', config, () =>
    invoke<any>('ai_translate', {
      config,
      resumeId: data.resumeId,
      targetLanguage: data.targetLanguage,
    })
  );
}

export async function aiGenerateResume(data: { description: string; language?: string }) {
  const userId = await getCachedUserId();
  const config = getAIConfigFromStore();
  return withAIUsageLog('generate_resume', config, () =>
    invoke<string>('ai_generate_resume', {
      config,
      userId,
      description: data.description,
      language: data.language,
    })
  );
}

export async function aiFetchGithubRepo(url: string) {
  return invoke<any>('ai_fetch_github_repo', { url });
}

export async function listGrammarChecks(resumeId: string) {
  return invoke<any[]>('list_grammar_checks', { resumeId });
}

export async function getGrammarCheck(id: string) {
  return invoke<any>('get_grammar_check', { id });
}

export async function deleteGrammarCheck(id: string) {
  return invoke<void>('delete_grammar_check', { id });
}

export async function listJdAnalyses(resumeId: string) {
  return invoke<any[]>('list_jd_analyses', { resumeId });
}

export async function getJdAnalysis(id: string) {
  return invoke<any>('get_jd_analysis', { id });
}

export async function deleteJdAnalysis(id: string) {
  return invoke<void>('delete_jd_analysis', { id });
}

// ── Chat ──

export async function listChatSessions(resumeId: string) {
  return invoke<any[]>('list_chat_sessions', { resumeId });
}

export async function getChatSession(sessionId: string) {
  return invoke<any>('get_chat_session', { sessionId });
}

export async function listChatMessages(sessionId: string, limit?: number, offset?: number) {
  return invoke<any>('list_chat_messages', { sessionId, limit, offset });
}

export async function createChatSession(resumeId: string, title?: string) {
  return invoke<string>('create_chat_session', { resumeId, title });
}

export async function cancelAiStream(streamId: string) {
  return invoke<void>('cancel_ai_stream', { streamId });
}

export async function truncateChatMessages(sessionId: string, messageId: string) {
  return invoke<void>('truncate_chat_messages', { sessionId, messageId });
}

export async function deleteChatSession(sessionId: string) {
  return invoke<void>('delete_chat_session', { sessionId });
}

export async function aiChat(data: {
  streamId: string;
  messages: { role: string; content: string }[];
  resumeId?: string;
  sessionId?: string;
  journalContext?: string;
  selectedProvider?: AIProviderId;
  selectedModel?: string;
}) {
  const config = getAIConfigFromStore({
    provider: data.selectedProvider,
    model: data.selectedModel,
  });
  return withAIUsageLog('project_chat', config, () =>
    invoke<any>('ai_chat', {
      streamId: data.streamId,
      config,
      messages: data.messages,
      resumeId: data.resumeId,
      sessionId: data.sessionId,
      journalContext: data.journalContext,
    })
  );
}

/** Sentinel resume id owning Global-Agent chat sessions. */
export const GLOBAL_AGENT_RESUME_ID = '__global__';

export async function globalAgentChat(data: {
  streamId: string;
  message: string;
  journalContext?: string;
  sessionId?: string;
  selectedProvider?: AIProviderId;
  selectedModel?: string;
}) {
  const userId = await getCachedUserId();
  const config = getAIConfigFromStore({
    provider: data.selectedProvider,
    model: data.selectedModel,
  });
  return withAIUsageLog('global_agent', config, () =>
    invoke<string>('global_agent_chat', {
      streamId: data.streamId,
      userId,
      config,
      message: data.message,
      journalContext: data.journalContext,
      sessionId: data.sessionId,
    })
  );
}

// ── Export ──

export async function exportPdf(resumeId: string, html: string, filename?: string) {
  return invoke<string | null>('export_pdf', {
    options: { resumeId, html, filename },
  });
}

export async function exportHtml(resumeId: string, html: string, filename?: string) {
  return invoke<string | null>('export_html', {
    options: { resumeId, html, filename },
  });
}

export async function exportTxt(resumeId: string, filename?: string) {
  return invoke<string | null>('export_txt', { resumeId, filename });
}

export async function exportJson(resumeId: string, filename?: string) {
  return invoke<string | null>('export_json', { resumeId, filename });
}

export async function exportDocx(resumeId: string, filename?: string) {
  return invoke<string | null>('export_docx', { resumeId, filename });
}

// ── Browser driver ──

export interface BrowserDriverInfo {
  port: number;
  tabs: { tabId: string; url: string; title: string }[];
}

export async function browserDriverInfo() {
  return invoke<BrowserDriverInfo>('browser_driver_info');
}

export async function browserDriverUserscript() {
  return invoke<string>('browser_driver_userscript');
}

// ── Resume parsing (PDF/image → Resume) ──

export async function parseResumeFile(data: {
  file: File;
  language?: string;
}): Promise<string> {
  const buffer = await data.file.arrayBuffer();
  const userId = await getCachedUserId();
  const config = getAIConfigFromStore();
  return withAIUsageLog('parse_resume', config, () =>
    invoke<string>('parse_resume_file', {
      config,
      userId,
      fileData: Array.from(new Uint8Array(buffer)),
      fileType: data.file.type,
      language: data.language,
    })
  );
}
