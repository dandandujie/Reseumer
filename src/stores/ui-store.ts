import { create } from 'zustand';

type ModalType = 'create-resume' | 'delete-resume' | 'export-pdf' | 'settings' | 'jd-analysis' | 'translate' | 'export' | 'import' | 'generate-resume' | 'grammar-check' | 'journal' | null;

interface UIStore {
  sidebarOpen: boolean;
  activeModal: ModalType;
  theme: 'light' | 'dark' | 'system';
  settingsTab: string;
  pendingAiMessage: string | null;

  toggleSidebar: () => void;
  setSidebarOpen: (open: boolean) => void;
  openModal: (modal: ModalType) => void;
  closeModal: () => void;
  setTheme: (theme: 'light' | 'dark' | 'system') => void;
  setSettingsTab: (tab: string) => void;
  setPendingAiMessage: (message: string | null) => void;
}

export const useUIStore = create<UIStore>((set) => ({
  sidebarOpen: true,
  activeModal: null,
  theme: 'light',
  settingsTab: 'ai',
  pendingAiMessage: null,

  toggleSidebar: () => set((s) => ({ sidebarOpen: !s.sidebarOpen })),
  setSidebarOpen: (open) => set({ sidebarOpen: open }),
  openModal: (modal) => set({ activeModal: modal }),
  closeModal: () => set({ activeModal: null }),
  setTheme: (theme) => set({ theme }),
  setSettingsTab: (tab) => set({ settingsTab: tab }),
  setPendingAiMessage: (message) => set({ pendingAiMessage: message }),
}));
