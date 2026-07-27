import { useState, useEffect } from 'react';
import { Save, Loader2, Trophy, XCircle, RotateCcw, Info, History, Plus, Tag } from 'lucide-react';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { useCreateLead, useUpdateLead } from '@/hooks/useLeads';
import { useTeamMembers } from '@/hooks/useTeamMembers';
import { useCreateLeadActivity } from '@/hooks/useLeadActivities';
import { useLeadOutcome } from '@/hooks/useLeadOutcome';
import { LeadOutcomeDialog } from '../LeadOutcomeDialog';
import { useFullLeadData } from './hooks';
import { LeadHeader } from './LeadHeader';
import { LeadInfoSection } from './LeadInfoSection';
import { LeadTagsSection } from './LeadTagsSection';
import { HistoryTab } from './HistoryTab';
import { ClosedLeadBanner } from './ClosedLeadBanner';
import { toast } from 'sonner';


export interface LeadDetailModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  lead: {
    id: string;
    name: string;
    phone: string | null;
    email: string | null;
    value: number | null;
    status: string;
    notes?: string | null;
    assigned_to?: string | null;
    created_at: string;
  } | null;
  /** Modo criação: quando lead é null, abre o drawer em branco para criar lead na etapa indicada. */
  pipelineId?: string | null;
  stageId?: string | null;
  stageName?: string | null;
  defaultAssignedTo?: string | null;
  prefill?: { name?: string; phone?: string; email?: string } | null;
  onCreated?: (leadId: string) => void;
}

const EMPTY = {
  name: '', phone: '', email: '', value: '', notes: '',
  assigned_to: null as string | null, status: 'new',
  document: '', company_name: '', source: '', birth_date: '',
  medical_doctor_id: null as string | null,
  medical_procedure_id: null as string | null,
  insurance_id: null as string | null,
  facility_id: null as string | null,
  insurance_card_number: '' as string,
};

type TabKey = 'info' | 'tags' | 'history';

export function LeadDetailModal({
  open,
  onOpenChange,
  lead,
  pipelineId,
  stageId,
  stageName,
  defaultAssignedTo,
  prefill,
  onCreated,
}: LeadDetailModalProps) {
  const isCreating = !lead;

  const [edited, setEdited] = useState({ ...EMPTY });
  const [outcomeDialog, setOutcomeDialog] = useState<{ open: boolean; mode: 'won' | 'lost' }>({ open: false, mode: 'won' });
  const [tab, setTab] = useState<TabKey>('info');

  const isMedical = false;
  const { data: fullLead } = useFullLeadData(lead?.id || null);
  const { data: teamMembers } = useTeamMembers();
  const updateLead = useUpdateLead();
  const createLead = useCreateLead();
  const createLeadActivity = useCreateLeadActivity();
  const { reopen: reopenLead } = useLeadOutcome();

  useEffect(() => {
    if (open) setTab('info');
  }, [open, lead?.id]);

  useEffect(() => {
    if (!open) return;
    if (isCreating) {
      setEdited({
        ...EMPTY,
        name: prefill?.name ?? '',
        phone: prefill?.phone ?? '',
        email: prefill?.email ?? '',
        assigned_to: defaultAssignedTo ?? null,
      });
      return;
    }
    const src: any = fullLead || lead;
    if (!src) return;
    setEdited({
      name: src.name || '',
      phone: src.phone || '',
      email: src.email || '',
      value: src.value?.toString() || '',
      notes: src.notes || '',
      assigned_to: src.assigned_to || null,
      status: src.status || 'new',
      document: src.document || '',
      company_name: src.company_name || '',
      source: src.source || '',
      birth_date: src.birth_date || '',
      medical_doctor_id: src.medical_doctor_id ?? null,
      medical_procedure_id: src.medical_procedure_id ?? null,
      insurance_id: src.insurance_id ?? null,
      facility_id: src.facility_id ?? null,
      insurance_card_number: src.insurance_card_number ?? '',
    });
  }, [open, isCreating, lead, fullLead, prefill, defaultAssignedTo]);

  const updateField = (field: string, value: string | null) =>
    setEdited((prev) => ({ ...prev, [field]: value as any }));

  const parseValue = (v: any): number | null => {
    if (v === '' || v === null || v === undefined) return null;
    const n = Number(String(v).replace(/\./g, '').replace(',', '.'));
    return Number.isFinite(n) ? n : null;
  };

  const handleSave = () => {
    const src: any = fullLead || lead;
    if (!src) return;
    const candidate: Record<string, any> = {
      name: edited.name,
      phone: edited.phone || null,
      email: edited.email || null,
      value: parseValue(edited.value),
      notes: edited.notes || null,
      assigned_to: edited.assigned_to,
      document: edited.document || null,
      company_name: edited.company_name || null,
      source: edited.source || null,
      birth_date: edited.birth_date || null,
      medical_doctor_id: edited.medical_doctor_id || null,
      insurance_id: edited.insurance_id || null,
      facility_id: edited.facility_id || null,
      insurance_card_number: edited.insurance_card_number?.trim() || null,
    };

    const norm = (v: any) => (v === '' || v === undefined ? null : v);
    const changed: Record<string, any> = {};
    for (const k of Object.keys(candidate)) {
      if (norm(src?.[k]) !== norm(candidate[k])) changed[k] = candidate[k];
    }

    if (Object.keys(changed).length === 0) {
      onOpenChange(false);
      return;
    }

    const beforeName = (src?.name || '').trim();
    const afterName = (changed.name ?? '').toString().trim();
    const nameChanged = 'name' in changed && beforeName !== afterName;

    updateLead.mutate(
      { id: src.id, ...(changed as any) },
      {
        onSuccess: () => {
          if (nameChanged) {
            createLeadActivity.mutate({
              leadId: src.id,
              actionType: 'name_updated',
              description: `Nome da oportunidade alterado de "${beforeName || '—'}" para "${afterName || '—'}"`,
              metadata: { from: beforeName, to: afterName },
            });
          }
          onOpenChange(false);
        },
      }
    );
  };

  const handleCreate = () => {
    const cleanName = edited.name.trim();
    if (!cleanName) {
      toast.error('Informe o nome do lead');
      return;
    }
    createLead.mutate(
      {
        name: cleanName,
        phone: edited.phone || null,
        email: edited.email || null,
        value: parseValue(edited.value),
        notes: edited.notes || null,
        assigned_to: edited.assigned_to,
        pipeline_id: pipelineId ?? null,
        stage_id: stageId ?? null,
        status: 'new',
        document: edited.document || null,
        company_name: edited.company_name || null,
        source: edited.source || null,
        birth_date: edited.birth_date || null,
        medical_doctor_id: edited.medical_doctor_id || null,
        insurance_id: edited.insurance_id || null,
        facility_id: edited.facility_id || null,
        insurance_card_number: edited.insurance_card_number?.trim() || null,
      } as any,
      {
        onSuccess: (data: any) => {
          if (data?.id) onCreated?.(data.id);
          onOpenChange(false);
        },
      },
    );
  };

  const isClosed = edited.status === 'won' || edited.status === 'lost';

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-xl h-[100dvh] overflow-hidden p-0 flex flex-col">
        {isCreating ? (
          <SheetHeader className="px-5 pt-5 pb-4 border-b border-border shrink-0">
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-full bg-primary/15 flex items-center justify-center shrink-0 border-2 border-primary/30">
                <Plus className="w-5 h-5 text-primary" />
              </div>
              <div className="min-w-0 flex-1">
                <SheetTitle className="text-base truncate">
                  {edited.name.trim() || 'Novo Lead'}
                </SheetTitle>
                <p className="text-xs text-muted-foreground mt-0.5 truncate">
                  {stageName ? <>Etapa: <span className="text-foreground">{stageName}</span></> : 'Preencha os dados iniciais'}
                </p>
              </div>
            </div>
          </SheetHeader>
        ) : (
          <LeadHeader
            edited={edited}
            fallbackName={lead!.name}
            createdAt={lead!.created_at}
            fullLead={fullLead}
            leadId={lead!.id}
          />
        )}

        {!isCreating && isClosed && <ClosedLeadBanner status={edited.status as 'won' | 'lost'} />}

        <Tabs value={tab} onValueChange={(v) => setTab(v as TabKey)} className="flex-1 flex flex-col min-h-0">
          <div className="px-5 pt-3 border-b border-border shrink-0">
            <TabsList className="bg-transparent p-0 h-auto gap-1 flex-wrap">
              <TabsTrigger
                value="info"
                className="data-[state=active]:bg-card data-[state=active]:text-foreground data-[state=active]:shadow-none text-muted-foreground rounded-b-none rounded-t-md border border-transparent data-[state=active]:border-border data-[state=active]:border-b-card -mb-px px-3 py-2 text-xs font-medium gap-1.5"
              >
                <Info className="w-3.5 h-3.5 text-primary" /> Informações
              </TabsTrigger>
              {!isCreating && (
                <TabsTrigger
                  value="tags"
                  className="data-[state=active]:bg-card data-[state=active]:text-foreground data-[state=active]:shadow-none text-muted-foreground rounded-b-none rounded-t-md border border-transparent data-[state=active]:border-border data-[state=active]:border-b-card -mb-px px-3 py-2 text-xs font-medium gap-1.5"
                >
                  <Tag className="w-3.5 h-3.5 text-primary" /> Tags
                </TabsTrigger>
              )}
              {!isCreating && (
                <TabsTrigger
                  value="attachments"
                  className="data-[state=active]:bg-card data-[state=active]:text-foreground data-[state=active]:shadow-none text-muted-foreground rounded-b-none rounded-t-md border border-transparent data-[state=active]:border-border data-[state=active]:border-b-card -mb-px px-3 py-2 text-xs font-medium gap-1.5"
                >
                  <Paperclip className="w-3.5 h-3.5 text-primary" /> Anexos
                </TabsTrigger>
              )}
              {isMedical && (
                <TabsTrigger
                  value="medical"
                  className="data-[state=active]:bg-card data-[state=active]:text-foreground data-[state=active]:shadow-none text-muted-foreground rounded-b-none rounded-t-md border border-transparent data-[state=active]:border-border data-[state=active]:border-b-card -mb-px px-3 py-2 text-xs font-medium gap-1.5"
                >
                  <Stethoscope className="w-3.5 h-3.5 text-primary" /> Dados Médicos
                </TabsTrigger>
              )}
              {!isCreating && (
                <TabsTrigger
                  value="history"
                  className="data-[state=active]:bg-card data-[state=active]:text-foreground data-[state=active]:shadow-none text-muted-foreground rounded-b-none rounded-t-md border border-transparent data-[state=active]:border-border data-[state=active]:border-b-card -mb-px px-3 py-2 text-xs font-medium gap-1.5"
                >
                  <History className="w-3.5 h-3.5 text-primary" /> Histórico
                </TabsTrigger>
              )}
            </TabsList>
          </div>

          <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain">
            <TabsContent value="info" className="m-0 px-5 py-5 space-y-5">
              {isCreating ? (
                <CreateInfoSection
                  edited={edited}
                  updateField={updateField}
                  teamMembers={teamMembers}
                />
              ) : (
                <LeadInfoSection
                  leadId={lead!.id}
                  edited={edited}
                  updateField={updateField}
                  teamMembers={teamMembers}
                  locked={isClosed}
                />
              )}
            </TabsContent>

            {!isCreating && (
              <TabsContent value="tags" className="m-0 px-5 py-5 space-y-5">
                <LeadTagsSection leadId={lead!.id} locked={isClosed} />
              </TabsContent>
            )}

            {!isCreating && (
              <TabsContent value="attachments" className="m-0 px-5 py-5 space-y-5">
                <LeadMedicalAttachmentsSection leadId={lead!.id} locked={isClosed} />
              </TabsContent>
            )}

            {isMedical && (
              <TabsContent value="medical" className="m-0 px-5 py-5 space-y-5">
                <LeadMedicalCard
                  values={{
                    medical_doctor_id: edited.medical_doctor_id,
                    medical_procedure_id: edited.medical_procedure_id,
                    insurance_id: edited.insurance_id,
                    facility_id: edited.facility_id,
                    insurance_card_number: edited.insurance_card_number,
                  }}
                  onChange={(field, value) => updateField(field, value)}
                  hideProcedure={!isCreating}
                  disabled={!isCreating && isClosed}
                />
                {!isCreating && (
                  <>
                    <LeadProceduresSection leadId={lead!.id} locked={isClosed} />
                    <LeadMedicalNotesSection leadId={lead!.id} locked={isClosed} />
                  </>
                )}
                {isCreating && (
                  <p className="text-xs text-muted-foreground">
                    Procedimentos e notas clínicas ficam disponíveis após criar o lead.
                  </p>
                )}
              </TabsContent>
            )}

            {!isCreating && (
              <TabsContent value="history" className="m-0 px-5 py-5 space-y-4">
                <HistoryTab leadId={lead!.id} />
              </TabsContent>
            )}
          </div>
        </Tabs>

        <div className="px-5 py-4 border-t border-border shrink-0 space-y-2">
          {isCreating ? (
            <Button onClick={handleCreate} disabled={createLead.isPending} className="w-full h-10">
              {createLead.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Plus className="w-4 h-4 mr-2" />}
              Criar Lead
            </Button>
          ) : isClosed ? (
            <Button
              variant="outline"
              onClick={() => reopenLead.mutate(lead!.id)}
              disabled={reopenLead.isPending}
              className="w-full h-10"
            >
              {reopenLead.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <RotateCcw className="w-4 h-4 mr-2" />}
              Reabrir lead
            </Button>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-2">
                <Button onClick={() => setOutcomeDialog({ open: true, mode: 'won' })} className="h-10 bg-emerald-600 hover:bg-emerald-700 text-white">
                  <Trophy className="w-4 h-4 mr-2" /> Ganho
                </Button>
                <Button onClick={() => setOutcomeDialog({ open: true, mode: 'lost' })} variant="destructive" className="h-10">
                  <XCircle className="w-4 h-4 mr-2" /> Perdido
                </Button>
              </div>
              <Button onClick={handleSave} disabled={updateLead.isPending} className="w-full h-10">
                {updateLead.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Save className="w-4 h-4 mr-2" />}
                Salvar Alterações
              </Button>
            </>
          )}
        </div>
      </SheetContent>

      {!isCreating && (
        <LeadOutcomeDialog
          open={outcomeDialog.open}
          onOpenChange={(o) => setOutcomeDialog((s) => ({ ...s, open: o }))}
          mode={outcomeDialog.mode}
          leadId={lead!.id}
          leadName={edited.name || lead!.name}
        />
      )}
    </Sheet>
  );
}

// Versão simplificada da seção Informações para o modo criação (sem dependência de leadId).
function CreateInfoSection({
  edited,
  updateField,
  teamMembers,
}: {
  edited: any;
  updateField: (field: string, value: string | null) => void;
  teamMembers: any[] | undefined;
}) {
  return (
    <section className="rounded-xl border border-border bg-card/40 p-4 space-y-5">


      <div className="space-y-1.5">
        <label className="text-sm font-medium">Nome</label>
        <input
          autoFocus
          className="w-full h-10 rounded-md border border-border/60 bg-background px-3 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
          value={edited.name}
          onChange={(e) => updateField('name', e.target.value)}
          maxLength={120}
          placeholder="Informe o nome do lead"
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <label className="text-sm font-medium">Telefone</label>
          <input
            className="w-full h-10 rounded-md border border-border/60 bg-background px-3 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
            value={edited.phone}
            onChange={(e) => updateField('phone', e.target.value)}
            placeholder="(11) 99999-9999"
          />
        </div>
        <div className="space-y-1.5">
          <label className="text-sm font-medium">E-mail</label>
          <input
            type="email"
            className="w-full h-10 rounded-md border border-border/60 bg-background px-3 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
            value={edited.email}
            onChange={(e) => updateField('email', e.target.value)}
            placeholder="email@exemplo.com"
          />
        </div>
      </div>

      <div className="space-y-1.5">
        <label className="text-sm font-medium">Responsável</label>
        <select
          className="w-full h-10 rounded-md border border-border/60 bg-background px-3 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
          value={edited.assigned_to || ''}
          onChange={(e) => updateField('assigned_to', e.target.value || null)}
        >
          <option value="">Não atribuído</option>
          {teamMembers?.map((m) => (
            <option key={m.id} value={m.id}>{m.name}</option>
          ))}
        </select>
      </div>

      <div className="space-y-1.5">
        <label className="text-sm font-medium">Observações</label>
        <textarea
          rows={3}
          placeholder="Adicione observações sobre este lead..."
          value={edited.notes}
          onChange={(e) => updateField('notes', e.target.value)}
          className="w-full rounded-md border border-border/60 bg-background px-3 py-2 text-sm resize-none focus:outline-none focus:ring-1 focus:ring-ring"
        />
      </div>

      <p className="text-xs text-muted-foreground">
        Tags, anexos e o valor calculado por procedimentos ficam disponíveis após criar o lead.
      </p>
    </section>
  );
}

export default LeadDetailModal;
