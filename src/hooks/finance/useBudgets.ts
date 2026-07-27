import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { uploadFileWithProgress } from '@/lib/uploadFileWithProgress';

const ONE_MIN = 60_000;

export type BudgetOrderBy =
  | 'created_at' | 'value' | 'net_value' | 'payment_method'
  | 'pipeline_name' | 'stage_name' | 'name' | 'numeric_id'
  | 'payment_confirmed_at' | 'invoice_number' | 'assigned_to_name';
export type OrderDir = 'asc' | 'desc';

export interface BudgetFilters {
  periodStart: string;
  periodEnd: string;
  pipelineId?: string | null;
  assignedTo?: string | null;
  search?: string | null;
  orderBy?: BudgetOrderBy;
  orderDir?: OrderDir;
  status?: string | null;
}

export interface BudgetKpi {
  total_value: number;
  won_value: number;
  lost_value: number;
  open_value: number;
  count_total: number;
  count_won: number;
  count_lost: number;
  count_open: number;
  avg_ticket: number;
  projection: number;
  gross_revenue: number;
  discount_total: number;
}

export interface BudgetOverview {
  period: { start: string; end: string };
  previous_period: { start: string; end: string };
  current: BudgetKpi;
  previous: BudgetKpi;
}

export interface BudgetRow {
  id: string;
  numeric_id: number;
  tenant_seq?: number | null;
  name: string;
  status: string | null;
  value: number | null;
  discount_pct: number | null;
  discount_amount: number | null;
  net_value: number | null;
  payment_method: string | null;
  payment_installments: number | null;
  payment_reference: string | null;
  payment_confirmed_at: string | null;
  invoice_number: string | null;
  finance_notes: string | null;
  assigned_to: string | null;
  pipeline_id: string | null;
  stage_id: string | null;
  created_at: string;
  pipeline_name: string | null;
  stage_name: string | null;
  stage_color: string | null;
  stage_type: string | null;
  assigned_to_name: string | null;
  attachments_count: number;
}

export function useBudgetOverview(filters: BudgetFilters) {
  return useQuery({
    queryKey: ['budget-overview', filters.periodStart, filters.periodEnd, filters.pipelineId, filters.assignedTo],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_budget_overview', {
        _period_start: filters.periodStart,
        _period_end: filters.periodEnd,
        _pipeline_id: filters.pipelineId || null,
        _assigned_to: filters.assignedTo || null,
      });
      if (error) throw error;
      return data as unknown as BudgetOverview;
    },
    staleTime: ONE_MIN,
    refetchOnWindowFocus: false,
    placeholderData: (prev) => prev,
  });
}

export function useLeadBudgets(filters: BudgetFilters, page = 0, pageSize = 50) {
  return useQuery({
    queryKey: ['lead-budgets', filters, page, pageSize],
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc('list_lead_budgets', {
        _period_start: filters.periodStart,
        _period_end: filters.periodEnd,
        _pipeline_id: filters.pipelineId || null,
        _assigned_to: filters.assignedTo || null,
        _search: filters.search || null,
        _order_by: filters.orderBy ?? 'created_at',
        _order_dir: filters.orderDir ?? 'desc',
        _limit: pageSize,
        _offset: page * pageSize,
        _status: filters.status || null,
      });
      if (error) throw error;
      return data as unknown as { total: number; items: BudgetRow[] };
    },
    staleTime: ONE_MIN,
    refetchOnWindowFocus: false,
    placeholderData: (prev) => prev,
  });
}

const invalidateBudgets = (qc: ReturnType<typeof useQueryClient>) => {
  qc.invalidateQueries({ queryKey: ['lead-budgets'] });
  qc.invalidateQueries({ queryKey: ['budget-overview'] });
  qc.invalidateQueries({ queryKey: ['leads'] });
  qc.invalidateQueries({ queryKey: ['financial-overview'] });
};

export function useUpdateLeadPaymentMethod() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ leadId, method, installments }: { leadId: string; method: string | null; installments?: number | null }) => {
      const { error } = await supabase
        .from('leads')
        .update({ payment_method: method, payment_installments: installments ?? 1 })
        .eq('id', leadId);
      if (error) throw error;
    },
    onSuccess: () => { invalidateBudgets(qc); toast.success('Forma de pagamento atualizada'); },
    onError: (e: any) => toast.error('Erro ao atualizar', { description: e?.message }),
  });
}

export function useReleaseDiscount() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ leadId, pct, amount, reason, password }: { leadId: string; pct: number | null; amount: number | null; reason: string; password: string }) => {
      const { data, error } = await supabase.rpc('release_lead_discount', {
        _lead_id: leadId, _discount_pct: pct, _discount_amount: amount, _reason: reason, _password: password,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => { invalidateBudgets(qc); toast.success('Desconto liberado'); },
    onError: (e: any) => {
      const map: Record<string, string> = {
        senha_invalida: 'Senha incorreta', forbidden: 'Sem permissão',
        ficha_fechada: 'Ficha já fechada', desconto_invalido: 'Valor de desconto inválido',
      };
      toast.error('Não foi possível liberar', { description: map[e?.message] ?? e?.message });
    },
  });
}

export function useReleaseProcedureDiscount() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ procId, leadId: _l, pct, amount, reason, password }: { procId: string; leadId: string; pct: number | null; amount: number | null; reason: string; password: string }) => {
      const { data, error } = await (supabase as any).rpc('release_lead_procedure_discount', {
        _proc_id: procId, _discount_pct: pct, _discount_amount: amount, _reason: reason, _password: password,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: (_d, v) => {
      qc.invalidateQueries({ queryKey: ['lead-procedures', v.leadId] });
      qc.invalidateQueries({ queryKey: ['lead-history', v.leadId] });
      invalidateBudgets(qc);
      toast.success('Desconto do item liberado');
    },
    onError: (e: any) => {
      const map: Record<string, string> = {
        senha_invalida: 'Senha incorreta', forbidden: 'Sem permissão',
        ficha_fechada: 'Ficha já fechada', desconto_invalido: 'Valor de desconto inválido',
        item_not_found: 'Item não encontrado',
      };
      toast.error('Não foi possível liberar', { description: map[e?.message] ?? e?.message });
    },
  });
}

export interface LeadHistoryEntry {
  id: string;
  lead_id: string;
  event_type: string;
  actor_user_id: string | null;
  actor_name: string | null;
  payload: any;
  created_at: string;
}

export function useLeadHistory(leadId: string | null) {
  return useQuery({
    queryKey: ['lead-history', leadId],
    enabled: !!leadId,
    staleTime: 30_000,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('lead_history')
        .select('*')
        .eq('lead_id', leadId)
        .order('created_at', { ascending: false })
        .limit(200);
      if (error) throw error;
      return (data ?? []) as LeadHistoryEntry[];
    },
  });
}

export function useConfirmPayment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (args: {
      leadId: string; method: string; installments?: number;
      reference?: string | null; invoiceNumber?: string | null; notes?: string | null;
    }) => {
      const { error } = await (supabase as any).rpc('confirm_lead_payment', {
        _lead_id: args.leadId,
        _method: args.method,
        _installments: args.installments ?? 1,
        _reference: args.reference ?? null,
        _invoice_number: args.invoiceNumber ?? null,
        _notes: args.notes ?? null,
      });
      if (error) throw error;
    },
    onSuccess: () => { invalidateBudgets(qc); toast.success('Pagamento confirmado'); },
    onError: (e: any) => {
      const map: Record<string, string> = {
        metodo_obrigatorio: 'Selecione um método de pagamento',
        forbidden: 'Sem permissão',
      };
      toast.error('Falha ao confirmar', { description: map[e?.message] ?? e?.message });
    },
  });
}

export function useUpdateLeadFinance() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ leadId, patch }: { leadId: string; patch: Record<string, any> }) => {
      const { error } = await (supabase as any).rpc('update_lead_finance', { _lead_id: leadId, _patch: patch });
      if (error) throw error;
    },
    onSuccess: () => invalidateBudgets(qc),
    onError: (e: any) => toast.error('Erro ao salvar', { description: e?.message }),
  });
}

export function useUpdateProcedureDiscount() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ procId, pct, amount, leadId: _l }: { procId: string; leadId: string; pct: number | null; amount: number | null }) => {
      const { error } = await (supabase as any).rpc('update_lead_procedure_discount', {
        _proc_id: procId, _pct: pct, _amount: amount,
      });
      if (error) throw error;
    },
    onSuccess: (_d, v) => {
      qc.invalidateQueries({ queryKey: ['lead-procedures', v.leadId] });
      invalidateBudgets(qc);
    },
    onError: (e: any) => toast.error('Erro no desconto', { description: e?.message }),
  });
}

export interface PaymentAttachment {
  id: string;
  lead_id: string;
  kind: 'receipt' | 'invoice' | 'other';
  storage_path: string;
  file_name: string;
  mime_type: string | null;
  size_bytes: number | null;
  created_at: string;
}

export function useLeadPaymentAttachments(leadId: string | null) {
  return useQuery({
    queryKey: ['lead-payment-attachments', leadId],
    enabled: !!leadId,
    staleTime: 30_000,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('lead_payment_attachments')
        .select('id, lead_id, kind, storage_path, file_name, mime_type, size_bytes, created_at')
        .eq('lead_id', leadId!)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as PaymentAttachment[];
    },
  });
}

export function useUploadPaymentAttachment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ leadId, companyId, file, kind }: { leadId: string; companyId: string; file: File; kind: 'receipt' | 'invoice' | 'other' }) => {
      const safeName = file.name.replace(/[^\w.\-]+/g, '_');
      const path = `${companyId}/leads/${leadId}/${Date.now()}-${safeName}`;
      await uploadFileWithProgress({ bucket: 'financial-docs', path, file });
      const { error } = await (supabase as any).from('lead_payment_attachments').insert({
        lead_id: leadId, company_id: companyId, kind,
        storage_path: path, file_name: file.name, mime_type: file.type, size_bytes: file.size,
      });
      if (error) throw error;
    },
    onSuccess: (_d, v) => {
      qc.invalidateQueries({ queryKey: ['lead-payment-attachments', v.leadId] });
      invalidateBudgets(qc);
      toast.success('Anexo enviado');
    },
    onError: (e: any) => toast.error('Falha no upload', { description: e?.message }),
  });
}

export function useDeletePaymentAttachment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, leadId, storagePath }: { id: string; leadId: string; storagePath: string }) => {
      await supabase.storage.from('financial-docs').remove([storagePath]);
      const { error } = await (supabase as any).from('lead_payment_attachments').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: (_d, v) => {
      qc.invalidateQueries({ queryKey: ['lead-payment-attachments', v.leadId] });
      invalidateBudgets(qc);
      toast.success('Anexo removido');
    },
    onError: (e: any) => toast.error('Erro ao remover', { description: e?.message }),
  });
}

export async function getAttachmentSignedUrl(storagePath: string) {
  const { data, error } = await supabase.storage.from('financial-docs').createSignedUrl(storagePath, 60 * 10);
  if (error || !data?.signedUrl) throw error ?? new Error('Sem URL');
  return data.signedUrl;
}

export const PAYMENT_METHODS = [
  'Pix',
  'Dinheiro',
  'Cartão de Crédito',
  'Cartão de Débito',
  'Boleto',
  'Transferência',
  'Convênio',
  'Outro',
] as const;

export const PAYMENT_REFERENCE_LABEL: Record<string, string> = {
  'Pix': 'ID da transação Pix',
  'Dinheiro': 'Nº do recibo',
  'Cartão de Crédito': 'Nº do canhoto / NSU',
  'Cartão de Débito': 'Nº do canhoto / NSU',
  'Boleto': 'Nosso número / linha digitável',
  'Transferência': 'Comprovante / TED',
  'Convênio': 'Nº de autorização do convênio',
  'Outro': 'Referência',
};
