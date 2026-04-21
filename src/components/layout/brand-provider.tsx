'use client';

import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';

export type Brand = 'mint' | 'blue' | 'pink';

const STORAGE_KEY = 'reseumer-brand';
const LEGACY_STORAGE_KEYS = ['jadeai-brand'];
const VALID_BRANDS: Brand[] = ['mint', 'blue', 'pink'];

// Migrate legacy values (pre-rename) to current ids.
function normalizeBrand(raw: string | null): Brand | null {
  if (raw === 'boss') return 'mint';
  if (raw === 'jade') return 'blue';
  if (raw && (VALID_BRANDS as string[]).includes(raw)) return raw as Brand;
  return null;
}

interface BrandContextValue {
  brand: Brand;
  setBrand: (brand: Brand) => void;
}

const BrandContext = createContext<BrandContextValue | null>(null);

function applyBrand(brand: Brand) {
  if (typeof document === 'undefined') return;
  if (brand === 'mint') {
    document.documentElement.removeAttribute('data-brand');
  } else {
    document.documentElement.setAttribute('data-brand', brand);
  }
}

function getStoredBrand() {
  if (typeof window === 'undefined') return null;
  return (
    localStorage.getItem(STORAGE_KEY) ??
    LEGACY_STORAGE_KEYS.map((key) => localStorage.getItem(key)).find(Boolean) ??
    null
  );
}

export function BrandProvider({ children }: { children: ReactNode }) {
  const [brand, setBrandState] = useState<Brand>('mint');

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const normalized = normalizeBrand(getStoredBrand());
    if (normalized) {
      // Persist migration so legacy keys and values are rewritten to canonical ids.
      localStorage.setItem(STORAGE_KEY, normalized);
      for (const key of LEGACY_STORAGE_KEYS) {
        localStorage.removeItem(key);
      }
      // eslint-disable-next-line react-hooks/set-state-in-effect -- canonical SSR hydration from localStorage
      setBrandState(normalized);
      applyBrand(normalized);
    }
  }, []);

  const setBrand = (next: Brand) => {
    setBrandState(next);
    if (typeof window !== 'undefined') {
      localStorage.setItem(STORAGE_KEY, next);
    }
    applyBrand(next);
  };

  return <BrandContext.Provider value={{ brand, setBrand }}>{children}</BrandContext.Provider>;
}

export function useBrand() {
  const ctx = useContext(BrandContext);
  if (!ctx) throw new Error('useBrand must be used within BrandProvider');
  return ctx;
}
