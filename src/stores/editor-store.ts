import { create } from 'zustand';
import type { ResumeSection } from '@/types/resume';
import type { ResumeSnapshot } from '@/types/editor';
import { MAX_UNDO_STACK } from '@/lib/constants';

/** A queued instruction for the AI chat panel. When resumeId is set, only the
 *  editor of that resume may consume it (cross-navigation handoff, e.g. derive
 *  tailored copy); a mismatching editor discards it to avoid misfires. */
export interface PendingAiMessage {
  text: string;
  resumeId?: string | null;
}

interface EditorStore {
  selectedSectionId: string | null;
  showAiChat: boolean;
  showThemeEditor: boolean;
  undoStack: ResumeSnapshot[];
  redoStack: ResumeSnapshot[];
  pendingAiMessage: PendingAiMessage | null;
  mobileActiveTab: "edit" | "preview";
  rightPaneTab: "edit" | "ai";

  selectSection: (id: string | null) => void;
  toggleAiChat: () => void;
  setShowAiChat: (show: boolean) => void;
  toggleThemeEditor: () => void;
  pushSnapshot: (sections: ResumeSection[]) => void;
  undo: (current: ResumeSection[]) => ResumeSnapshot | null;
  redo: (current: ResumeSection[]) => ResumeSnapshot | null;
  setPendingAiMessage: (message: PendingAiMessage | null) => void;
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

  // GOTCHA: reset() runs on editor unmount (including resume switches). It must
  // NOT clear pendingAiMessage / rightPaneTab — they carry cross-navigation
  // handoffs (e.g. "derive tailored copy" sets a pending AI instruction, then
  // navigates to the new copy's editor, which consumes it after mount).
  reset: () =>
    set({
      selectedSectionId: null,
      showAiChat: false,
      showThemeEditor: false,
      undoStack: [],
      redoStack: [],
      mobileActiveTab: "edit",
    }),
}));
