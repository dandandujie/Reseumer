'use client';

import type {
  Resume,
  PersonalInfoContent,
  SummaryContent,
  WorkExperienceContent,
  EducationContent,
  SkillsContent,
  ProjectsContent,
  CertificationsContent,
  LanguagesContent,
  CustomContent,
  GitHubContent,
} from '@/types/resume';
import { isSectionEmpty, md } from '../utils';
import { AvatarImage } from '../avatar-image';
import { QrCodesPreview } from '../qr-codes-preview';
import { useEditorStore } from '@/stores/editor-store';
import { cn } from '@/lib/utils';
import { motion } from 'framer-motion';

function getDateRange(startDate?: string, endDate?: string | null, presentLabel = 'Present') {
  if (!startDate) return '';
  const tail = endDate || presentLabel;
  return tail ? `${startDate} - ${tail}` : startDate;
}

function EmptySectionPlaceholder({ lang }: { lang?: string }) {
  return (
    <div className="rounded-md border border-dashed border-zinc-200 bg-zinc-50/70 px-3 py-4">
      <div className="h-2.5 w-24 rounded-full bg-zinc-200/80" />
      <div className="mt-2 h-2.5 w-full max-w-[16rem] rounded-full bg-zinc-100" />
      <p className="mt-3 text-xs text-zinc-400">
        {lang === 'zh' ? '填写后会显示在这里' : 'Content will appear here'}
      </p>
    </div>
  );
}

export function ClassicTemplate({ resume, interactive }: { resume: Resume; interactive?: boolean }) {
  const personalInfo = resume.sections.find((s) => s.type === 'personal_info');
  const pi = (personalInfo?.content || {}) as PersonalInfoContent;
  const { selectedSectionId, selectSection } = useEditorStore();

  const getSectionProps = (sectionId: string) => {
    if (!interactive) return {};
    const isSelected = selectedSectionId === sectionId;
    return {
      onClick: () => selectSection(sectionId),
      className: cn(
        'transition-all duration-200 cursor-pointer p-2 -mx-2 rounded-lg',
        isSelected ? 'bg-brand/5 ring-1 ring-brand/20' : 'hover:bg-zinc-50'
      )
    };
  };

  return (
    <div className="mx-auto max-w-[210mm] bg-white shadow-lg">
      {/* Header */}
      <div className="mb-6 border-b-2 border-zinc-800 pb-4">
        <div {...(personalInfo ? getSectionProps(personalInfo.id) : {})}>
          <div className="flex items-center justify-center gap-4">
            {pi.avatar && (
              <AvatarImage src={pi.avatar} avatarStyle={resume.themeConfig?.avatarStyle} size={64} className="shrink-0" />
            )}
            <div className="text-center">
              <h1 className="text-2xl font-bold text-zinc-900">{pi.fullName || 'Your Name'}</h1>
              {pi.jobTitle && <p className="mt-1 text-lg text-zinc-600">{pi.jobTitle}</p>}
            </div>
          </div>
          <div className="mt-2 flex flex-wrap items-center justify-center gap-3 text-sm text-zinc-500">
            {pi.age && <span>{pi.age}</span>}
            {pi.politicalStatus && <span>{pi.politicalStatus}</span>}
            {pi.gender && <span>{pi.gender}</span>}
            {pi.ethnicity && <span>{pi.ethnicity}</span>}
            {pi.hometown && <span>{pi.hometown}</span>}
            {pi.maritalStatus && <span>{pi.maritalStatus}</span>}
            {pi.yearsOfExperience && <span>{pi.yearsOfExperience}</span>}
            {pi.educationLevel && <span>{pi.educationLevel}</span>}
            {pi.email && <span>{pi.email}</span>}
            {pi.phone && <span>{pi.phone}</span>}
            {pi.wechat && <span>{pi.wechat}</span>}
            {pi.location && <span>{pi.location}</span>}
            {pi.website && <span>{pi.website}</span>}
          </div>
        </div>
      </div>

      {/* Sections */}
      {resume.sections
        .filter((s) => s.visible && s.type !== 'personal_info' && (interactive || !isSectionEmpty(s)))
        .map((section) => {
          const Comp = interactive ? motion.div : 'div';
          return (
            <Comp 
              key={section.id} 
              className="mb-5" 
              data-section
              layout={interactive ? "position" : false}
              transition={interactive ? { type: 'spring', stiffness: 300, damping: 30 } : undefined}
            >
              <div {...getSectionProps(section.id)}>
                <h2 className="mb-2 border-b border-zinc-300 pb-1 text-sm font-bold uppercase tracking-wider text-zinc-800">
                  {section.title}
                </h2>
                <SectionContent section={section} lang={resume.language} interactive={interactive} />
              </div>
            </Comp>
          );
        })}
    </div>
  );
}

function SectionContent({ section, lang, interactive }: { section: any; lang?: string; interactive?: boolean }) {
  const content = section.content;
  if (!content) return null;
  const empty = isSectionEmpty(section);

  if (interactive && empty) {
    return <EmptySectionPlaceholder lang={lang} />;
  }

  if (section.type === 'summary') {
    return <p className="text-sm text-zinc-600 leading-relaxed" dangerouslySetInnerHTML={{ __html: md((content as SummaryContent).text) }} />;
  }

  if (section.type === 'work_experience') {
    const items = (content as WorkExperienceContent).items || [];
    return (
      <div className="space-y-3">
        {items.map((item: any) => (
          <div key={item.id}>
            <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-start gap-3">
              <div className="min-w-0">
                <span className="text-sm font-semibold text-zinc-800">{item.position}</span>
              </div>
              <div className="min-w-0 text-center">
                {item.company && <span className="text-sm font-semibold text-zinc-800">{item.company}</span>}
                {item.location && <div className="text-xs text-zinc-400">{item.location}</div>}
              </div>
              <div className="min-w-0 text-right">
                <span className="text-xs font-semibold text-zinc-500">
                  {getDateRange(item.startDate, item.endDate, item.current ? (lang === 'zh' ? '至今' : 'Present') : '')}
                </span>
              </div>
            </div>
            {item.description && <p className="mt-1 text-sm text-zinc-600" dangerouslySetInnerHTML={{ __html: md(item.description) }} />}
            {item.technologies?.length > 0 && (
              <p className="mt-0.5 text-xs text-zinc-400">{lang === 'zh' ? '技术栈' : 'Tech'}: {item.technologies.join(', ')}</p>
            )}
            {item.highlights?.length > 0 && (
              <ul className="mt-1 list-disc pl-4">
                {item.highlights.map((h: string, i: number) => (
                  <li key={i} className="text-sm text-zinc-600" dangerouslySetInnerHTML={{ __html: md(h) }} />
                ))}
              </ul>
            )}
          </div>
        ))}
      </div>
    );
  }

  if (section.type === 'education') {
    const items = (content as EducationContent).items || [];
    return (
      <div className="space-y-3">
        {items.map((item: any) => (
          <div key={item.id}>
            <div className="flex items-baseline justify-between">
              <div>
                <span className="text-sm font-semibold text-zinc-800">
                  {[item.institution, item.field, item.degree].filter(Boolean).join(' - ')}
                </span>
                {item.location && <span className="text-sm text-zinc-400"> , {item.location}</span>}
              </div>
              <span className="text-xs font-semibold text-zinc-500">
                {getDateRange(item.startDate, item.endDate, lang === 'zh' ? '至今' : 'Present')}
              </span>
            </div>
            {item.gpa && <p className="text-sm text-zinc-500">GPA: {item.gpa}</p>}
            {item.highlights?.length > 0 && (
              <ul className="mt-1 list-disc pl-4">
                {item.highlights.map((h: string, i: number) => (
                  <li key={i} className="text-sm text-zinc-600" dangerouslySetInnerHTML={{ __html: md(h) }} />
                ))}
              </ul>
            )}
          </div>
        ))}
      </div>
    );
  }

  if (section.type === 'skills') {
    const categories = (content as SkillsContent).categories || [];
    return (
      <div className="space-y-1">
        {categories.map((cat: any) => (
          <div key={cat.id} className="flex text-sm">
            <span className="font-medium text-zinc-700 w-28 shrink-0">{cat.name}:</span>
            <span className="text-zinc-600">{cat.skills?.join(', ')}</span>
          </div>
        ))}
      </div>
    );
  }

  if (section.type === 'projects') {
    const items = (content as ProjectsContent).items || [];
    return (
      <div className="space-y-3">
        {items.map((item: any) => (
          <div key={item.id}>
            <div className="flex items-baseline justify-between">
              <span className="font-semibold text-zinc-800 text-sm">{item.name}</span>
              {item.startDate && (
                <span className="text-xs font-semibold text-zinc-500">
                  {getDateRange(item.startDate, item.endDate, lang === 'zh' ? '至今' : 'Present')}
                </span>
              )}
            </div>
            {item.description && <p className="mt-1 text-sm text-zinc-600" dangerouslySetInnerHTML={{ __html: md(item.description) }} />}
            {item.technologies?.length > 0 && (
              <p className="mt-0.5 text-xs text-zinc-400">{lang === 'zh' ? '技术栈' : 'Tech'}: {item.technologies.join(', ')}</p>
            )}
            {item.highlights?.length > 0 && (
              <ul className="mt-1 list-disc pl-4">
                {item.highlights.map((h: string, i: number) => (
                  <li key={i} className="text-sm text-zinc-600" dangerouslySetInnerHTML={{ __html: md(h) }} />
                ))}
              </ul>
            )}
          </div>
        ))}
      </div>
    );
  }

  if (section.type === 'github') {
    const items = (content as GitHubContent).items || [];
    return (
      <div className="space-y-3">
        {items.map((item: any) => (
          <div key={item.id}>
            <div className="flex items-baseline justify-between">
              <span className="font-semibold text-zinc-800 text-sm">{item.name}</span>
              <span className="text-xs text-zinc-400">{item.stars?.toLocaleString()}</span>
            </div>
            {item.language && <span className="text-xs text-zinc-500">{item.language}</span>}
            {item.description && <p className="mt-1 text-sm text-zinc-600" dangerouslySetInnerHTML={{ __html: md(item.description) }} />}
          </div>
        ))}
      </div>
    );
  }

  if (section.type === 'certifications') {
    const items = (content as CertificationsContent).items || [];
    return (
      <div className="space-y-1">
        {items.map((item: any) => (
          <div key={item.id}>
            <span className="font-semibold text-zinc-800 text-sm">{item.name}</span>
            {(item.issuer || item.date) && <span className="text-sm text-zinc-600">{item.issuer && <> — {item.issuer}</>}{item.date && <> ({item.date})</>}</span>}
          </div>
        ))}
      </div>
    );
  }

  if (section.type === 'languages') {
    const items = (content as LanguagesContent).items || [];
    return (
      <div className="space-y-1">
        {items.map((item: any) => (
          <div key={item.id}>
            <span className="font-semibold text-zinc-800 text-sm">{item.language}</span>
            <span className="text-sm text-zinc-600"> — {item.proficiency}</span>
          </div>
        ))}
      </div>
    );
  }

  if (section.type === 'custom') {
    const items = (content as CustomContent).items || [];
    return (
      <div className="space-y-2">
        {items.map((item: any) => (
          <div key={item.id}>
            <div className="flex items-baseline justify-between">
              <div>
                <span className="text-sm font-semibold text-zinc-800">{item.title}</span>
                {item.subtitle && <span className="text-sm text-zinc-500"> — {item.subtitle}</span>}
              </div>
              {item.date && <span className="text-xs text-zinc-400">{item.date}</span>}
            </div>
            {item.description && <p className="mt-0.5 text-sm text-zinc-600" dangerouslySetInnerHTML={{ __html: md(item.description) }} />}
          </div>
        ))}
      </div>
    );
  }

  if (section.type === 'qr_codes') {
    return <QrCodesPreview items={(content as any).items || []} />;
  }

  // Generic items
  if (content?.items) {
    return (
      <div className="space-y-2">
        {content.items.map((item: any) => (
          <div key={item.id}>
            <span className="text-sm font-medium text-zinc-700">{item.name || item.title || item.language}</span>
            {item.description && <p className="text-sm text-zinc-600" dangerouslySetInnerHTML={{ __html: md(item.description) }} />}
          </div>
        ))}
      </div>
    );
  }

  return null;
}
