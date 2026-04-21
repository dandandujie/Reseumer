'use client';

import { useEffect, useState } from 'react';
import { useRuntimeConfig } from '@/components/providers/runtime-config-provider';
import { getOrCreateClientFingerprint } from '@/lib/client-fingerprint';

export function useFingerprint() {
  const [fingerprint, setFingerprint] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const { authEnabled } = useRuntimeConfig();

  useEffect(() => {
    if (authEnabled) {
      setFingerprint(null);
      setIsLoading(false);
      return;
    }

    setFingerprint(getOrCreateClientFingerprint());
    setIsLoading(false);
  }, [authEnabled]);

  return { fingerprint, isLoading };
}
