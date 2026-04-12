import { generateId } from '@/lib/utils';

const FINGERPRINT_STORAGE_KEY = 'jade_fingerprint';

export function getStoredClientFingerprint() {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(FINGERPRINT_STORAGE_KEY);
}

export function getOrCreateClientFingerprint() {
  if (typeof window === 'undefined') return null;

  const stored = localStorage.getItem(FINGERPRINT_STORAGE_KEY);
  if (stored) {
    return stored;
  }

  const fallbackId = generateId();
  localStorage.setItem(FINGERPRINT_STORAGE_KEY, fallbackId);
  return fallbackId;
}

export function setClientFingerprint(fingerprint: string) {
  if (typeof window === 'undefined') return;
  localStorage.setItem(FINGERPRINT_STORAGE_KEY, fingerprint);
}

export function getClientFingerprintHeaders(base: Record<string, string> = {}) {
  const fingerprint = getOrCreateClientFingerprint();
  return fingerprint ? { ...base, 'x-fingerprint': fingerprint } : base;
}
