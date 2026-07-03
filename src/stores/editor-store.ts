import { create } from 'zustand';
import type { ResumeSection } from '@/types/resume';
import type { ResumeSnapshot } from '@/types/editor';
import { MAX_UNDO_STACK } from '@/lib/constants';

interface EditorStore {
  selectedSectionId: string | null;
  showAiChat: boolean;
  showThemeEditor: boolean;
  undoStack: ResumeSnapshot[];
  redoStack: ResumeSnapshot[];
  pendingAiMessage: string | null;
  mobileActiveTab: "edit" | "preview";
  rightPaneTab: "edit" | "ai";

  selectSection: (id: string | null) => void;
  toggleAiChat: () => void;
  setShowAiChat: (show: boolean) => void;
  toggleThemeEditor: () => void;
  pushSnapshot: (sections: ResumeSection[]) => void;
  undo: (current: ResumeSection[]) => ResumeSnapshot | null;
  redo: (current: ResumeSection[]) => ResumeSnapshot | null;
  setPendingAiMessage: (message: string | null) => void;
  setMobileActiveTab: (tab: "edit" | "preview") => void;
  setRightPaneTab: (tab: "edit" | "ai") => void;
  reset: () => void;
}

export const useEditorStore = create<EditorStore>((set, get) => ({
  selectedSectionId: null,
  showAiChat: false,
  showThemeEditor: false,
  undoStack: [],
  redoStack: [],
  pendingAiMessage: null,
  mobileActiveTab: "edit",
  rightPaneTab: "edit",

  selectSection: (id) => set({ selectedSectionId: id }),
  toggleAiChat: () => set((s) => ({ showAiChat: !s.showAiChat })),
  setShowAiChat: (show) => set({ showAiChat: show }),
  toggleThemeEditor: () => set((s) => ({ showThemeEditor: !s.showThemeEditor })),

  pushSnapshot: (sections) => {
    set((state) => ({
      undoStack: [
        ...state.undoStack.slice(-MAX_UNDO_STACK + 1),
        { sections, timestamp: Date.now() },
      ],
      redoStack: [],
    }));
  },

  // GOTCHA: the stack entry being popped holds the state to RESTORE, so the
  // opposite stack must receive the CURRENT state (passed by the caller) —
  // pushing the popped snapshot instead would make redo a no-op.
  undo: (current) => {
    const { undoStack } = get();
    if (undoStack.length === 0) return null;
    const snapshot = undoStack[undoStack.length - 1];
    set((state) => ({
      undoStack: state.undoStack.slice(0, -1),
      redoStack: [...state.redoStack, { sections: current, timestamp: Date.now() }],
    }));
    return snapshot;
  },

  redo: (current) => {
    const { redoStack } = get();
    if (redoStack.length === 0) return null;
    const snapshot = redoStack[redoStack.length - 1];
    set((state) => ({
      redoStack: state.redoStack.slice(0, -1),
      undoStack: [...state.undoStack, { sections: current, timestamp: Date.now() }],
    }));
    return snapshot;
  },

  setPendingAiMessage: (message) => set({ pendingAiMessage: message }),
  setMobileActiveTab: (tab) => set({ mobileActiveTab: tab }),
  setRightPaneTab: (tab) => set({ rightPaneTab: tab }),

  reset: () =>
    set({
      selectedSectionId: null,
      showAiChat: false,
      showThemeEditor: false,
      undoStack: [],
      redoStack: [],
      pendingAiMessage: null,
      mobileActiveTab: "edit",
      rightPaneTab: "edit",
    }),
}));
