import { useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Loader2, Search, Users, AlertTriangle, ChevronLeft, ChevronRight, Calendar as CalIcon, Sparkles } from 'lucide-react';
import { toast } from 'sonner';
import { renderWithLead, detectMissingVariables, type LeadForTemplate } from '@/components/templates/renderTemplateWithLead';
import { WhatsAppPreview } from '@/components/messaging/WhatsAppPreview';

type Template = {
  id: string;
  name: string;
  category: string | null;
  body: string;
  media_url: string | null;
  media_mimetype: string | null;
  media_filename: string | null;
};

type LeadRow = LeadForTemplate & {
  pipeline_id: string | null;
  stage_id: string | null;
};

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}

export function ScheduleWizard({ open, onOpenChange }: Props) {
  const { profile } = useAuth();
  const qc = useQueryClient();
  const [step, setStep] = useState<1 | 2 | 3>(1);

  // Step 1: template
  const [templateId, setTemplateId] = useState<string | null>(null);
  const [editedBody, setEditedBody] = useState<string>('');

  // Step 2: leads + filters
  const [pipelineId, setPipelineId] = useState<string>('all');
  const [stageId, setStageId] = useState<string>('all');
  const [search, setSearch] = useState('');
  const [selectedLeadIds, setSelectedLeadIds] = useState<Set<string>>(new Set());

  // Step 3: schedule
  const [sendAt, setSendAt] = useState<string>(() => {
    const d = new Date();
    d.setMinutes(d.getMinutes() + 30);
    d.setSeconds(0, 0);
    return format(d, "yyyy-MM-dd'T'HH:mm");
  });
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) {
      // reset
      setStep(1);
      setTemplateId(null);
      setEditedBody('');
      setPipelineId('all');
      setStageId('all');
      setSearch('');
      setSelectedLeadIds(new Set());
      setSubmitting(false);
    }
  }, [open]);

  // ==== queries ====
  const { data: templates = [] } = useQuery({
    queryKey: ['wizard-templates', profile?.company_id],
    enabled: open && !!profile?.company_id,
    staleTime: 120_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('message_templates')
        .select('id,name,category,body,media_url,media_mimetype,media_filename,is_active')
        .eq('is_active', true)
        .order('name')
        .limit(200);
      if (error) throw error;
      return (data || []) as Template[];
    },
  });

  const { data: pipelines = [] } = useQuery({
    queryKey: ['wizard-pipelines', profile?.company_id],
    enabled: open && !!profile?.company_id,
    staleTime: 120_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('pipelines')
        .select('id,name')
        .order('name')
        .limit(50);
      if (error) throw error;
      return data as { id: string; name: string }[];
    },
  });

  const { data: stages = [] } = useQuery({
    queryKey: ['wizard-stages', pipelineId],
    enabled: open && pipelineId !== 'all',
    staleTime: 120_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('pipeline_stages')
        .select('id,name,pipeline_id,position')
        .eq('pipeline_id', pipelineId)
        .order('position')
        .limit(50);
      if (error) throw error;
      return data as { id: string; name: string; pipeline_id: string }[];
    },
  });

  const { data: leads = [], isLoading: leadsLoading } = useQuery({
    queryKey: ['wizard-leads', profile?.company_id, pipelineId, stageId, search],
    enabled: open && !!profile?.company_id && step >= 2,
    staleTime: 30_000,
    queryFn: async () => {
      let q = supabase
        .from('leads')
        .select('id,name,phone,email,value,company_name,city,state,pipeline_id,stage_id,assigned_to,pipeline_stages(name)')
        .order('name')
        .limit(300);

      if (pipelineId !== 'all') q = q.eq('pipeline_id', pipelineId);
      if (stageId !== 'all') q = q.eq('stage_id', stageId);
      if (search.trim()) {
        const term = `%${search.trim()}%`;
        q = q.or(`name.ilike.${term},phone.ilike.${term},email.ilike.${term}`);
      }

      const { data, error } = await q;
      if (error) throw error;
      return (data || []).map((l: any) => ({
        ...l,
        stage_name: l.pipeline_stages?.name ?? null,
      })) as LeadRow[];
    },
  });

  // ==== derived ====
  const template = useMemo(() => templates.find((t) => t.id === templateId) ?? null, [templates, templateId]);
  const body = editedBody || template?.body || '';

  const previewLead: LeadForTemplate | null = useMemo(() => {
    const first = leads.find((l) => selectedLeadIds.has(l.id));
    return first || null;
  }, [leads, selectedLeadIds]);

  const preview = useMemo(() => renderWithLead(body, previewLead), [body, previewLead]);

  const missingByLead = useMemo(() => {
    const out: { lead: LeadRow; missing: string[] }[] = [];
    for (const l of leads) {
      if (!selectedLeadIds.has(l.id)) continue;
      const m = detectMissingVariables(body, l);
      if (m.length) out.push({ lead: l, missing: m });
    }
    return out;
  }, [leads, selectedLeadIds, body]);

  // ==== handlers ====
  const onPickTemplate = (id: string) => {
    setTemplateId(id);
    const t = templates.find((x) => x.id === id);
    setEditedBody(t?.body ?? '');
  };

  const toggleLead = (id: string) => {
    setSelectedLeadIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAllVisible = () => {
    const allIds = leads.map((l) => l.id);
    const allSelected = allIds.length > 0 && allIds.every((id) => selectedLeadIds.has(id));
    setSelectedLeadIds((prev) => {
      const next = new Set(prev);
      if (allSelected) allIds.forEach((id) => next.delete(id));
      else allIds.forEach((id) => next.add(id));
      return next;
    });
  };

  const canNext1 = !!template && body.trim().length > 0;
  const canNext2 = selectedLeadIds.size > 0;

  const handleSubmit = async () => {
    if (!profile?.company_id) return;
    if (!canNext1 || !canNext2) return;

    const when = new Date(sendAt);
    if (Number.isNaN(when.getTime())) {
      toast.error('Data/hora inválida');
      return;
    }
    if (when.getTime() < Date.now() - 60_000) {
      toast.error('A data deve ser no futuro');
      return;
    }

    setSubmitting(true);
    try {
      const selected = leads.filter((l) => selectedLeadIds.has(l.id));
      const messageType = template?.media_url ? guessMediaType(template.media_mimetype) : 'text';

      const rows = selected.map((lead) => ({
        company_id: profile.company_id,
        lead_id: lead.id,
        created_by: profile.id,
        message: messageType === 'text' ? renderWithLead(body, lead) : '',
        media_caption: messageType === 'text' ? null : renderWithLead(body, lead),
        send_at: when.toISOString(),
        message_type: messageType,
        media_url: template?.media_url ?? null,
        media_filename: template?.media_filename ?? null,
        media_mimetype: template?.media_mimetype ?? null,
      }));

      // Insert in chunks of 100
      const chunkSize = 100;
      for (let i = 0; i < rows.length; i += chunkSize) {
        const chunk = rows.slice(i, i + chunkSize);
        const { error } = await supabase.from('scheduled_messages').insert(chunk);
        if (error) throw error;
      }

      toast.success(`${rows.length} agendamento(s) criado(s)`);
      qc.invalidateQueries({ queryKey: ['all-scheduled-messages'] });
      onOpenChange(false);
    } catch (e: any) {
      toast.error('Erro ao agendar', { description: e.message });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl w-[calc(100vw-1rem)] h-[100dvh] sm:h-auto sm:max-h-[90vh] overflow-hidden p-4 sm:p-6 flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" />
            Assistente de agendamento
          </DialogTitle>
          <StepIndicator step={step} />
        </DialogHeader>

        <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-1 py-2">
          {step === 1 && (
            <Step1Template
              templates={templates}
              templateId={templateId}
              onPickTemplate={onPickTemplate}
              body={body}
              onBodyChange={setEditedBody}
              previewLead={previewLead}
              preview={preview}
            />
          )}

          {step === 2 && (
            <Step2Leads
              pipelines={pipelines}
              stages={stages}
              pipelineId={pipelineId}
              stageId={stageId}
              setPipelineId={(v) => { setPipelineId(v); setStageId('all'); }}
              setStageId={setStageId}
              search={search}
              setSearch={setSearch}
              leads={leads}
              loading={leadsLoading}
              selected={selectedLeadIds}
              toggle={toggleLead}
              toggleAll={toggleAllVisible}
            />
          )}

          {step === 3 && (
            <Step3Schedule
              sendAt={sendAt}
              setSendAt={setSendAt}
              total={selectedLeadIds.size}
              missingByLead={missingByLead}
              body={body}
              previewLead={previewLead}
              mediaUrl={template?.media_url ?? null}
              mediaMime={template?.media_mimetype ?? null}
              mediaName={template?.media_filename ?? null}
            />
          )}
        </div>

        <DialogFooter className="border-t border-border pt-3 flex items-center justify-between gap-2">
          <Button
            variant="outline"
            onClick={() => (step === 1 ? onOpenChange(false) : setStep((s) => (s - 1) as 1 | 2 | 3))}
            disabled={submitting}
          >
            <ChevronLeft className="h-4 w-4 mr-1" />
            {step === 1 ? 'Cancelar' : 'Voltar'}
          </Button>

          {step < 3 ? (
            <Button
              onClick={() => setStep((s) => (s + 1) as 1 | 2 | 3)}
              disabled={(step === 1 && !canNext1) || (step === 2 && !canNext2)}
            >
              Avançar
              <ChevronRight className="h-4 w-4 ml-1" />
            </Button>
          ) : (
            <Button onClick={handleSubmit} disabled={submitting}>
              {submitting ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <CalIcon className="h-4 w-4 mr-2" />}
              Agendar {selectedLeadIds.size} mensagem(ns)
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function guessMediaType(mime: string | null | undefined): 'text' | 'image' | 'video' | 'audio' | 'document' {
  if (!mime) return 'text';
  if (mime.startsWith('image/')) return 'image';
  if (mime.startsWith('video/')) return 'video';
  if (mime.startsWith('audio/')) return 'audio';
  return 'document';
}

function StepIndicator({ step }: { step: 1 | 2 | 3 }) {
  const items = [
    { n: 1, label: 'Template' },
    { n: 2, label: 'Leads' },
    { n: 3, label: 'Agendamento' },
  ];
  return (
    <div className="flex items-center gap-2 text-xs text-muted-foreground mt-2">
      {items.map((it, i) => (
        <div key={it.n} className="flex items-center gap-2">
          <div
            className={`h-5 w-5 rounded-full grid place-items-center text-[10px] font-medium ${
              step === it.n
                ? 'bg-primary text-primary-foreground'
                : step > it.n
                ? 'bg-emerald/20 text-emerald'
                : 'bg-muted/40 border border-border'
            }`}
          >
            {it.n}
          </div>
          <span className={step === it.n ? 'text-foreground' : ''}>{it.label}</span>
          {i < items.length - 1 && <ChevronRight className="h-3 w-3 opacity-50" />}
        </div>
      ))}
    </div>
  );
}

// ============== Step 1 ==============
function Step1Template({
  templates,
  templateId,
  onPickTemplate,
  body,
  onBodyChange,
  previewLead,
  preview,
}: {
  templates: Template[];
  templateId: string | null;
  onPickTemplate: (id: string) => void;
  body: string;
  onBodyChange: (v: string) => void;
  previewLead: LeadForTemplate | null;
  preview: string;
}) {
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <div className="space-y-3">
        <div>
          <Label>Selecione um template</Label>
          {templates.length === 0 ? (
            <div className="text-xs text-muted-foreground mt-2">
              Nenhum template ativo. Crie um em <span className="text-foreground">Templates &amp; Fluxos</span>.
            </div>
          ) : (
            <Select value={templateId ?? ''} onValueChange={onPickTemplate}>
              <SelectTrigger className="mt-1">
                <SelectValue placeholder="Escolha um template…" />
              </SelectTrigger>
              <SelectContent className="max-h-[300px]">
                {templates.map((t) => (
                  <SelectItem key={t.id} value={t.id}>
                    {t.name} {t.category ? <span className="text-xs text-muted-foreground">· {t.category}</span> : null}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>

        {templateId && (
          <div>
            <Label>Mensagem (você pode ajustar)</Label>
            <Textarea
              value={body}
              onChange={(e) => onBodyChange(e.target.value)}
              rows={10}
              className="mt-1 font-mono text-sm"
            />
            <div className="text-[11px] text-muted-foreground mt-1">
              Variáveis suportadas: <code>{'{{primeiro_nome}}'}</code>, <code>{'{{nome}}'}</code>, <code>{'{{telefone}}'}</code>, <code>{'{{valor}}'}</code>, <code>{'{{empresa}}'}</code>, <code>{'{{etapa}}'}</code>, <code>{'{{cidade}}'}</code>…
            </div>
          </div>
        )}
      </div>

      <div className="space-y-2">
        <WhatsAppPreview
          body={body}
          lead={previewLead}
          fallbackToExamples={!previewLead}
        />
        <p className="text-[11px] text-muted-foreground">
          {previewLead
            ? `Usando dados de: ${previewLead.name}`
            : 'Sem lead selecionado — usando valores de exemplo. Escolha leads na próxima etapa para ver o conteúdo real.'}
        </p>
      </div>
    </div>
  );
}

// ============== Step 2 ==============
function Step2Leads({
  pipelines,
  stages,
  pipelineId,
  stageId,
  setPipelineId,
  setStageId,
  search,
  setSearch,
  leads,
  loading,
  selected,
  toggle,
  toggleAll,
}: {
  pipelines: { id: string; name: string }[];
  stages: { id: string; name: string }[];
  pipelineId: string;
  stageId: string;
  setPipelineId: (v: string) => void;
  setStageId: (v: string) => void;
  search: string;
  setSearch: (v: string) => void;
  leads: LeadRow[];
  loading: boolean;
  selected: Set<string>;
  toggle: (id: string) => void;
  toggleAll: () => void;
}) {
  const allVisibleSelected = leads.length > 0 && leads.every((l) => selected.has(l.id));

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
        <Select value={pipelineId} onValueChange={setPipelineId}>
          <SelectTrigger><SelectValue placeholder="Pipeline" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos os pipelines</SelectItem>
            {pipelines.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={stageId} onValueChange={setStageId} disabled={pipelineId === 'all'}>
          <SelectTrigger><SelectValue placeholder="Etapa" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas as etapas</SelectItem>
            {stages.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
          </SelectContent>
        </Select>
        <div className="relative">
          <Search className="h-4 w-4 absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar nome, telefone, e-mail…" className="pl-8" />
        </div>
      </div>

      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <div className="flex items-center gap-2">
          <Users className="h-3.5 w-3.5" />
          {leads.length} resultado(s) · {selected.size} selecionado(s)
        </div>
        <button onClick={toggleAll} className="hover:text-foreground underline-offset-2 hover:underline" disabled={leads.length === 0}>
          {allVisibleSelected ? 'Desmarcar todos' : 'Selecionar todos visíveis'}
        </button>
      </div>

      <div className="rounded-md border border-border max-h-[360px] overflow-y-auto divide-y divide-border">
        {loading ? (
          <div className="p-6 text-center text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin inline mr-2" />Carregando…</div>
        ) : leads.length === 0 ? (
          <div className="p-6 text-center text-sm text-muted-foreground">Nenhum lead encontrado com os filtros atuais.</div>
        ) : (
          leads.map((l) => {
            const isSel = selected.has(l.id);
            return (
              <label key={l.id} className={`flex items-center gap-3 px-3 py-2 cursor-pointer hover:bg-muted/40 ${isSel ? 'bg-muted/30' : ''}`}>
                <Checkbox checked={isSel} onCheckedChange={() => toggle(l.id)} />
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium truncate">{l.name || '—'}</div>
                  <div className="text-[11px] text-muted-foreground truncate">
                    {l.phone || 'sem telefone'} {l.email ? `· ${l.email}` : ''} {l.stage_name ? `· ${l.stage_name}` : ''}
                  </div>
                </div>
                {!l.phone && (
                  <Badge variant="secondary" className="text-[10px] gap-1">
                    <AlertTriangle className="h-3 w-3" /> sem telefone
                  </Badge>
                )}
              </label>
            );
          })
        )}
      </div>
    </div>
  );
}

// ============== Step 3 ==============
function Step3Schedule({
  sendAt,
  setSendAt,
  total,
  missingByLead,
  body,
  previewLead,
  mediaUrl,
  mediaMime,
  mediaName,
}: {
  sendAt: string;
  setSendAt: (v: string) => void;
  total: number;
  missingByLead: { lead: LeadRow; missing: string[] }[];
  body: string;
  previewLead: LeadForTemplate | null;
  mediaUrl: string | null;
  mediaMime: string | null;
  mediaName: string | null;
}) {
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <div className="space-y-3">
        <div>
          <Label>Enviar em</Label>
          <Input type="datetime-local" value={sendAt} onChange={(e) => setSendAt(e.target.value)} className="mt-1" />
          <p className="text-[11px] text-muted-foreground mt-1">{total} mensagem(ns) serão criadas para envio neste horário.</p>
        </div>

        {missingByLead.length > 0 && (
          <div className="rounded-md border border-amber/40 bg-amber/10 p-3 text-xs space-y-2 max-h-[220px] overflow-y-auto">
            <div className="flex items-center gap-2 text-amber font-medium">
              <AlertTriangle className="h-3.5 w-3.5" />
              {missingByLead.length} lead(s) com variáveis sem dado
            </div>
            <p className="text-muted-foreground">
              Variáveis ausentes serão substituídas por vazio. Revise antes de agendar.
            </p>
            <ul className="space-y-1">
              {missingByLead.slice(0, 10).map(({ lead, missing }) => (
                <li key={lead.id} className="truncate">
                  <span className="text-foreground">{lead.name}</span>{' '}
                  <span className="text-muted-foreground">faltam: {missing.map((m) => `{{${m}}}`).join(', ')}</span>
                </li>
              ))}
              {missingByLead.length > 10 && <li className="text-muted-foreground">…e mais {missingByLead.length - 10}</li>}
            </ul>
          </div>
        )}
      </div>

      <div className="space-y-2">
        <WhatsAppPreview
          body={body}
          lead={previewLead}
          fallbackToExamples={!previewLead}
          mediaUrl={mediaUrl}
          mediaMimetype={mediaMime}
          mediaFilename={mediaName}
          scheduledFor={sendAt}
        />
        {previewLead && (
          <p className="text-[11px] text-muted-foreground">Mostrando preview para: {previewLead.name}</p>
        )}
      </div>
    </div>
  );
}
