/**
 * Compatibility layer for next-intl.
 * All 55+ files importing { useTranslations } from 'next-intl'
 * are automatically redirected here via Vite alias.
 */
import { useTranslation } from 'react-i18next';
import i18n from './index';

export function useTranslations(namespace?: string) {
  const { t } = useTranslation();
  if (namespace) {
    return (key: string, params?: Record<string, unknown>) =>
      t(`${namespace}.${key}`, params as any) as string;
  }
  return (key: string, params?: Record<string, unknown>) =>
    t(key, params as any) as string;
}

export function useLocale(): string {
  return i18n.language?.split('-')[0] || 'zh';
}

export function useMessages() {
  return i18n.getResourceBundle(i18n.language, 'translation') || {};
}

export function useNow() {
  return new Date();
}

export function useTimeZone() {
  return Intl.DateTimeFormat().resolvedOptions().timeZone;
}

// NextIntlClientProvider is a no-op in the Vite build
// (i18next is initialized globally in src/i18n/index.ts)
export function NextIntlClientProvider({ children }: { children: React.ReactNode }) {
  return children;
}
