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
const LOCAL_AI_DEFAULTS = {
  openai: { baseURL: 'https://api.openai.com/v1', model: 'gpt-4o' },
  anthropic: { baseURL: 'https://api.anthropic.com', model: 'claude-sonnet-4-20250514' },
  gemini: { baseURL: 'https://generativelanguage.googleapis.com/v1beta', model: 'gemini-2.0-flash' },
} as const;

function normalizeAIProvider(value: unknown): keyof typeof LOCAL_AI_DEFAULTS {
  return value === 'anthropic' || value === 'gemini' ? value : 'openai';
}

function getAIConfigFromLocalCache() {
  const provider = normalizeAIProvider(localStorage.getItem(LOCAL_AI_PROVIDER_KEY));
  const defaults = LOCAL_AI_DEFAULTS[provider];
  const configs = JSON.parse(localStorage.getItem(LOCAL_AI_PROVIDER_CONFIGS) || '{}');
  const cached = configs?.[provider] || {};

  return {
    provider,
    apiKey: cached.apiKey || localStorage.getItem(LOCAL_AI_API_KEY) || '',
    baseUrl: cached.baseURL || defaults.baseURL,
    model: cached.model || defaults.model,
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

export function resetUserCache() {
  _cachedUserId = null;
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
  }));

  return invoke<void>('update_resume', { payload });
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

export async function getUser() {
  const userId = await getCachedUserId();
  return invoke<any>('get_user', { userId });
}

export async function updateUser(data: { name?: string; avatarUrl?: string }) {
  const userId = await getCachedUserId();
  return invoke<void>('update_user', {
    userId,
    name: data.name,
    avatarUrl: data.avatarUrl,
  });
}

export async function getSettings() {
  const userId = await getCachedUserId();
  return invoke<any>('get_settings', { userId });
}

export async function updateSettings(settings: Record<string, any>) {
  const userId = await getCachedUserId();
  return invoke<void>('update_settings', { userId, settings });
}

// ── AI Config ──

function getAIConfigFromStore() {
  if (typeof window === 'undefined') return { provider: 'openai', apiKey: '', baseUrl: 'https://api.openai.com/v1', model: 'gpt-4o' };
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
      return local;
    }

    return { provider: s.aiProvider, apiKey: s.aiApiKey, baseUrl: s.aiBaseURL, model: s.aiModel };
  }

  try {
    return getAIConfigFromLocalCache();
  } catch {
    // ignore local fallback failure
  }

  return { provider: 'openai', apiKey: '', baseUrl: 'https://api.openai.com/v1', model: 'gpt-4o' };
}

export async function aiListModels(config?: any) {
  return invoke<any[]>('ai_list_models', { config: config || getAIConfigFromStore() });
}

export async function aiTestConnection(config?: any) {
  return invoke<any>('ai_test_connection', { config: config || getAIConfigFromStore() });
}

export async function aiCoverLetter(data: {
  resumeId: string;
  jobDescription: string;
  tone?: string;
  language?: string;
}) {
  return invoke<any>('ai_cover_letter', {
    config: getAIConfigFromStore(),
    resumeId: data.resumeId,
    jobDescription: data.jobDescription,
    tone: data.tone,
    language: data.language,
  });
}

export async function aiGrammarCheck(data: { resumeId: string; language?: string }) {
  return invoke<any>('ai_grammar_check', {
    config: getAIConfigFromStore(),
    resumeId: data.resumeId,
    language: data.language,
  });
}

export async function aiJdAnalysis(data: { resumeId: string; jobDescription: string }) {
  return invoke<any>('ai_jd_analysis', {
    config: getAIConfigFromStore(),
    resumeId: data.resumeId,
    jobDescription: data.jobDescription,
  });
}

export async function aiTranslate(data: { resumeId: string; targetLanguage: 'zh' | 'en' }) {
  return invoke<any>('ai_translate', {
    config: getAIConfigFromStore(),
    resumeId: data.resumeId,
    targetLanguage: data.targetLanguage,
  });
}

export async function aiGenerateResume(data: { description: string; language?: string }) {
  const userId = await getCachedUserId();
  return invoke<string>('ai_generate_resume', {
    config: getAIConfigFromStore(),
    userId,
    description: data.description,
    language: data.language,
  });
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

export async function deleteChatSession(sessionId: string) {
  return invoke<void>('delete_chat_session', { sessionId });
}

export async function aiChat(data: {
  streamId: string;
  messages: { role: string; content: string }[];
  resumeId?: string;
  sessionId?: string;
}) {
  return invoke<any>('ai_chat', {
    streamId: data.streamId,
    config: getAIConfigFromStore(),
    messages: data.messages,
    resumeId: data.resumeId,
    sessionId: data.sessionId,
  });
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

export async function generateQrCode(content: string) {
  return invoke<string>('generate_qrcode', { content });
}

// ── Resume parsing (PDF/image → Resume) ──

export async function parseResumeFile(data: {
  file: File;
  language?: string;
}): Promise<string> {
  const buffer = await data.file.arrayBuffer();
  const userId = await getCachedUserId();
  return invoke<string>('parse_resume_file', {
    config: getAIConfigFromStore(),
    userId,
    fileData: Array.from(new Uint8Array(buffer)),
    fileType: data.file.type,
    language: data.language,
  });
}
