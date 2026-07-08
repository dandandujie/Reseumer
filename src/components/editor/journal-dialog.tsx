'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Briefcase, MessagesSquare, Plus, Trash2 } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  useJournalStore,
  CHANNEL_PRESETS,
  type Application,
  type ApplicationStatus,
  type InterviewFormat,
  type InterviewRound,
  type OutcomeResult,
} from '@/stores/journal-store';
import { cn } from '@/lib/utils';

interface JournalDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  resumeId: string;
}

const STATUSES: ApplicationStatus[] = ['submitted', 'screening', 'interview', 'offer', 'rejected', 'declined', 'ghosted'];
const FORMATS: InterviewFormat[] = ['phone', 'video', 'onsite', 'take-home', 'other'];
const OUTCOMES: OutcomeResult[] = ['offer', 'rejected', 'withdrew', 'ghosted'];

const statusKey: Record<ApplicationStatus, string> = {
  submitted: 'statusSubmitted',
  screening: 'statusScreening',
  interview: 'statusInterview',
  offer: 'statusOffer',
  rejected: 'statusRejected',
  declined: 'statusDeclined',
  ghosted: 'statusGhosted',
};
const formatKey: Record<InterviewFormat, string> = {
  phone: 'formatPhone',
  video: 'formatVideo',
  onsite: 'formatOnsite',
  'take-home': 'formatTakeHome',
  other: 'formatOther',
};
const outcomeKey: Record<OutcomeResult, string> = {
  offer: 'outcomeOffer',
  rejected: 'outcomeRejected',
  withdrew: 'outcomeWithdrew',
  ghosted: 'outcomeGhosted',
};

export function JournalDialog({ open, onOpenChange, resumeId }: JournalDialogProps) {
  const t = useTranslations('journal');
  const applications = useJournalStore((s) => s.applications);
  const mocksMap = useJournalStore((s) => s.mocks);
  const addApplication = useJournalStore((s) => s.addApplication);
  const removeMock = useJournalStore((s) => s.removeMock);

  const apps = (applications[resumeId] || []).slice().sort((a, b) => b.updatedAt - a.updatedAt);
  const mocks = (mocksMap[resumeId] || []).slice().sort((a, b) => b.createdAt - a.createdAt);

  const [view, setView] = useState<'apps' | 'mocks'>('apps');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedMockId, setSelectedMockId] = useState<string | null>(null);
  const selected = apps.find((a) => a.id === selectedId) || null;
  const selectedMock = mocks.find((m) => m.id === selectedMockId) || null;

  const newApp = () => {
    const a = addApplication(resumeId, {});
    setSelectedId(a.id);
    setView('apps');
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex h-[min(720px,calc(100vh-5rem))] max-w-[900px] flex-col gap-0 p-0 sm:max-w-[900px]">
        <DialogHeader className="border-b border-border px-5 py-3">
          <DialogTitle>{t('title')}</DialogTitle>
        </DialogHeader>

        <div className="flex min-h-0 flex-1">
          {/* Left rail: view switch + list */}
          <div className="flex w-56 shrink-0 flex-col border-r border-border">
            <div className="flex gap-1 p-2">
              {(['apps', 'mocks'] as const).map((v) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => setView(v)}
                  className={cn(
                    'flex flex-1 items-center justify-center gap-1 rounded-md py-1.5 text-[12px] font-medium transition-colors',
                    view === v ? 'bg-[var(--whale-ink)] text-[var(--whale-cream)]' : 'text-muted-foreground hover:bg-muted'
                  )}
                >
                  {v === 'apps' ? <Briefcase className="h-3.5 w-3.5" /> : <MessagesSquare className="h-3.5 w-3.5" />}
                  {v === 'apps' ? t('threadsTab') : t('mocksTab')}
                </button>
              ))}
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-2">
              {view === 'apps' ? (
                apps.length === 0 ? (
                  <p className="px-2 py-6 text-center text-xs text-muted-foreground">{t('threadEmpty')}</p>
                ) : (
                  <div className="space-y-1">
                    {apps.map((a) => {
                      const active = a.id === selectedId;
                      return (
                        <button
                          key={a.id}
                          type="button"
                          onClick={() => setSelectedId(a.id)}
                          className={cn(
                            'w-full rounded-md border px-2.5 py-2 text-left transition-colors',
                            active ? 'border-brand/40 bg-brand/5' : 'border-transparent hover:bg-muted'
                          )}
                        >
                          <div className="truncate text-[13px] font-medium text-foreground">{a.company || t('untitledCompany')}</div>
                          <div className="mt-0.5 flex items-center justify-between gap-2">
                            <span className="truncate text-[11px] text-muted-foreground">{a.role || '—'}</span>
                            <span className="shrink-0 rounded-full bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
                              {t(statusKey[a.status])}
                            </span>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )
              ) : mocks.length === 0 ? (
                <p className="px-2 py-6 text-center text-xs text-muted-foreground">{t('mockEmpty')}</p>
              ) : (
                <div className="space-y-1">
                  {mocks.map((m) => {
                    const active = m.id === selectedMockId;
                    return (
                      <button
                        key={m.id}
                        type="button"
                        onClick={() => setSelectedMockId(m.id)}
                        className={cn(
                          'w-full rounded-md border px-2.5 py-2 text-left transition-colors',
                          active ? 'border-brand/40 bg-brand/5' : 'border-transparent hover:bg-muted'
                        )}
                      >
                        <div className="truncate text-[13px] font-medium text-foreground">
                          {[m.company, m.role].filter(Boolean).join(' · ') || t('archiveTitlePrefix')}
                        </div>
                        <div className="mt-0.5 text-[10px] text-muted-foreground">{new Date(m.createdAt).toLocaleDateString()}</div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {view === 'apps' && (
              <div className="border-t border-border p-2">
                <Button size="sm" className="w-full cursor-pointer gap-1.5" onClick={newApp}>
                  <Plus className="h-4 w-4" />
                  {t('addApplication')}
                </Button>
              </div>
            )}
          </div>

          {/* Right: detail */}
          <div className="min-w-0 flex-1 overflow-y-auto p-5">
            {view === 'mocks' ? (
              selectedMock ? (
                <div className="space-y-3">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <h3 className="text-[15px] font-semibold text-foreground">
                        {[selectedMock.company, selectedMock.role].filter(Boolean).join(' · ') || t('archiveTitlePrefix')}
                      </h3>
                      <p className="text-[11px] text-muted-foreground">{new Date(selectedMock.createdAt).toLocaleString()}</p>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon-xs"
                      className="cursor-pointer text-muted-foreground hover:text-destructive"
                      onClick={() => { removeMock(selectedMock.id); setSelectedMockId(null); }}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                  {selectedMock.feedback && (
                    <div>
                      <Label className="text-xs text-muted-foreground">{t('mockFeedback')}</Label>
                      <div className="mt-1 whitespace-pre-wrap rounded-md border border-border bg-muted/40 p-3 text-[12px] leading-relaxed">
                        {selectedMock.feedback}
                      </div>
                    </div>
                  )}
                  {selectedMock.transcript && (
                    <details className="rounded-md border border-border">
                      <summary className="cursor-pointer px-3 py-2 text-[12px] font-medium">{t('mockTranscript')}</summary>
                      <div className="max-h-64 overflow-y-auto whitespace-pre-wrap px-3 pb-3 text-[11px] leading-relaxed text-muted-foreground">
                        {selectedMock.transcript}
                      </div>
                    </details>
                  )}
                </div>
              ) : (
                <div className="flex h-full items-center justify-center text-center text-sm text-muted-foreground">
                  {mocks.length ? t('selectMock') : t('mockEmpty')}
                </div>
              )
            ) : selected ? (
              <ApplicationDetail key={selected.id} app={selected} onDeleted={() => setSelectedId(null)} />
            ) : (
              <div className="flex h-full flex-col items-center justify-center gap-3 text-center text-sm text-muted-foreground">
                {t('selectThread')}
                <Button variant="outline" size="sm" className="cursor-pointer gap-1.5" onClick={newApp}>
                  <Plus className="h-4 w-4" />
                  {t('addApplication')}
                </Button>
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function ApplicationDetail({ app, onDeleted }: { app: Application; onDeleted: () => void }) {
  const t = useTranslations('journal');
  const update = useJournalStore((s) => s.updateApplication);
  const del = useJournalStore((s) => s.deleteApplication);
  const addInterview = useJournalStore((s) => s.addInterview);
  const updateInterview = useJournalStore((s) => s.updateInterview);
  const removeInterview = useJournalStore((s) => s.removeInterview);
  const setOutcome = useJournalStore((s) => s.setOutcome);

  const set = (patch: Partial<Application>) => update(app.id, patch);

  return (
    <div className="space-y-4">
      {/* Company / role + delete */}
      <div className="flex items-start gap-2">
        <div className="grid flex-1 grid-cols-2 gap-2">
          <Field label={t('fieldCompany')}>
            <Input value={app.company} onChange={(e) => set({ company: e.target.value })} placeholder={t('fieldCompany')} />
          </Field>
          <Field label={t('fieldRole')}>
            <Input value={app.role} onChange={(e) => set({ role: e.target.value })} placeholder={t('fieldRole')} />
          </Field>
        </div>
        <Button
          variant="ghost"
          size="icon-xs"
          className="mt-6 shrink-0 cursor-pointer text-muted-foreground hover:text-destructive"
          onClick={() => { del(app.id); onDeleted(); }}
          title={t('delete')}
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <Field label={t('fieldChannel')}>
          <Input
            list="journal-channels"
            value={app.channel || ''}
            onChange={(e) => set({ channel: e.target.value })}
            placeholder={t('fieldChannelPlaceholder')}
          />
          <datalist id="journal-channels">
            {CHANNEL_PRESETS.map((c) => <option key={c} value={c} />)}
          </datalist>
        </Field>
        <Field label={t('fieldDate')}>
          <Input type="date" value={app.appliedDate} onChange={(e) => set({ appliedDate: e.target.value })} />
        </Field>
        <Field label={t('fieldStatus')}>
          <Select value={app.status} onValueChange={(v) => set({ status: v as ApplicationStatus })}>
            <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
            <SelectContent>
              {STATUSES.map((s) => <SelectItem key={s} value={s} className="text-xs">{t(statusKey[s])}</SelectItem>)}
            </SelectContent>
          </Select>
        </Field>
        <Field label={t('fieldNextFollowUp')}>
          <Input type="date" value={app.nextFollowUp || ''} onChange={(e) => set({ nextFollowUp: e.target.value })} />
        </Field>
        <Field label={t('fieldHrName')}>
          <Input value={app.hrName || ''} onChange={(e) => set({ hrName: e.target.value })} placeholder={t('fieldHrName')} />
        </Field>
        <Field label={t('fieldHrContact')}>
          <Input value={app.hrContact || ''} onChange={(e) => set({ hrContact: e.target.value })} placeholder={t('fieldHrContactPlaceholder')} />
        </Field>
      </div>

      <Field label={t('fieldJd')}>
        <Textarea rows={2} value={app.jdSnippet || ''} onChange={(e) => set({ jdSnippet: e.target.value })} />
      </Field>
      <Field label={t('fieldNotes')}>
        <Textarea rows={2} value={app.notes || ''} onChange={(e) => set({ notes: e.target.value })} />
      </Field>

      {/* Interview rounds */}
      <section className="space-y-2">
        <div className="flex items-center justify-between">
          <Label className="text-[13px] font-semibold">{t('interviewRounds')}</Label>
          <Button variant="outline" size="sm" className="cursor-pointer gap-1" onClick={() => addInterview(app.id, {})}>
            <Plus className="h-3.5 w-3.5" />
            {t('addRound')}
          </Button>
        </div>
        {app.interviews.length === 0 ? (
          <p className="rounded-md border border-dashed border-border px-3 py-3 text-center text-xs text-muted-foreground">{t('noRounds')}</p>
        ) : (
          <div className="space-y-2">
            {app.interviews.map((r, i) => (
              <RoundEditor
                key={r.id}
                index={i}
                round={r}
                onChange={(patch) => updateInterview(app.id, r.id, patch)}
                onRemove={() => removeInterview(app.id, r.id)}
              />
            ))}
          </div>
        )}
      </section>

      {/* Outcome */}
      <section className="space-y-2">
        <div className="flex items-center justify-between">
          <Label className="text-[13px] font-semibold">{t('fieldOutcome')}</Label>
          <Select
            value={app.outcome?.result ?? '__none__'}
            onValueChange={(v) =>
              v === '__none__'
                ? setOutcome(app.id, null)
                : setOutcome(app.id, { ...(app.outcome || {}), result: v as OutcomeResult })
            }
          >
            <SelectTrigger className="h-8 w-36"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="__none__" className="text-xs">{t('outcomeNone')}</SelectItem>
              {OUTCOMES.map((o) => <SelectItem key={o} value={o} className="text-xs">{t(outcomeKey[o])}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        {app.outcome && (
          <div className="space-y-2">
            <Field label={t('fieldReason')}>
              <Input value={app.outcome.reason || ''} onChange={(e) => setOutcome(app.id, { ...app.outcome!, reason: e.target.value })} />
            </Field>
            <Field label={t('fieldReflection')}>
              <Textarea rows={2} value={app.outcome.reflection || ''} onChange={(e) => setOutcome(app.id, { ...app.outcome!, reflection: e.target.value })} />
            </Field>
          </div>
        )}
      </section>
    </div>
  );
}

function RoundEditor({
  index,
  round,
  onChange,
  onRemove,
}: {
  index: number;
  round: InterviewRound;
  onChange: (patch: Partial<InterviewRound>) => void;
  onRemove: () => void;
}) {
  const t = useTranslations('journal');
  return (
    <div className="rounded-md border border-border p-2.5">
      <div className="mb-2 flex items-center gap-2">
        <Input
          value={round.round}
          onChange={(e) => onChange({ round: e.target.value })}
          placeholder={t('fieldRoundPlaceholder')}
          className="h-8 flex-1"
        />
        <Select value={round.format ?? 'video'} onValueChange={(v) => onChange({ format: v as InterviewFormat })}>
          <SelectTrigger size="sm" className="h-8 w-24 text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>
            {FORMATS.map((f) => <SelectItem key={f} value={f} className="text-xs">{t(formatKey[f])}</SelectItem>)}
          </SelectContent>
        </Select>
        <Button variant="ghost" size="icon-xs" className="shrink-0 cursor-pointer text-muted-foreground hover:text-destructive" onClick={onRemove}>
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Field label={t('fieldScheduledAt')}>
          <Input
            type="datetime-local"
            value={round.scheduledAt || ''}
            onChange={(e) => onChange({ scheduledAt: e.target.value })}
            className="h-8"
          />
        </Field>
        <Field label={t('fieldDuration')}>
          <Input
            type="number"
            min={0}
            value={round.durationMin ?? ''}
            onChange={(e) => onChange({ durationMin: e.target.value ? Number(e.target.value) : undefined })}
            placeholder={t('durationPlaceholder')}
            className="h-8"
          />
        </Field>
        <Field label={t('fieldInterviewer')}>
          <Input value={round.interviewer || ''} onChange={(e) => onChange({ interviewer: e.target.value })} className="h-8" />
        </Field>
        <Field label={t('fieldTopics')}>
          <Input value={round.topics || ''} onChange={(e) => onChange({ topics: e.target.value })} className="h-8" />
        </Field>
      </div>
      <div className="mt-2">
        <Field label={t('fieldNotes')}>
          <Textarea rows={2} value={round.notes || ''} onChange={(e) => onChange({ notes: e.target.value })} />
        </Field>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1">
      <span className="text-[11px] font-medium text-muted-foreground">{label}</span>
      {children}
    </label>
  );
}
