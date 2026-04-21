/**
 * Compatibility layer for next-auth/react.
 * Desktop app doesn't use OAuth — always returns a mock session.
 */
import React, { createContext, useContext } from 'react';

interface Session {
  user?: {
    name?: string;
    email?: string;
    image?: string;
  };
  expires: string;
}

const SessionContext = createContext<{
  data: Session | null;
  status: 'loading' | 'authenticated' | 'unauthenticated';
}>({
  data: null,
  status: 'unauthenticated',
});

export function SessionProvider({ children }: { children: React.ReactNode }) {
  return React.createElement(
    SessionContext.Provider,
    { value: { data: null, status: 'unauthenticated' } },
    children,
  );
}

export function useSession() {
  return useContext(SessionContext);
}

export async function signIn(_provider?: string, _options?: any) {
  // No-op in desktop mode
  console.warn('signIn called in desktop mode — not supported');
}

export async function signOut(_options?: any) {
  // No-op in desktop mode
  console.warn('signOut called in desktop mode — not supported');
}
