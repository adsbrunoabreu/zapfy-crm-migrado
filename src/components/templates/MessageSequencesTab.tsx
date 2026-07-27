import { useEffect, useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Plus, Pencil, Trash2, GripVertical, Clock, Users } from 'lucide-react';
import { toast } from 'sonner';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import {
  DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors, type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy, arrayMove,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

type TriggerType = 'manual' | 'lead_created' | 'stage_changed' | 'tag_added';

type Sequence = {
  id: string; name: string; description: string | null; is_active: boolean;
  trigger_type: TriggerType; trigger_config: Record<string, any>;
  business_hours_only: boolean; stop_on_reply: boolean; stop_on_won_lost: boolean;
  created_at: string;
};

type Step = {
  id: string;
  position: number;
  template_id: string | null;
  body_override: string | null;
  delay_minutes: number;
};

type Template = { id: string; name: string };

const TRIGGER_LABEL: Record<TriggerType, string> = {
  manual: 'Manual',
  lead_created: 'Lead criado',
  stage_changed: 'Etapa do pipeline',
  tag_added: 'Tag adicionada',
};

const fmtDelay = (m: number) => {
  if (!m) return 'imediato';
  if (m < 60) return `${m} min`;
  if (m < 1440) return `${Math.round(m / 60)} h`;
  return `${Math.round(m / 1440)} d`;
};

export function MessageSequencesTab() {
  const { profile } = useAuth();
  const qc = useQueryClient();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [delTarget, setDelTarget] = useState<Sequence | null>(null);

  const { data: sequences = [], isLoading } = useQuery({
    queryKey: ['msg-sequences', profile?.company_id],
    enabled: !!profile?.company_id,
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.from('message_sequences')
        .select('*').order('created_at', { ascending: false }).limit(100);
      if (error) throw error;
      return (data || []) as Sequence[];
    },
  });

  const { data: enrollCounts = {} } = useQuery({
    queryKey: ['seq-enroll-counts', profile?.company_id],
    enabled: !!profile?.company_id && sequences.length > 0,
    staleTime: 60_000,
    queryFn: async () => {
      const { data } = await supabase
        .from('message_sequence_enrollments')
        .select('sequence_id')
        .eq('status', 'active')
        .limit(1000);
      const map: Record<string, number> = {};
      (data || []).forEach((r: any) => { map[r.sequence_id] = (map[r.sequence_id] || 0) + 1; });
      return map;
    },
  });

  const toggleActive = useMutation({
    mutationFn: async ({ id, is_active }: { id: string; is_active: boolean }) => {
      const { error } = await supabase.from('message_sequences').update({ is_active }).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['msg-sequences'] }),
  });

  const del = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('message_sequences').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success('Fluxo removido'); qc.invalidateQueries({ queryKey: ['msg-sequences'] }); setDelTarget(null); },
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">Sequências automáticas de mensagens disparadas por gatilho ou manualmente no lead.</p>
        <Button onClick={() => { setEditingId(null); setOpen(true); }}><Plus className="h-4 w-4 mr-2" />Novo fluxo</Button>
      </div>

      {isLoading ? (
        <div className="text-sm text-muted-foreground">Carregando…</div>
      ) : sequences.length === 0 ? (
        <Card className="p-8 text-center text-sm text-muted-foreground">Nenhum fluxo criado ainda.</Card>
      ) : (
        <div className="grid gap-3">
          {sequences.map((s) => (
            <Card key={s.id} className="p-4 flex items-center gap-4">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-medium">{s.name}</span>
                  <Badge variant="secondary" className="text-[10px]">{TRIGGER_LABEL[s.trigger_type]}</Badge>
                  {s.business_hours_only && <Badge variant="outline" className="text-[10px]">Horário comercial</Badge>}
                </div>
                {s.description && <div className="text-xs text-muted-foreground mt-0.5">{s.description}</div>}
                <div className="flex items-center gap-3 text-xs text-muted-foreground mt-1">
                  <span className="inline-flex items-center gap-1"><Users className="h-3 w-3" /> {enrollCounts[s.id] || 0} ativos</span>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Switch checked={s.is_active} onCheckedChange={(v) => toggleActive.mutate({ id: s.id, is_active: v })} />
                <Button size="icon" variant="ghost" onClick={() => { setEditingId(s.id); setOpen(true); }}><Pencil className="h-4 w-4" /></Button>
                <Button size="icon" variant="ghost" onClick={() => setDelTarget(s)}><Trash2 className="h-4 w-4" /></Button>
              </div>
            </Card>
          ))}
        </div>
      )}

      <SequenceDialog
        open={open}
        onOpenChange={setOpen}
        sequenceId={editingId}
        onSaved={() => { qc.invalidateQueries({ queryKey: ['msg-sequences'] }); setOpen(false); }}
      />
      <ConfirmDialog
        open={!!delTarget}
        onOpenChange={(v) => { if (!v) setDelTarget(null); }}
        title="Excluir fluxo?"
        description={`"${delTarget?.name}" e suas inscrições ativas serão removidos.`}
        confirmLabel="Excluir"
        onConfirm={() => delTarget && del.mutate(delTarget.id)}
      />
    </div>
  );
}

// ============================================================
// Sequence editor dialog (form + steps editor with DnD)
// ============================================================

function SequenceDialog({
  open, onOpenChange, sequenceId, onSaved,
}: { open: boolean; onOpenChange: (v: boolean) => void; sequenceId: string | null; onSaved: () => void }) {
  const { profile } = useAuth();
  const isEdit = !!sequenceId;

  const { data: seq } = useQuery({
    queryKey: ['sequence', sequenceId],
    enabled: open && !!sequenceId,
    queryFn: async () => {
      const { data, error } = await supabase.from('message_sequences').select('*').eq('id', sequenceId!).maybeSingle();
      if (error) throw error;
      return data as Sequence;
    },
  });

  const { data: existingSteps = [] } = useQuery({
    queryKey: ['sequence-steps', sequenceId],
    enabled: open && !!sequenceId,
    queryFn: async () => {
      const { data, error } = await supabase.from('message_sequence_steps')
        .select('id, position, template_id, body_override, delay_minutes')
        .eq('sequence_id', sequenceId!).order('position', { ascending: true });
      if (error) throw error;
      return (data || []) as Step[];
    },
  });

  const { data: templates = [] } = useQuery({
    queryKey: ['msg-templates-min', profile?.company_id],
    enabled: open && !!profile?.company_id,
    queryFn: async () => {
      const { data, error } = await supabase.from('message_templates').select('id, name').eq('is_active', true).order('name').limit(200);
      if (error) throw error;
      return (data || []) as Template[];
    },
  });

  const { data: stages = [] } = useQuery({
    queryKey: ['stages-for-seq', profile?.company_id],
    enabled: open && !!profile?.company_id,
    queryFn: async () => {
      const { data: pps } = await supabase.from('pipelines').select('id').eq('company_id', profile!.company_id).limit(20);
      const ids = (pps || []).map((p: any) => p.id);
      if (ids.length === 0) return [];
      const { data } = await supabase.from('pipeline_stages').select('id, name, pipeline_id').in('pipeline_id', ids).order('position');
      return (data || []) as { id: string; name: string; pipeline_id: string }[];
    },
  });

  const { data: tags = [] } = useQuery({
    queryKey: ['tags-for-seq', profile?.company_id],
    enabled: open && !!profile?.company_id,
    queryFn: async () => {
      const { data } = await supabase.from('tags').select('id, name').eq('company_id', profile!.company_id).order('name').limit(200);
      return (data || []) as { id: string; name: string }[];
    },
  });

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [triggerType, setTriggerType] = useState<TriggerType>('manual');
  const [triggerStageId, setTriggerStageId] = useState<string>('');
  const [triggerTagId, setTriggerTagId] = useState<string>('');
  const [triggerSource, setTriggerSource] = useState<string>('');
  const [businessOnly, setBusinessOnly] = useState(false);
  const [stopReply, setStopReply] = useState(true);
  const [stopWonLost, setStopWonLost] = useState(true);
  const [steps, setSteps] = useState<Array<Step & { tempId: string }>>([]);
  const [synced, setSynced] = useState(false);

  // Sync from server when opening
  useEffect(() => {
    if (!open) { setSynced(false); return; }
    if (synced) return;
    if (seq) {
      setName(seq.name); setDescription(seq.description || '');
      setTriggerType(seq.trigger_type);
      setTriggerStageId(String(seq.trigger_config?.stage_id || ''));
      setTriggerTagId(String(seq.trigger_config?.tag_id || ''));
      setTriggerSource(String(seq.trigger_config?.source || ''));
      setBusinessOnly(seq.business_hours_only);
      setStopReply(seq.stop_on_reply); setStopWonLost(seq.stop_on_won_lost);
      setSteps((existingSteps || []).map((s, i) => ({ ...s, tempId: s.id || `t${i}` })));
      setSynced(true);
    } else if (!isEdit) {
      setName(''); setDescription(''); setTriggerType('manual');
      setTriggerStageId(''); setTriggerTagId(''); setTriggerSource('');
      setBusinessOnly(false); setStopReply(true); setStopWonLost(true);
      setSteps([{ tempId: crypto.randomUUID(), id: '', position: 0, template_id: null, body_override: '', delay_minutes: 0 }]);
      setSynced(true);
    }
  }, [open, seq, existingSteps, isEdit, synced]);

  const sensors = useSensors(useSensor(PointerSensor), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }));

  const handleDragEnd = (e: DragEndEvent) => {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const oldIdx = steps.findIndex((s) => s.tempId === active.id);
    const newIdx = steps.findIndex((s) => s.tempId === over.id);
    if (oldIdx < 0 || newIdx < 0) return;
    setSteps((prev) => arrayMove(prev, oldIdx, newIdx));
  };

  const updateStep = (tempId: string, patch: Partial<Step>) => setSteps((prev) => prev.map((s) => s.tempId === tempId ? { ...s, ...patch } : s));
  const removeStep = (tempId: string) => setSteps((prev) => prev.filter((s) => s.tempId !== tempId));
  const addStep = () => {
    if (steps.length >= 20) { toast.error('Máximo de 20 passos'); return; }
    setSteps((prev) => [...prev, { tempId: crypto.randomUUID(), id: '', position: prev.length, template_id: null, body_override: '', delay_minutes: prev.length === 0 ? 0 : 60 }]);
  };

  const save = useMutation({
    mutationFn: async () => {
      if (!name.trim()) throw new Error('Nome é obrigatório');
      if (steps.length === 0) throw new Error('Adicione ao menos um passo');
      for (const s of steps) {
        if (!s.template_id && !s.body_override?.trim()) throw new Error('Cada passo precisa de template ou texto');
      }
      const triggerConfig: Record<string, any> = {};
      if (triggerType === 'stage_changed') triggerConfig.stage_id = triggerStageId || undefined;
      if (triggerType === 'tag_added') triggerConfig.tag_id = triggerTagId || undefined;
      if (triggerType === 'lead_created' && triggerSource) triggerConfig.source = triggerSource;

      const seqPayload = {
        company_id: profile!.company_id, name: name.trim(), description: description.trim() || null,
        trigger_type: triggerType, trigger_config: triggerConfig,
        business_hours_only: businessOnly, stop_on_reply: stopReply, stop_on_won_lost: stopWonLost,
        is_active: true,
      };

      let id = sequenceId;
      if (isEdit) {
        const { error } = await supabase.from('message_sequences').update(seqPayload).eq('id', id!);
        if (error) throw error;
      } else {
        const { data, error } = await supabase.from('message_sequences').insert({ ...seqPayload, created_by: profile!.id }).select('id').single();
        if (error) throw error;
        id = data.id;
      }

      // Replace steps wholesale
      await supabase.from('message_sequence_steps').delete().eq('sequence_id', id!);
      const rows = steps.map((s, i) => ({
        sequence_id: id!, position: i,
        template_id: s.template_id || null,
        body_override: s.body_override?.trim() || null,
        delay_minutes: Math.max(0, Math.floor(s.delay_minutes || 0)),
      }));
      const { error: stErr } = await supabase.from('message_sequence_steps').insert(rows);
      if (stErr) throw stErr;
    },
    onSuccess: () => { toast.success('Fluxo salvo'); onSaved(); },
    onError: (e: any) => toast.error('Erro ao salvar', { description: e.message }),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader className="shrink-0"><DialogTitle>{isEdit ? 'Editar fluxo' : 'Novo fluxo'}</DialogTitle></DialogHeader>

        <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain space-y-4 -mx-1 px-1">
          <div className="grid gap-3 md:grid-cols-2">
            <div>
              <Label>Nome</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex.: Cadência pós-cadastro" />
            </div>
            <div>
              <Label>Descrição</Label>
              <Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Opcional" />
            </div>
          </div>

          <div>
            <Label>Gatilho</Label>
            <RadioGroup value={triggerType} onValueChange={(v) => setTriggerType(v as TriggerType)} className="grid grid-cols-2 md:grid-cols-4 gap-2 mt-1">
              {(['manual', 'lead_created', 'stage_changed', 'tag_added'] as TriggerType[]).map((t) => (
                <label key={t} className="flex items-center gap-2 rounded border border-border px-3 py-2 cursor-pointer hover:bg-muted/40">
                  <RadioGroupItem value={t} id={`tt-${t}`} />
                  <span className="text-sm">{TRIGGER_LABEL[t]}</span>
                </label>
              ))}
            </RadioGroup>

            {triggerType === 'stage_changed' && (
              <div className="mt-2">
                <Label>Quando o lead entrar na etapa</Label>
                <Select value={triggerStageId} onValueChange={setTriggerStageId}>
                  <SelectTrigger><SelectValue placeholder="Selecione a etapa" /></SelectTrigger>
                  <SelectContent>{stages.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            )}
            {triggerType === 'tag_added' && (
              <div className="mt-2">
                <Label>Quando receber a tag</Label>
                <Select value={triggerTagId} onValueChange={setTriggerTagId}>
                  <SelectTrigger><SelectValue placeholder="Selecione a tag" /></SelectTrigger>
                  <SelectContent>{tags.map((t) => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            )}
            {triggerType === 'lead_created' && (
              <div className="mt-2">
                <Label>Filtrar por origem (opcional)</Label>
                <Input value={triggerSource} onChange={(e) => setTriggerSource(e.target.value)} placeholder="Ex.: facebook" />
              </div>
            )}
          </div>

          <div className="grid grid-cols-3 gap-3 text-sm">
            <label className="flex items-center justify-between rounded border border-border px-3 py-2">
              Só horário comercial
              <Switch checked={businessOnly} onCheckedChange={setBusinessOnly} />
            </label>
            <label className="flex items-center justify-between rounded border border-border px-3 py-2">
              Parar se cliente responder
              <Switch checked={stopReply} onCheckedChange={setStopReply} />
            </label>
            <label className="flex items-center justify-between rounded border border-border px-3 py-2">
              Parar se ganho/perdido
              <Switch checked={stopWonLost} onCheckedChange={setStopWonLost} />
            </label>
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <Label>Passos do fluxo</Label>
              <Button size="sm" variant="outline" onClick={addStep}><Plus className="h-3.5 w-3.5 mr-1" />Adicionar passo</Button>
            </div>
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
              <SortableContext items={steps.map((s) => s.tempId)} strategy={verticalListSortingStrategy}>
                <div className="space-y-2">
                  {steps.map((s, i) => (
                    <StepRow key={s.tempId} step={s} index={i} templates={templates}
                      onChange={(p) => updateStep(s.tempId, p)} onRemove={() => removeStep(s.tempId)} />
                  ))}
                </div>
              </SortableContext>
            </DndContext>
            {steps.length === 0 && <p className="text-xs text-muted-foreground">Nenhum passo ainda.</p>}
          </div>
        </div>

        <DialogFooter className="shrink-0">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={() => save.mutate()} disabled={save.isPending}>{save.isPending ? 'Salvando…' : 'Salvar fluxo'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function StepRow({
  step, index, templates, onChange, onRemove,
}: {
  step: Step & { tempId: string };
  index: number;
  templates: Template[];
  onChange: (p: Partial<Step>) => void;
  onRemove: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: step.tempId });
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1 };

  return (
    <div ref={setNodeRef} style={style} className="rounded border border-border bg-muted/40 p-3">
      <div className="flex items-start gap-2">
        <button {...attributes} {...listeners} className="text-muted-foreground hover:text-foreground mt-1 cursor-grab" aria-label="Arrastar">
          <GripVertical className="h-4 w-4" />
        </button>
        <div className="flex-1 grid gap-2">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Clock className="h-3 w-3" /> Passo {index + 1} — atraso após o anterior:
            <Input
              type="number" min={0}
              value={step.delay_minutes}
              onChange={(e) => onChange({ delay_minutes: Number(e.target.value) })}
              className="w-20 h-7"
            />
            <span>min ({fmtDelay(step.delay_minutes)})</span>
          </div>
          <div className="grid md:grid-cols-2 gap-2">
            <div>
              <Label className="text-xs">Template</Label>
              <Select value={step.template_id || ''} onValueChange={(v) => onChange({ template_id: v || null })}>
                <SelectTrigger className="h-9"><SelectValue placeholder="Selecione um template" /></SelectTrigger>
                <SelectContent>
                  {templates.map((t) => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Ou texto custom (opcional)</Label>
              <Textarea
                value={step.body_override || ''}
                onChange={(e) => onChange({ body_override: e.target.value })}
                rows={2} placeholder="Ignora template se preenchido"
              />
            </div>
          </div>
        </div>
        <Button size="icon" variant="ghost" onClick={onRemove}><Trash2 className="h-4 w-4" /></Button>
      </div>
    </div>
  );
}
