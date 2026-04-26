import { useCallback, useEffect } from 'react';
import * as api from '@/lib/tauri-api';
import { useResumeStore } from '@/stores/resume-store';
import { useEditorStore } from '@/stores/editor-store';
import type { ResumeSection } from '@/types/resume';

export function useEditor(resumeId: string) {
  const { setResume, sections, currentResume, updateSection, addSection, removeSection, reorderSections, reset: resetResume } = useResumeStore();
  const { pushSnapshot, reset: resetEditor, selectSection } = useEditorStore();

  const loadResume = useCallback(async () => {
    try {
      const data = await api.getResume(resumeId);
      if (data) {
        setResume({
          ...data,
          sections: data.sections || [],
          themeConfig: data.themeConfig || {},
          createdAt: new Date(data.createdAt * 1000),
          updatedAt: new Date(data.updatedAt * 1000),
        });
      }
    } catch (error) {
      console.error('Failed to load resume:', error);
    }
  }, [resumeId, setResume]);

  useEffect(() => {
    loadResume();
    return () => {
      void useResumeStore.getState().flushPendingSave();
      resetResume();
      resetEditor();
    };
  }, [loadResume, resetResume, resetEditor]);

  const handleUpdateSection = useCallback(
    (sectionId: string, content: any) => {
      pushSnapshot(sections);
      updateSection(sectionId, content);
    },
    [sections, pushSnapshot, updateSection]
  );

  const handleAddSection = useCallback(
    (section: ResumeSection) => {
      pushSnapshot(sections);
      addSection(section);
      selectSection(section.id);
    },
    [sections, pushSnapshot, addSection, selectSection]
  );

  const handleRemoveSection = useCallback(
    (sectionId: string) => {
      pushSnapshot(sections);
      removeSection(sectionId);
    },
    [sections, pushSnapshot, removeSection]
  );

  const handleReorder = useCallback(
    (newSections: ResumeSection[]) => {
      pushSnapshot(sections);
      reorderSections(newSections);
    },
    [sections, pushSnapshot, reorderSections]
  );

  return {
    resume: currentResume,
    sections,
    updateSection: handleUpdateSection,
    addSection: handleAddSection,
    removeSection: handleRemoveSection,
    reorderSections: handleReorder,
    loadResume,
  };
}
