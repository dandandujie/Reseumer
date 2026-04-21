/**
 * Editor page — adapted from app/[locale]/editor/[id]/page.tsx
 * Changes: useParams() from react-router-dom instead of use(params)
 */
import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { toast } from 'sonner';
import { useEditor } from '@/hooks/use-editor';
import { useFingerprint } from '@/hooks/use-fingerprint';
import { useIsMobile } from '@/hooks/use-media-query';
import { EditorToolbar } from '@/components/editor/editor-toolbar';
import { EditorSidebar } from '@/components/editor/editor-sidebar';
import { EditorCanvas } from '@/components/editor/editor-canvas';
import { ThemeEditor } from '@/components/editor/theme-editor';
import { EditorPreviewPanel } from '@/components/editor/editor-preview-panel';
import { EditorMobileTabBar } from '@/components/editor/editor-mobile-tab-bar';
import { AIChatBubble } from '@/components/ai/ai-chat-bubble';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { List } from "lucide-react";
import { SettingsDialog } from '@/components/settings/settings-dialog';
import { JdAnalysisDialog } from '@/components/editor/jd-analysis-dialog';
import { TranslateDialog } from '@/components/editor/translate-dialog';
import { ExportDialog } from '@/components/editor/export-dialog';
import { ImportDialog } from '@/components/editor/import-dialog';
import { CoverLetterDialog } from '@/components/editor/cover-letter-dialog';
import { GrammarCheckDialog } from '@/components/editor/grammar-check-dialog';
import { useEditorStore } from '@/stores/editor-store';
import { useUIStore } from '@/stores/ui-store';
import { useSettingsStore } from '@/stores/settings-store';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

export default function EditorPage() {
  const { id } = useParams<{ id: string }>();
  const { isLoading: fpLoading } = useFingerprint();
  const { resume, sections, updateSection, addSection, removeSection, reorderSections } = useEditor(id!);
  const isMobile = useIsMobile();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { showThemeEditor, mobileActiveTab } = useEditorStore();
  const { activeModal, openModal, closeModal } = useUIStore();
  const { hydrate, _hydrated } = useSettingsStore();

  useEffect(() => {
    if (!_hydrated) hydrate();
  }, [_hydrated, hydrate]);

  useEffect(() => {
    const handler = (e: PromiseRejectionEvent) => {
      const msg = e.reason?.message || String(e.reason || '');
      if (msg.includes('AI_RetryError') || msg.includes('AI_APICallError')) {
        e.preventDefault();
        toast.error('操作失败', {
          description: 'AI 服务暂时不可用，请稍后重试',
        });
      }
    };
    window.addEventListener('unhandledrejection', handler);
    return () => window.removeEventListener('unhandledrejection', handler);
  }, []);

  if (fpLoading || !resume) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="space-y-4 w-64">
          <Skeleton className="h-8 w-full" />
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="h-64 w-full" />
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen flex-col">
      <EditorToolbar resumeId={id!} />
      <EditorMobileTabBar />

      <div className="flex flex-1 overflow-hidden">
        <div className="hidden md:block">
          <EditorSidebar sections={sections} onAddSection={addSection} onReorderSections={reorderSections} />
        </div>

        <div className={cn("min-w-0 flex-1 overflow-hidden md:flex-[6]", isMobile && mobileActiveTab !== "preview" && "hidden")}>
          <EditorPreviewPanel />
        </div>

        {showThemeEditor && <ThemeEditor />}

        <div className={cn("min-w-0 flex-1 overflow-hidden md:flex-[4]", isMobile && mobileActiveTab !== "edit" && "hidden")}>
          <EditorCanvas sections={sections} onUpdateSection={updateSection} onRemoveSection={removeSection} />
        </div>
      </div>

      <button onClick={() => setSidebarOpen(true)} className="fixed bottom-20 left-4 z-40 flex h-12 w-12 items-center justify-center rounded-full bg-brand text-white shadow-lg transition-transform hover:scale-105 active:scale-95 md:hidden" aria-label="Open sections">
        <List className="h-5 w-5" />
      </button>

      <Sheet open={sidebarOpen} onOpenChange={setSidebarOpen}>
        <SheetContent side="left" className="w-72 p-0">
          <SheetHeader className="border-b px-4 py-3">
            <SheetTitle className="text-sm font-semibold">Sections</SheetTitle>
          </SheetHeader>
          <EditorSidebar sections={sections} onAddSection={(s) => { addSection(s); setSidebarOpen(false); }} onReorderSections={reorderSections} />
        </SheetContent>
      </Sheet>

      <AIChatBubble resumeId={id!} />
      <SettingsDialog />
      <JdAnalysisDialog open={activeModal === 'jd-analysis'} onOpenChange={(open) => open ? openModal('jd-analysis') : closeModal()} resumeId={id!} />
      <TranslateDialog open={activeModal === 'translate'} onOpenChange={(open) => open ? openModal('translate') : closeModal()} resumeId={id!} />
      <ExportDialog open={activeModal === 'export'} onOpenChange={(open) => open ? openModal('export') : closeModal()} resumeId={id!} />
      <ImportDialog open={activeModal === 'import'} onOpenChange={(open) => open ? openModal('import') : closeModal()} resumeId={id!} />
      <CoverLetterDialog open={activeModal === 'cover-letter'} onOpenChange={(open) => open ? openModal('cover-letter') : closeModal()} resumeId={id!} />
      <GrammarCheckDialog open={activeModal === 'grammar-check'} onOpenChange={(open) => open ? openModal('grammar-check') : closeModal()} resumeId={id!} />
    </div>
  );
}
