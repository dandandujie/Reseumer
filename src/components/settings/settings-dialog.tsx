'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import i18n from '@/i18n';
import {
  Settings,
  Cpu,
  Paintbrush,
  PenTool,
  Eye,
  EyeOff,
  ChevronsUpDown,
  Check,
  Loader2,
  RefreshCw,
  PlugZap,
  CheckCircle2,
  AlertCircle,
  Globe,
  Copy,
} from 'lucide-react';
import { toast } from 'sonner';
import * as tauriApi from '@/lib/tauri-api';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Slider } from '@/components/ui/slider';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { useUIStore } from '@/stores/ui-store';
import { useSettingsStore, type AIProvider, type WebSearchMode } from '@/stores/settings-store';
import { usePathname, useRouter } from '@/i18n/routing';
import { locales, localeNames } from '@/i18n/config';
import { cn } from '@/lib/utils';

const AI_PROVIDERS: { value: AIProvider; label: string }[] = [
  { value: 'openai', label: 'OpenAI' },
  { value: 'anthropic', label: 'Anthropic' },
  { value: 'gemini', label: 'Google Gemini' },
];

type ConnectionState = 'idle' | 'success' | 'warning' | 'error';

interface AiModelOption {
  id: string;
  label?: string | null;
}

interface AiConnectionTestResult {
  provider: string;
  currentModel: string;
  currentModelAvailable: boolean;
  modelCount: number;
  models: AiModelOption[];
}

export function SettingsDialog() {
  const t = useTranslations('settings');
  const tCommon = useTranslations('common');
  const locale = useLocale();
  const router = useRouter();
  const pathname = usePathname();
  const { activeModal, closeModal, settingsTab, setSettingsTab } = useUIStore();
  const {
    aiProvider,
    aiApiKey,
    aiBaseURL,
    aiModel,
    autoSave,
    autoSaveInterval,
    setAIProvider,
    setAIApiKey,
    setAIBaseURL,
    setAIModel,
    setAutoSave,
    setAutoSaveInterval,
    webSearchMode,
    tavilyApiKey,
    setWebSearchMode,
    setTavilyApiKey,
    hydrate,
    _hydrated,
  } = useSettingsStore();
  const [showTavilyKey, setShowTavilyKey] = useState(false);
  const [showApiKey, setShowApiKey] = useState(false);
  const isOpen = activeModal === 'settings';

  // Browser driver tab state
  const [driverInfo, setDriverInfo] = useState<tauriApi.BrowserDriverInfo | null>(null);
  const [driverLoading, setDriverLoading] = useState(false);

  const refreshDriverInfo = useCallback(async () => {
    setDriverLoading(true);
    try {
      setDriverInfo(await tauriApi.browserDriverInfo());
    } catch {
      setDriverInfo(null);
    } finally {
      setDriverLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isOpen && settingsTab === 'browser') {
      void refreshDriverInfo();
    }
  }, [isOpen, settingsTab, refreshDriverInfo]);

  const copyUserscript = useCallback(async () => {
    try {
      const script = await tauriApi.browserDriverUserscript();
      await navigator.clipboard.writeText(script);
      toast.success(t('browser.copied'));
    } catch {
      toast.error(t('browser.copyFailed'));
    }
  }, [t]);

  // Model combobox state
  const [modelOpen, setModelOpen] = useState(false);
  const [modelSearch, setModelSearch] = useState('');
  const [fetchedModels, setFetchedModels] = useState<string[]>([]);
  const [modelsFetching, setModelsFetching] = useState(false);
  const [modelsFetched, setModelsFetched] = useState(false);
  const [connectionState, setConnectionState] = useState<ConnectionState>('idle');
  const [connectionMessage, setConnectionMessage] = useState('');
  const [isTestingConnection, setIsTestingConnection] = useState(false);
  const modelSearchRef = useRef<HTMLInputElement>(null);
  const canQueryAI = Boolean(aiApiKey.trim() && aiBaseURL.trim());
  const queriedModelSignatureRef = useRef('');

  useEffect(() => {
    if (isOpen && !_hydrated) {
      hydrate();
    }
  }, [isOpen, _hydrated, hydrate]);

  const buildAIConfig = useCallback(() => ({
    provider: aiProvider,
    apiKey: aiApiKey.trim(),
    baseUrl: aiBaseURL.trim(),
    model: aiModel.trim(),
  }), [aiProvider, aiApiKey, aiBaseURL, aiModel]);

  const modelQuerySignature = useMemo(() => {
    if (!canQueryAI) return '';
    return [aiProvider, aiBaseURL.trim(), aiApiKey.trim()].join('::');
  }, [aiProvider, aiApiKey, aiBaseURL, canQueryAI]);

  const applyFetchedModels = useCallback((models: AiModelOption[]) => {
    const ids = Array.from(new Set((models || []).map((model) => model.id).filter(Boolean)));
    setFetchedModels(ids);
    setModelsFetched(true);
  }, []);

  const fetchModels = useCallback(async ({ silent = false }: { silent?: boolean } = {}) => {
    if (!canQueryAI) {
      setFetchedModels([]);
      setModelsFetched(false);
      if (!silent) {
        setConnectionState('error');
        setConnectionMessage(t('ai.apiKeyRequired'));
      }
      return [];
    }

    queriedModelSignatureRef.current = modelQuerySignature;
    setModelsFetching(true);
    try {
      const { aiListModels } = await import('@/lib/tauri-api');
      const models: AiModelOption[] = await aiListModels(buildAIConfig());
      applyFetchedModels(models);
      if (!silent) {
        setConnectionState('success');
        setConnectionMessage(t('ai.modelsUpdated', { count: models.length }));
      }
      return models;
    } catch (error: any) {
      setFetchedModels([]);
      setModelsFetched(true);
      if (!silent) {
        setConnectionState('error');
        setConnectionMessage(error?.message || t('ai.connectionFailedGeneric'));
      }
      return [];
    } finally {
      setModelsFetching(false);
    }
  }, [applyFetchedModels, buildAIConfig, canQueryAI, modelQuerySignature, t]);

  const fetchModelsRef = useRef(fetchModels);

  useEffect(() => {
    fetchModelsRef.current = fetchModels;
  }, [fetchModels]);

  const handleTestConnection = useCallback(async () => {
    if (!canQueryAI) {
      setConnectionState('error');
      setConnectionMessage(t('ai.apiKeyRequired'));
      return;
    }

    setIsTestingConnection(true);
    try {
      const { aiTestConnection } = await import('@/lib/tauri-api');
      const result: AiConnectionTestResult = await aiTestConnection(buildAIConfig());
      applyFetchedModels(result.models || []);

      if (result.currentModel && !result.currentModelAvailable) {
        setConnectionState('warning');
        setConnectionMessage(t('ai.connectionSuccessModelMissing', { count: result.modelCount }));
      } else {
        setConnectionState('success');
        setConnectionMessage(t('ai.connectionSuccess', { count: result.modelCount }));
      }
    } catch (error: any) {
      setConnectionState('error');
      setConnectionMessage(error?.message || t('ai.connectionFailedGeneric'));
    } finally {
      setIsTestingConnection(false);
    }
  }, [applyFetchedModels, buildAIConfig, canQueryAI, t]);

  useEffect(() => {
    queriedModelSignatureRef.current = '';
    setModelsFetched(false);
    setFetchedModels([]);
    setConnectionState('idle');
    setConnectionMessage('');
  }, [aiProvider, aiApiKey, aiBaseURL]);

  useEffect(() => {
    setConnectionState('idle');
    setConnectionMessage('');
  }, [aiModel]);

  useEffect(() => {
    if (!isOpen || settingsTab !== 'ai') return;
    if (!canQueryAI) return;
    if (queriedModelSignatureRef.current === modelQuerySignature) return;

    const timeout = window.setTimeout(() => {
      void fetchModelsRef.current({ silent: true });
    }, 500);

    return () => window.clearTimeout(timeout);
  }, [isOpen, settingsTab, canQueryAI, modelQuerySignature]);

  useEffect(() => {
    if (modelOpen && canQueryAI && !modelsFetched && !modelsFetching) {
      void fetchModelsRef.current({ silent: true });
    }
  }, [modelOpen, canQueryAI, modelsFetched, modelsFetching]);

  // Focus search input when popover opens
  useEffect(() => {
    if (modelOpen) {
      setTimeout(() => modelSearchRef.current?.focus(), 50);
    } else {
      setModelSearch('');
    }
  }, [modelOpen]);

  const availableModels = useMemo(() => {
    const merged = aiModel ? [aiModel, ...fetchedModels] : fetchedModels;
    return Array.from(new Set(merged.filter(Boolean)));
  }, [aiModel, fetchedModels]);

  const filteredModels = availableModels.filter((m) =>
    m.toLowerCase().includes(modelSearch.toLowerCase())
  );

  const handleLocaleChange = (newLocale: string) => {
    i18n.changeLanguage(newLocale);
    const parts = pathname.split('/');
    const supported = ['zh', 'en'];
    if (parts.length > 1 && supported.includes(parts[1])) {
      parts[1] = newLocale;
      router.replace(parts.join('/'));
    } else {
      router.replace(`/${newLocale}${pathname}`);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && closeModal()}>
      <DialogContent className="sm:max-w-[540px] p-0 gap-0">
        <DialogHeader className="px-6 pt-6 pb-0">
          <DialogTitle className="flex items-center gap-2">
            <Settings className="h-5 w-5 text-muted-foreground" />
            {t('title')}
          </DialogTitle>
        </DialogHeader>

        <Tabs value={settingsTab} onValueChange={setSettingsTab} className="mt-4">
          <div className="px-6">
            <TabsList className="w-full">
              <TabsTrigger value="ai" className="flex-1 gap-1.5 cursor-pointer">
                <Cpu className="h-3.5 w-3.5" />
                {t('ai.title')}
              </TabsTrigger>
              <TabsTrigger value="appearance" className="flex-1 gap-1.5 cursor-pointer">
                <Paintbrush className="h-3.5 w-3.5" />
                {t('appearance.title')}
              </TabsTrigger>
              <TabsTrigger value="editor" className="flex-1 gap-1.5 cursor-pointer">
                <PenTool className="h-3.5 w-3.5" />
                {t('editorTab.title')}
              </TabsTrigger>
              <TabsTrigger value="browser" className="flex-1 gap-1.5 cursor-pointer">
                <Globe className="h-3.5 w-3.5" />
                {t('browser.title')}
              </TabsTrigger>
            </TabsList>
          </div>

          {/* AI Configuration Tab */}
          <TabsContent value="ai" className="px-6 pb-6 pt-4 space-y-5">
            {/* Provider */}
            <div className="space-y-2">
              <Label>{t('ai.provider')}</Label>
              <Select value={aiProvider} onValueChange={(v) => setAIProvider(v as AIProvider)}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {AI_PROVIDERS.map((p) => (
                    <SelectItem key={p.value} value={p.value}>
                      {p.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* API Key */}
            <div className="space-y-2">
              <Label>{t('ai.apiKey')}</Label>
              <div className="relative">
                <Input
                  type={showApiKey ? 'text' : 'password'}
                  value={aiApiKey}
                  onChange={(e) => setAIApiKey(e.target.value)}
                  placeholder={t('ai.apiKeyPlaceholder')}
                  className="pr-10"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-xs"
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground cursor-pointer"
                  onClick={() => setShowApiKey(!showApiKey)}
                >
                  {showApiKey ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">{t('ai.apiKeyHint')}</p>
            </div>

            {/* Base URL */}
            <div className="space-y-2">
              <Label>{t('ai.baseURL')}</Label>
              <Input
                value={aiBaseURL}
                onChange={(e) => setAIBaseURL(e.target.value)}
                placeholder="https://api.openai.com/v1"
              />
            </div>

            {/* Model — Combobox */}
            <div className="space-y-2">
              <Label>{t('ai.model')}</Label>
              <Popover open={modelOpen} onOpenChange={setModelOpen} modal={false}>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    role="combobox"
                    aria-expanded={modelOpen}
                    className="w-full justify-between cursor-pointer font-normal"
                  >
                    <span className="truncate">{aiModel || t('ai.modelPlaceholder')}</span>
                    <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
                  {/* Search input */}
                  <div className="border-b px-3 py-2">
                    <Input
                      ref={modelSearchRef}
                      value={modelSearch}
                      onChange={(e) => setModelSearch(e.target.value)}
                      placeholder={tCommon('search')}
                      className="h-8 border-0 p-0 shadow-none focus-visible:ring-0"
                    />
                  </div>

                  {/* Model list */}
                  <div className="max-h-48 overflow-y-auto p-1" onWheel={(e) => e.stopPropagation()}>
                    {modelsFetching && (
                      <div className="flex items-center justify-center py-4 text-sm text-muted-foreground">
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        {tCommon('loading')}
                      </div>
                    )}

                    {!modelsFetching && filteredModels.length === 0 && modelsFetched && (
                      <div className="py-3 text-center text-xs text-muted-foreground">
                        {t('ai.noModelsFound')}
                      </div>
                    )}

                    {filteredModels.map((m) => (
                      <button
                        key={m}
                        type="button"
                        className={cn(
                          'flex w-full cursor-pointer items-center rounded-sm px-2 py-1.5 text-sm hover:bg-muted',
                          aiModel === m && 'bg-muted'
                        )}
                        onClick={() => {
                          setAIModel(m);
                          setModelOpen(false);
                        }}
                      >
                        <Check className={cn('mr-2 h-4 w-4', aiModel === m ? 'opacity-100' : 'opacity-0')} />
                        <span className="truncate">{m}</span>
                      </button>
                    ))}
                  </div>

                  {/* Manual entry */}
                  <div className="border-t px-3 py-2">
                    <Input
                      value={aiModel}
                      onChange={(e) => setAIModel(e.target.value)}
                      placeholder={t('ai.modelPlaceholder')}
                      className="h-8 text-sm"
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') setModelOpen(false);
                      }}
                    />
                  </div>
                </PopoverContent>
              </Popover>
            </div>

            <div className="space-y-3 rounded-lg border border-border bg-muted/60 p-3">
              <p className="text-xs text-muted-foreground">
                {t('ai.connectionHint')}
              </p>

              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => void fetchModels()}
                  disabled={!canQueryAI || modelsFetching || isTestingConnection}
                  className="cursor-pointer"
                >
                  {modelsFetching ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <RefreshCw className="h-3.5 w-3.5" />
                  )}
                  <span>{modelsFetching ? t('ai.fetchingModels') : t('ai.fetchModels')}</span>
                </Button>

                <Button
                  type="button"
                  size="sm"
                  onClick={() => void handleTestConnection()}
                  disabled={!canQueryAI || isTestingConnection || modelsFetching}
                  className="cursor-pointer bg-brand hover:bg-brand-hover"
                >
                  {isTestingConnection ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <PlugZap className="h-3.5 w-3.5" />
                  )}
                  <span>{isTestingConnection ? t('ai.testingConnection') : t('ai.testConnection')}</span>
                </Button>
              </div>

              {connectionState === 'idle' ? null : (
                <div
                  className={cn(
                    'flex items-start gap-2 rounded-md px-3 py-2 text-xs',
                    connectionState === 'success' && 'bg-emerald-50 text-emerald-700',
                    connectionState === 'warning' && 'bg-amber-50 text-amber-700',
                    connectionState === 'error' && 'bg-red-50 text-red-700'
                  )}
                >
                  {connectionState === 'success' ? (
                    <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  ) : (
                    <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  )}
                  <span className="leading-relaxed break-all">{connectionMessage}</span>
                </div>
              )}
            </div>
            {/* Web search */}
            <div className="space-y-3 rounded-lg border border-border bg-muted/60 p-3">
              <div className="flex items-center justify-between">
                <Label className="text-[13px]">{t('webSearch.title')}</Label>
                <Select value={webSearchMode} onValueChange={(v) => setWebSearchMode(v as WebSearchMode)}>
                  <SelectTrigger size="sm" className="h-8 w-44 cursor-pointer">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="off" className="cursor-pointer text-xs">{t('webSearch.off')}</SelectItem>
                    <SelectItem value="native" className="cursor-pointer text-xs">{t('webSearch.native')}</SelectItem>
                    <SelectItem value="free" className="cursor-pointer text-xs">{t('webSearch.free')}</SelectItem>
                    <SelectItem value="tavily" className="cursor-pointer text-xs">{t('webSearch.tavily')}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <p className="text-xs text-muted-foreground">
                {webSearchMode === 'native'
                  ? t('webSearch.nativeHint')
                  : webSearchMode === 'free'
                    ? t('webSearch.freeHint')
                    : webSearchMode === 'tavily'
                      ? t('webSearch.tavilyHint')
                      : t('webSearch.offHint')}
              </p>
              {webSearchMode === 'tavily' && (
                <div className="relative">
                  <Input
                    type={showTavilyKey ? 'text' : 'password'}
                    value={tavilyApiKey}
                    onChange={(e) => setTavilyApiKey(e.target.value)}
                    placeholder="tvly-..."
                    className="pr-10"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-xs"
                    className="absolute right-2 top-1/2 -translate-y-1/2 cursor-pointer text-muted-foreground hover:text-foreground"
                    onClick={() => setShowTavilyKey(!showTavilyKey)}
                  >
                    {showTavilyKey ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                  </Button>
                </div>
              )}
            </div>
          </TabsContent>

          {/* Appearance Tab */}
          <TabsContent value="appearance" className="px-6 pb-6 pt-4 space-y-5">
            {/* Language */}
            <div className="space-y-2">
              <Label>{t('appearance.language')}</Label>
              <Select value={locale} onValueChange={handleLocaleChange}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {locales.map((loc) => (
                    <SelectItem key={loc} value={loc}>
                      {localeNames[loc]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </TabsContent>

          {/* Editor Tab */}
          <TabsContent value="editor" className="px-6 pb-6 pt-4 space-y-5">
            {/* Auto Save */}
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label>{t('editorTab.autoSave')}</Label>
                <p className="text-xs text-muted-foreground">{t('editorTab.autoSaveDescription')}</p>
              </div>
              <Switch
                checked={autoSave}
                onCheckedChange={setAutoSave}
              />
            </div>

            <Separator />

            {/* Auto Save Interval */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label>{t('editorTab.autoSaveInterval')}</Label>
                <span className="text-sm text-muted-foreground">
                  {(autoSaveInterval / 1000).toFixed(1)}s
                </span>
              </div>
              <Slider
                value={[autoSaveInterval]}
                onValueChange={([v]) => setAutoSaveInterval(v)}
                min={300}
                max={5000}
                step={100}
                disabled={!autoSave}
              />
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>0.3s</span>
                <span>5.0s</span>
              </div>
            </div>
          </TabsContent>

          {/* Browser Driver Tab */}
          <TabsContent value="browser" className="px-6 pb-6 pt-4 space-y-4">
            <p className="text-xs leading-relaxed text-muted-foreground">
              {t('browser.description')}
            </p>

            {/* Connection status */}
            <div className="space-y-2 rounded-lg border border-border bg-muted/60 p-3">
              <div className="flex items-center justify-between">
                <Label className="text-[13px]">{t('browser.status')}</Label>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => void refreshDriverInfo()}
                  disabled={driverLoading}
                  className="h-7 cursor-pointer gap-1.5 text-xs"
                >
                  {driverLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
                  {t('browser.refresh')}
                </Button>
              </div>
              {driverInfo ? (
                <>
                  <p className="text-xs text-muted-foreground">
                    {t('browser.listening', { port: driverInfo.port })}
                  </p>
                  {driverInfo.tabs.length > 0 ? (
                    <ul className="space-y-1">
                      {driverInfo.tabs.map((tab) => (
                        <li key={tab.tabId} className="flex items-center gap-2 rounded-md bg-card px-2.5 py-1.5 text-xs">
                          <span className="inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--whale-mint-deep)]" />
                          <span className="truncate font-medium text-foreground">{tab.title || tab.url}</span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-xs text-muted-foreground">{t('browser.noTabs')}</p>
                  )}
                </>
              ) : (
                <p className="text-xs text-muted-foreground">{t('browser.notLoaded')}</p>
              )}
            </div>

            {/* Install guide */}
            <div className="space-y-2">
              <Label className="text-[13px]">{t('browser.installTitle')}</Label>
              <ol className="list-decimal space-y-1 pl-5 text-xs leading-relaxed text-[var(--whale-ink-soft)]">
                <li>{t('browser.step1')}</li>
                <li>{t('browser.step2')}</li>
                <li>{t('browser.step3')}</li>
              </ol>
              <Button
                type="button"
                size="sm"
                onClick={() => void copyUserscript()}
                className="cursor-pointer gap-1.5 bg-brand hover:bg-brand-hover"
              >
                <Copy className="h-3.5 w-3.5" />
                {t('browser.copyScript')}
              </Button>
            </div>

            <p className="text-[11px] leading-relaxed text-muted-foreground">
              {t('browser.privacyNote')}
            </p>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
