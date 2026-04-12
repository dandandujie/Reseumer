'use client';

import { ScrollArea } from '@/components/ui/scroll-area';
import { SectionWrapper } from './section-wrapper';
import { useEditorStore } from '@/stores/editor-store';
import type { ResumeSection, SectionContent } from '@/types/resume';

interface EditorCanvasProps {
  sections: ResumeSection[];
  onUpdateSection: (sectionId: string, content: Partial<SectionContent>) => void;
  onRemoveSection: (sectionId: string) => void;
}

export function EditorCanvas({
  sections,
  onUpdateSection,
  onRemoveSection,
}: EditorCanvasProps) {
  const { selectedSectionId } = useEditorStore();
  
  const displaySection = sections.find((s) => s.id === selectedSectionId) || sections[0];

  return (
    <div className="h-full min-w-0 overflow-hidden border-l bg-background/80 dark:bg-zinc-950 dark:border-zinc-800">
      <ScrollArea className="h-full">
        <div className="mx-auto max-w-3xl px-3 py-4 md:px-6 md:py-8">
          {displaySection ? (
            <SectionWrapper
              section={displaySection}
              onUpdate={(content) => onUpdateSection(displaySection.id, content)}
              onRemove={() => onRemoveSection(displaySection.id)}
            />
          ) : (
            <div className="flex h-32 items-center justify-center rounded-xl border border-dashed border-zinc-300 text-zinc-500">
              请选择或添加一个模块
            </div>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
