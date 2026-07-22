'use client';

import { useTranslations } from 'next-intl';
import { Plus, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { EditableText } from '../fields/editable-text';
import { EditableList } from '../fields/editable-list';
import { createListEditor } from '@/lib/list-editor';
import { generateId } from '@/lib/utils';
import type { ResumeSection, SkillsContent, SkillCategory } from '@/types/resume';

interface Props {
  section: ResumeSection;
  onUpdate: (content: Partial<SkillsContent>) => void;
}

export function SkillsSection({ section, onUpdate }: Props) {
  const t = useTranslations('editor.fields');
  const content = section.content as SkillsContent;
  const categories = content.categories || [];

  const {
    addItem: addCategory,
    updateItem: updateCategory,
    removeItem: removeCategory,
  } = createListEditor<SkillCategory>(
    categories,
    (updated) => onUpdate({ categories: updated }),
    () => ({
      id: generateId(),
      name: '',
      skills: [],
    }),
  );

  return (
    <div className="space-y-4">
      {categories.map((cat, index) => (
        <div key={cat.id || `cat-${index}-${cat.name}`}>
          {index > 0 && <Separator className="mb-4" />}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <EditableText label={t('skillCategory')} value={cat.name} onChange={(v) => updateCategory(index, { name: v })} />
              <Button variant="ghost" size="sm" className="mt-5 h-7 cursor-pointer p-1 text-[var(--whale-ink-muted)] hover:text-red-500" onClick={() => removeCategory(index)}>
                <X className="h-3.5 w-3.5" />
              </Button>
            </div>
            <EditableList label={t('technologies')} items={cat.skills} onChange={(v) => updateCategory(index, { skills: v })} />
          </div>
        </div>
      ))}
      <Button variant="outline" size="sm" onClick={addCategory} className="w-full cursor-pointer gap-1">
        <Plus className="h-3.5 w-3.5" />
        {t('addItem')}
      </Button>
    </div>
  );
}
