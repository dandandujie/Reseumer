import { create } from 'zustand';
import type { ResumeSection } from '@/types/resume';

/**
 * Represents an AI-initiated mutation that the user can still accept or reject.
 * The mutation is ALREADY applied to the resume store/database by the backend —
 * `acceptProposal` is a no-op cleanup, while `rejectProposal` restores the
 * snapshot of sections that was captured immediately before the AI ran the tool.
 */
export interface Proposal {
  id: string;
  resumeId: string;
  messageId: string;
  toolName: string;
  toolCallId?: string;
  /** Whatever args the AI provided to the tool (sectionId, field, value, ...) */
  args: Record<string, unknown>;
  /** Full sections array snapshot taken just before the tool executed. */
  beforeSections: ResumeSection[];
  /** Snapshot taken right after the resume reloaded. */
  afterSections: ResumeSection[];
  createdAt: number;
}

interface ProposalsStore {
  proposals: Proposal[];

  /** Push a new pending proposal. Call once `afterSections` is known. */
  addProposal: (p: Proposal) => void;

  /** Mark a proposal accepted — just drop it from the pending list. */
  acceptProposal: (id: string) => void;

  /** Drop a proposal — caller is responsible for any DB/state restoration. */
  rejectProposal: (id: string) => void;

  /** Drop every pending proposal that doesn't belong to the given resume. */
  scopeTo: (resumeId: string) => void;

  clear: () => void;
}

export const useProposalsStore = create<ProposalsStore>((set) => ({
  proposals: [],

  addProposal: (p) =>
    set((state) => ({
      proposals: [...state.proposals.filter((x) => x.id !== p.id), p],
    })),

  acceptProposal: (id) =>
    set((state) => ({
      proposals: state.proposals.filter((p) => p.id !== id),
    })),

  rejectProposal: (id) =>
    set((state) => ({
      proposals: state.proposals.filter((p) => p.id !== id),
    })),

  scopeTo: (resumeId) =>
    set((state) => ({
      proposals: state.proposals.filter((p) => p.resumeId === resumeId),
    })),

  clear: () => set({ proposals: [] }),
}));

const MUTATION_TOOLS = new Set([
  'updateSection',
  'addSection',
  'removeSection',
  'rewriteText',
  'suggestSkills',
]);

export function isMutationTool(toolName: string): boolean {
  return MUTATION_TOOLS.has(toolName);
}
