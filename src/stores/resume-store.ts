import { create } from 'zustand';
import * as api from '@/lib/tauri-api';
import type { Resume, ResumeSection, SectionContent, ThemeConfig } from '@/types/resume';
import { AUTOSAVE_DELAY } from '@/lib/constants';
import { generateId } from '@/lib/utils';
import { useSettingsStore } from '@/stores/settings-store';

interface ResumeStore {
  currentResume: Resume | null;
  sections: ResumeSection[];
  isDirty: boolean;
  isSaving: boolean;
  _saveTimeout: ReturnType<typeof setTimeout> | null;

  setResume: (resume: Resume) => void;
  updateSection: (sectionId: string, content: Partial<SectionContent>) => void;
  updateSectionTitle: (sectionId: string, title: string) => void;
  updateThemeConfig: (config: Partial<ThemeConfig>) => void;
  addSection: (section: ResumeSection) => void;
  removeSection: (sectionId: string) => void;
  reorderSections: (sections: ResumeSection[]) => void;
  toggleSectionVisibility: (sectionId: string) => void;
  setTitle: (title: string) => void;
  save: () => Promise<void>;
  flushPendingSave: () => Promise<void>;
  _scheduleSave: () => void;
  reset: () => void;
}

export const useResumeStore = create<ResumeStore>((set, get) => ({
  currentResume: null,
  sections: [],
  isDirty: false,
  isSaving: false,
  _saveTimeout: null,

  setResume: (resume) => {
    // Cancel any pending autosave to prevent stale data overwriting server changes (e.g., from AI tool calls)
    const { _saveTimeout } = get();
    if (_saveTimeout) clearTimeout(_saveTimeout);

    // Normalize: ensure all items/categories in section content have id fields
    const sections = (resume.sections || []).map((s) => {
      const content = s.content as unknown as Record<string, unknown>;
      if (Array.isArray(content?.items)) {
        content.items = (content.items as any[]).map((item) =>
          typeof item === 'object' && item !== null && !item.id
            ? { ...item, id: generateId() }
            : item
        );
      }
      if (Array.isArray(content?.categories)) {
        content.categories = (content.categories as any[]).map((cat) =>
          typeof cat === 'object' && cat !== null && !cat.id
            ? { ...cat, id: generateId() }
            : cat
        );
      }
      return { ...s, content: content as unknown as typeof s.content };
    });

    set({
      currentResume: { ...resume, sections },
      sections,
      isDirty: false,
      _saveTimeout: null,
    });
  },

  updateSection: (sectionId, content) => {
    set((state) => {
      const sections = state.sections.map((s) =>
        s.id === sectionId ? { ...s, content: { ...s.content, ...content } as SectionContent } : s
      );
      return {
        sections,
        currentResume: state.currentResume ? { ...state.currentResume, sections } : null,
        isDirty: true,
      };
    });
    get()._scheduleSave();
  },

  updateSectionTitle: (sectionId, title) => {
    set((state) => {
      const sections = state.sections.map((s) =>
        s.id === sectionId ? { ...s, title } : s
      );
      return {
        sections,
        currentResume: state.currentResume ? { ...state.currentResume, sections } : null,
        isDirty: true,
      };
    });
    get()._scheduleSave();
  },

  updateThemeConfig: (config) => {
    set((state) => {
      if (!state.currentResume) return state;
      return {
        currentResume: {
          ...state.currentResume,
          themeConfig: {
            ...state.currentResume.themeConfig,
            ...config,
          },
        },
        isDirty: true,
      };
    });
    get()._scheduleSave();
  },

  addSection: (section) => {
    set((state) => {
      const sections = [...state.sections, section];
      return {
        sections,
        currentResume: state.currentResume ? { ...state.currentResume, sections } : null,
        isDirty: true,
      };
    });
    get()._scheduleSave();
  },

  removeSection: (sectionId) => {
    set((state) => {
      const sections = state.sections.filter((s) => s.id !== sectionId);
      return {
        sections,
        currentResume: state.currentResume ? { ...state.currentResume, sections } : null,
        isDirty: true,
      };
    });
    get()._scheduleSave();
  },

  reorderSections: (sections) => {
    set((state) => ({
      sections,
      currentResume: state.currentResume ? { ...state.currentResume, sections } : null,
      isDirty: true,
    }));
    get()._scheduleSave();
  },

  toggleSectionVisibility: (sectionId) => {
    set((state) => {
      const sections = state.sections.map((s) =>
        s.id === sectionId ? { ...s, visible: !s.visible } : s
      );
      return {
        sections,
        currentResume: state.currentResume ? { ...state.currentResume, sections } : null,
        isDirty: true,
      };
    });
    get()._scheduleSave();
  },

  setTitle: (title) => {
    set((state) => ({
      currentResume: state.currentResume
        ? { ...state.currentResume, title }
        : null,
      isDirty: true,
    }));
    get()._scheduleSave();
  },

  save: async () => {
    const { currentResume, sections, isDirty, _saveTimeout } = get();
    if (!currentResume || !isDirty) return;

    if (_saveTimeout) clearTimeout(_saveTimeout);
    set({ isSaving: true, _saveTimeout: null });
    try {
      const serializedSections = sections.map((s, i) => ({
        id: s.id,
        type: s.type,
        title: s.title,
        sortOrder: i,
        visible: s.visible,
        content: s.content,
      }));

      await api.updateResume(currentResume.id, {
        title: currentResume.title,
        template: currentResume.template || 'classic',
        themeConfig: currentResume.themeConfig,
        sections: serializedSections,
      });

      set({ isDirty: false });
    } catch (error) {
      console.error('Failed to save resume:', error);
    } finally {
      set({ isSaving: false });
    }
  },

  flushPendingSave: async () => {
    const { _saveTimeout, isDirty } = get();
    if (_saveTimeout) {
      clearTimeout(_saveTimeout);
      set({ _saveTimeout: null });
    }

    if (isDirty) {
      await get().save();
    }
  },

  _scheduleSave: () => {
    const { _saveTimeout } = get();
    if (_saveTimeout) clearTimeout(_saveTimeout);

    const { autoSave, autoSaveInterval, _hydrated } = useSettingsStore.getState();

    // If settings are hydrated and autoSave is off, only mark dirty, don't auto-save
    if (_hydrated && !autoSave) {
      set({ _saveTimeout: null });
      return;
    }

    const delay = _hydrated ? autoSaveInterval : AUTOSAVE_DELAY;
    const timeout = setTimeout(() => {
      get().save();
    }, delay);

    set({ _saveTimeout: timeout });
  },

  reset: () => {
    const { _saveTimeout } = get();
    if (_saveTimeout) clearTimeout(_saveTimeout);
    set({
      currentResume: null,
      sections: [],
      isDirty: false,
      isSaving: false,
      _saveTimeout: null,
    });
  },
}));
