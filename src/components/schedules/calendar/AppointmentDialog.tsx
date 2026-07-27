import { useState, useMemo, useEffect } from 'react';
import { StandardDrawer } from '@/components/ui/standard-drawer';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import {
  Loader2,
  CalendarDays,
  AlertTriangle,
  Wand2,
  Video,
  Workflow,
} from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { toast } from 'sonner';

import { useProfessionals } from '@/hooks/useAppointmentProfessionals';
import { useAppointmentReasons } from '@/hooks/useAppointmentReasons';
import { useLeads } from '@/hooks/useLeads';
import {
  useUpsertAppointment,
  useConflictCheck,
  type AppointmentWithRefs,
  type AgendaChecklistItem,
} from '@/hooks/useAppointments';
import { supabase } from '@/integrations/supabase/client';
import { AgendaChecklist } from '../AgendaChecklist';

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  initial?: AppointmentWithRefs | null;
  defaultStart?: Date | null;
}

function toLocalInputValue(d: Date) {
  const tzOffset = d.getTimezoneOffset() * 60000;
  return new Date(d.getTime() - tzOffset).toISOString().slice(0, 16);
}

function addMinutes(date: Date, minutes: number): Date {
  return new Date(date.getTime() + minutes * 60_000);
}

function diffMinutes(a: Date, b: Date): number {
  return Math.round((b.getTime() - a.getTime()) / 60_000);
}

const QUICK_DURATIONS = [15, 30, 60, 90, 120] as const;

function durationLabel(min: number) {
  if (min < 60) return `${min}min`;
  const h = min / 60;
  return Number.isInteger(h) ? `${h}h` : `${h.toFixed(1)}h`;
}

export function AppointmentDialog({ open, onOpenChange, initial, defaultStart }: Props) {
  const { data: pros = [] } = useProfessionals();
  const { data: reasons = [] } = useAppointmentReasons();
  const { data: leads = [] } = useLeads();
  const upsert = useUpsertAppointment();

  const initialStart = initial?.start_at
    ? new Date(initial.start_at)
    : defaultStart || new Date();
  const initialEnd = initial?.end_at ? new Date(initial.end_at) : addMinutes(initialStart, 30);

  const [professionalId, setProfessionalId] = useState(initial?.professional_id || '');
  const [reasonId, setReasonId] = useState(initial?.reason_id || '');
  const [leadId, setLeadId] = useState(initial?.lead_id || '');
  const [title, setTitle] = useState(initial?.title || '');
  const [notes, setNotes] = useState(initial?.notes || '');
  const [startAt, setStartAt] = useState(toLocalInputValue(initialStart));
  const [endAt, setEndAt] = useState(toLocalInputValue(initialEnd));
  const [meetingUrl, setMeetingUrl] = useState(initial?.meeting_url || '');
  const [location, setLocation] = useState(initial?.location || '');
  const [checklist, setChecklist] = useState<AgendaChecklistItem[]>(
    initial?.agenda_checklist || [],
  );
  const [moveToStageId, setMoveToStageId] = useState<string>('');

  // Reidrata o formulário quando o `initial` muda ou o dialog reabre
  // (sem isso, abrir "Editar" reaproveita o estado do mount inicial e perde os dados).
  useEffect(() => {
    if (!open) return;
    const s = initial?.start_at
      ? new Date(initial.start_at)
      : defaultStart || new Date();
    const e = initial?.end_at ? new Date(initial.end_at) : addMinutes(s, 30);
    setProfessionalId(initial?.professional_id || '');
    setReasonId(initial?.reason_id || '');
    setLeadId(initial?.lead_id || '');
    setTitle(initial?.title || '');
    setNotes(initial?.notes || '');
    setStartAt(toLocalInputValue(s));
    setEndAt(toLocalInputValue(e));
    setMeetingUrl(initial?.meeting_url || '');
    setLocation(initial?.location || '');
    setChecklist(initial?.agenda_checklist || []);
    setMoveToStageId('');
    setShowErrors(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initial?.id]);

  const selectedReason = useMemo(() => reasons.find(r => r.id === reasonId), [reasons, reasonId]);
  const selectedLead = useMemo(() => leads.find(l => l.id === leadId) || null, [leads, leadId]);

  // Quando troca o motivo, ajusta automaticamente o fim com a duração padrão
  useEffect(() => {
    if (!selectedReason) return;
    if (initial?.id) return; // edição: respeita valor original
    const start = new Date(startAt);
    if (isNaN(start.getTime())) return;
    setEndAt(toLocalInputValue(addMinutes(start, selectedReason.default_duration_minutes)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reasonId]);

  // Quick duration slot
  const currentDuration = useMemo(() => {
    const s = new Date(startAt);
    const e = new Date(endAt);
    if (isNaN(s.getTime()) || isNaN(e.getTime())) return null;
    const d = diffMinutes(s, e);
    return d > 0 ? d : null;
  }, [startAt, endAt]);

  const applyDuration = (minutes: number) => {
    const s = new Date(startAt);
    if (isNaN(s.getTime())) return;
    setEndAt(toLocalInputValue(addMinutes(s, minutes)));
  };

  // Quando ajusta o início, mantém a mesma duração no fim
  const handleStartChange = (val: string) => {
    const oldStart = new Date(startAt);
    const oldEnd = new Date(endAt);
    setStartAt(val);
    if (!isNaN(oldStart.getTime()) && !isNaN(oldEnd.getTime())) {
      const dur = diffMinutes(oldStart, oldEnd);
      const newStart = new Date(val);
      if (!isNaN(newStart.getTime()) && dur > 0) {
        setEndAt(toLocalInputValue(addMinutes(newStart, dur)));
      }
    }
  };

  // Conflict check (debounced via React Query staleTime)
  const startISO = useMemo(() => {
    const d = new Date(startAt);
    return isNaN(d.getTime()) ? null : d.toISOString();
  }, [startAt]);
  const endISO = useMemo(() => {
    const d = new Date(endAt);
    return isNaN(d.getTime()) ? null : d.toISOString();
  }, [endAt]);
  const { data: conflicts = [], isFetching: checkingConflicts } = useConflictCheck(
    professionalId || null,
    startISO,
    endISO,
    initial?.id,
  );

  // Stages do pipeline do lead
  const [stages, setStages] = useState<{ id: string; name: string; color: string | null }[]>([]);
  useEffect(() => {
    if (!selectedLead?.pipeline_id) {
      setStages([]);
      setMoveToStageId('');
      return;
    }
    let cancelled = false;
    supabase
      .from('pipeline_stages')
      .select('id, name, color')
      .eq('pipeline_id', selectedLead.pipeline_id)
      .order('position', { ascending: true })
      .then(({ data }) => {
        if (!cancelled) setStages((data as any) || []);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedLead?.pipeline_id]);

  const generateMeetLink = () => {
    // Placeholder: gera string no formato Google Meet (lookup) sem chamada externa.
    // TODO: integrar Google Calendar API para criar evento e obter link real.
    const code = Math.random().toString(36).slice(2, 12);
    const url = `https://meet.google.com/lookup/${code}`;
    setMeetingUrl(url);
    toast.success('Link gerado (placeholder)', {
      description: 'Substitua pela integração real com Google Meet quando disponível.',
    });
  };

  // ===== Validação =====
  const errors = useMemo(() => {
    const e: Record<string, string> = {};
    if (!professionalId) e.professional = 'Selecione um profissional.';

    const start = new Date(startAt);
    const end = new Date(endAt);
    if (!startAt || isNaN(start.getTime())) {
      e.start = 'Informe uma data/hora de início válida.';
    }
    if (!endAt || isNaN(end.getTime())) {
      e.end = 'Informe uma data/hora de fim válida.';
    }
    if (!e.start && !e.end && end.getTime() <= start.getTime()) {
      e.end = 'O fim deve ser maior que o início.';
    }
    if (!e.start && !e.end && diffMinutes(start, end) > 60 * 24) {
      e.end = 'A duração máxima é de 24 horas.';
    }
    if (title && title.length > 120) {
      e.title = 'Título deve ter no máximo 120 caracteres.';
    }
    if (notes && notes.length > 2000) {
      e.notes = 'Anotações devem ter no máximo 2000 caracteres.';
    }
    if (location && location.length > 200) {
      e.location = 'Local deve ter no máximo 200 caracteres.';
    }
    if (meetingUrl) {
      try {
        const u = new URL(meetingUrl);
        if (!['http:', 'https:'].includes(u.protocol)) {
          e.meetingUrl = 'O link deve começar com http:// ou https://';
        }
      } catch {
        e.meetingUrl = 'Informe um link válido (https://…).';
      }
    }
    return e;
  }, [professionalId, startAt, endAt, title, notes, location, meetingUrl]);

  const [showErrors, setShowErrors] = useState(false);
  const isValid = Object.keys(errors).length === 0;

  const handleSave = async () => {
    if (!isValid) {
      setShowErrors(true);
      const first = Object.values(errors)[0];
      toast.error('Corrija os campos destacados', { description: first });
      return;
    }
    const start = new Date(startAt);
    const end = new Date(endAt);
    await upsert.mutateAsync({
      id: initial?.id,
      professional_id: professionalId,
      reason_id: reasonId || null,
      lead_id: leadId && leadId !== '__none__' ? leadId : null,
      title: title.trim() || null,
      notes: notes.trim() || null,
      start_at: start.toISOString(),
      end_at: end.toISOString(),
      meeting_url: meetingUrl.trim() || null,
      location: location.trim() || null,
      agenda_checklist: checklist,
      move_lead_to_stage_id:
        leadId && leadId !== '__none__' && moveToStageId ? moveToStageId : null,
    });
    onOpenChange(false);
  };

  const hasConflict = conflicts.length > 0;

  return (
    <StandardDrawer
      open={open}
      onOpenChange={onOpenChange}
      title={initial ? 'Editar agendamento' : 'Novo agendamento'}
      description="Defina profissional, horário e detalhes"
      icon={<CalendarDays className="w-5 h-5" />}
      bodyPadding="px-5 py-5"
      footer={
        <div className="flex items-center justify-between gap-2">
          <div className="text-xs text-muted-foreground">
            {checkingConflicts ? (
              <span className="inline-flex items-center gap-1.5"><Loader2 className="w-3 h-3 animate-spin" />Verificando…</span>
            ) : hasConflict ? (
              <span className="text-destructive">Resolva o conflito ou salve mesmo assim</span>
            ) : startISO && endISO && professionalId ? (
              <span className="text-emerald-500">Horário disponível</span>
            ) : null}
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button
              variant={hasConflict ? 'outline' : 'glow'}
              size="sm"
              onClick={handleSave}
              disabled={upsert.isPending || initial?.status === 'in_progress'}
              title={
                initial?.status === 'in_progress'
                  ? 'Atendimento em curso — edição bloqueada'
                  : !isValid
                    ? 'Corrija os campos destacados antes de salvar'
                    : hasConflict ? 'Salvar mesmo com conflito' : undefined
              }
            >
              {upsert.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              {hasConflict ? 'Salvar mesmo assim' : 'Salvar'}
            </Button>
          </div>
        </div>
      }
    >
      <div className="space-y-5">
            {initial?.status === 'in_progress' && (
              <Alert className="border-amber-500/40 bg-amber-500/10">
                <AlertTriangle className="w-4 h-4 text-amber-500" />
                <AlertTitle className="text-amber-500">Atendimento em curso</AlertTitle>
                <AlertDescription className="text-xs">
                  Edição bloqueada enquanto o status for "Em curso". Conclua ou cancele para liberar alterações.
                </AlertDescription>
              </Alert>
            )}
            {/* Profissional + Motivo */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Profissional *</Label>
                <Select value={professionalId} onValueChange={setProfessionalId}>
                  <SelectTrigger className={showErrors && errors.professional ? 'border-destructive' : ''}>
                    <SelectValue placeholder="Selecione" />
                  </SelectTrigger>
                  <SelectContent>
                    {pros.map(p => (
                      <SelectItem key={p.id} value={p.id}>
                        <span className="inline-flex items-center gap-2">
                          <span className="w-2 h-2 rounded-full" style={{ background: p.color }} />
                          {p.name}{p.specialty ? ` · ${p.specialty}` : ''}
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {showErrors && errors.professional && (
                  <p className="text-xs text-destructive">{errors.professional}</p>
                )}
              </div>
              <div className="space-y-1.5">
                <Label>Motivo</Label>
                <Select value={reasonId} onValueChange={setReasonId}>
                  <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                  <SelectContent>
                    {reasons.map(r => (
                      <SelectItem key={r.id} value={r.id}>
                        <span className="inline-flex items-center gap-2">
                          <span className="w-2 h-2 rounded-full" style={{ background: r.color }} />
                          {r.name} ({r.default_duration_minutes}min)
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Lead */}
            <div className="space-y-1.5">
              <Label>Lead (opcional)</Label>
              <Select value={leadId || '__none__'} onValueChange={(v) => setLeadId(v === '__none__' ? '' : v)}>
                <SelectTrigger><SelectValue placeholder="Sem lead" /></SelectTrigger>
                <SelectContent className="max-h-[300px]">
                  <SelectItem value="__none__">— Sem lead —</SelectItem>
                  {leads.slice(0, 200).map(l => (
                    <SelectItem key={l.id} value={l.id}>
                      {l.name}{l.phone ? ` · ${l.phone}` : ''}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Mover lead para etapa */}
            {selectedLead && stages.length > 0 && (
              <div className="space-y-1.5 rounded-md border border-border bg-card/40 p-3">
                <Label className="text-xs inline-flex items-center gap-1.5">
                  <Workflow className="w-3.5 h-3.5 text-muted-foreground" />
                  Mover lead para etapa do funil ao salvar
                </Label>
                <Select value={moveToStageId || '__none__'} onValueChange={(v) => setMoveToStageId(v === '__none__' ? '' : v)}>
                  <SelectTrigger className="h-9">
                    <SelectValue placeholder="Não mover" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">Não mover</SelectItem>
                    {stages.map(s => (
                      <SelectItem key={s.id} value={s.id}>
                        <span className="inline-flex items-center gap-2">
                          {s.color && (
                            <span className="w-2 h-2 rounded-full" style={{ background: s.color }} />
                          )}
                          {s.name}
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* Título */}
            <div className="space-y-1.5">
              <Label>Título (opcional)</Label>
              <Input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Ex.: Reunião de proposta"
                maxLength={120}
                className={showErrors && errors.title ? 'border-destructive' : ''}
              />
              {showErrors && errors.title && (
                <p className="text-xs text-destructive">{errors.title}</p>
              )}
            </div>

            {/* Início / Fim */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Início *</Label>
                <Input
                  type="datetime-local"
                  value={startAt}
                  onChange={(e) => handleStartChange(e.target.value)}
                  className={showErrors && errors.start ? 'border-destructive' : ''}
                />
                {showErrors && errors.start && (
                  <p className="text-xs text-destructive">{errors.start}</p>
                )}
              </div>
              <div className="space-y-1.5">
                <Label>Fim * {selectedReason ? `(padrão ${selectedReason.default_duration_minutes}min)` : ''}</Label>
                <Input
                  type="datetime-local"
                  value={endAt}
                  onChange={(e) => setEndAt(e.target.value)}
                  className={showErrors && errors.end ? 'border-destructive' : ''}
                />
                {showErrors && errors.end && (
                  <p className="text-xs text-destructive">{errors.end}</p>
                )}
              </div>
            </div>

            {/* Quick slots */}
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Duração rápida</Label>
              <div className="flex flex-wrap gap-1.5">
                {QUICK_DURATIONS.map(d => {
                  const active = currentDuration === d;
                  return (
                    <Button
                      key={d}
                      type="button"
                      size="sm"
                      variant={active ? 'secondary' : 'outline'}
                      className="h-8 px-3 text-xs"
                      onClick={() => applyDuration(d)}
                    >
                      {durationLabel(d)}
                    </Button>
                  );
                })}
              </div>
            </div>

            {/* Conflito */}
            {hasConflict && (
              <Alert variant="destructive" className="border-destructive/40 bg-destructive/10">
                <AlertTriangle className="h-4 w-4" />
                <AlertTitle className="text-sm">Conflito de horário</AlertTitle>
                <AlertDescription className="text-xs space-y-1 mt-1">
                  <p>Este profissional já tem {conflicts.length === 1 ? 'um compromisso' : `${conflicts.length} compromissos`} neste intervalo:</p>
                  <ul className="list-disc list-inside space-y-0.5">
                    {conflicts.slice(0, 3).map(c => (
                      <li key={c.id} className="truncate">
                        {format(new Date(c.start_at), "dd/MM HH:mm", { locale: ptBR })} – {format(new Date(c.end_at), 'HH:mm')} · {c.title || 'Sem título'}
                      </li>
                    ))}
                  </ul>
                </AlertDescription>
              </Alert>
            )}

            {/* Local + Link */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Local</Label>
                <Input
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                  placeholder="Ex.: Sala 2"
                  maxLength={200}
                  className={showErrors && errors.location ? 'border-destructive' : ''}
                />
                {showErrors && errors.location && (
                  <p className="text-xs text-destructive">{errors.location}</p>
                )}
              </div>
              <div className="space-y-1.5">
                <Label>Link da reunião</Label>
                <div className="flex items-center gap-1.5">
                  <Input
                    value={meetingUrl}
                    onChange={(e) => setMeetingUrl(e.target.value)}
                    placeholder="https://meet…"
                    className={showErrors && errors.meetingUrl ? 'border-destructive' : ''}
                  />
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="shrink-0 h-9 px-2"
                    onClick={generateMeetLink}
                    title="Gerar link Meet (placeholder)"
                  >
                    <Wand2 className="w-3.5 h-3.5 mr-1" />
                    <Video className="w-3.5 h-3.5" />
                  </Button>
                </div>
                {showErrors && errors.meetingUrl && (
                  <p className="text-xs text-destructive">{errors.meetingUrl}</p>
                )}
              </div>
            </div>

            {/* Anotações */}
            <div className="space-y-1.5">
              <Label>Anotações</Label>
              <Textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={3}
                placeholder="Contexto, detalhes, links de referência…"
                maxLength={2000}
                className={showErrors && errors.notes ? 'border-destructive' : ''}
              />
              {showErrors && errors.notes && (
                <p className="text-xs text-destructive">{errors.notes}</p>
              )}
            </div>

            {/* Checklist de pauta */}
            <AgendaChecklist items={checklist} onChange={setChecklist} />
      </div>
    </StandardDrawer>
  );
}
