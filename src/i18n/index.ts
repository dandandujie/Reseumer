import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';

import zhMessages from '../../messages/zh.json';
import enMessages from '../../messages/en.json';

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: {
      zh: { translation: zhMessages },
      en: { translation: enMessages },
    },
    fallbackLng: 'zh',
    supportedLngs: ['zh', 'en'],
    interpolation: {
      escapeValue: false,
    },
    detection: {
      order: ['path', 'localStorage', 'navigator'],
      lookupFromPathIndex: 0,
      caches: ['localStorage'],
    },
  });

export default i18n;

// Compatibility wrapper: matches next-intl's useTranslations API
// so existing components need only change their import path.
export function useTranslations(namespace?: string) {
  if (namespace) {
    return (key: string, params?: Record<string, unknown>) =>
      i18n.t(`${namespace}.${key}`, params as any) as string;
  }
  return (key: string, params?: Record<string, unknown>) =>
    i18n.t(key, params as any) as string;
}

export function useLocale(): string {
  return i18n.language?.split('-')[0] || 'zh';
}
