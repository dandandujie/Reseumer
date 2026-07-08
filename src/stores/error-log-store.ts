import { create } from 'zustand';

export interface ErrorLogEntry {
  id: string;
  title: string;
  detail?: string;
  time: number;
}

interface ErrorLogStore {
  errors: ErrorLogEntry[];
  logError: (title: string, detail?: string) => void;
  dismiss: (id: string) => void;
  clear: () => void;
}

export const useErrorLogStore = create<ErrorLogStore>((set) => ({
  errors: [],
  logError: (title, detail) =>
    set((s) => ({
      errors: [
        {
          id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          title,
          detail: detail?.trim() || undefined,
          time: Date.now(),
        },
        ...s.errors,
      ].slice(0, 50),
    })),
  dismiss: (id) => set((s) => ({ errors: s.errors.filter((e) => e.id !== id) })),
  clear: () => set({ errors: [] }),
}));

/** Log an error from anywhere (including non-React code). */
export function logError(title: string, detail?: string) {
  useErrorLogStore.getState().logError(title, detail);
}
