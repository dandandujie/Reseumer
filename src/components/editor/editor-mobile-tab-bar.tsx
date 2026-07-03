"use client";

import { Pencil, Eye } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEditorStore } from "@/stores/editor-store";
import { cn } from "@/lib/utils";

export function EditorMobileTabBar() {
  const t = useTranslations("editor");
  const { mobileActiveTab, setMobileActiveTab } = useEditorStore();

  return (
    <div className="flex border-b border-[var(--whale-divider)] bg-[var(--whale-sidebar)] md:hidden">
      <button
        onClick={() => setMobileActiveTab("edit")}
        className={cn(
          "flex flex-1 items-center justify-center gap-2 py-2.5 text-sm font-medium transition-colors",
          mobileActiveTab === "edit"
            ? "border-b-2 border-[var(--whale-mint-deep)] text-[var(--whale-ink)]"
            : "text-[var(--whale-ink-muted)] hover:text-[var(--whale-ink)]"
        )}
      >
        <Pencil className="h-4 w-4" />
        {t("edit")}
      </button>
      <button
        onClick={() => setMobileActiveTab("preview")}
        className={cn(
          "flex flex-1 items-center justify-center gap-2 py-2.5 text-sm font-medium transition-colors",
          mobileActiveTab === "preview"
            ? "border-b-2 border-[var(--whale-mint-deep)] text-[var(--whale-ink)]"
            : "text-[var(--whale-ink-muted)] hover:text-[var(--whale-ink)]"
        )}
      >
        <Eye className="h-4 w-4" />
        {t("preview")}
      </button>
    </div>
  );
}
