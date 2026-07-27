import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';

const TWO_MIN = 1000 * 60 * 2;

export type FinancialOverview = {
  leads: {
    total_value: number;
    won_value: number;
    lost_value: number;
    open_value: number;
    count_total: number;
    count_won: number;
    count_lost: number;
    count_open: number;
  };
  entries: {
    receivable_pending: number;
    receivable_paid: number;
    payable_pending: number;
    payable_paid: number;
    net_balance: number;
  };
};

export type FinancialEntry = {
  id: string;
  company_id: string;
  kind: 'receivable' | 'payable';
  category_id: string | null;
  cost_center_id: string | null;
  lead_id: string | null;
  contact_id: string | null;
  party_name: string | null;
  description: string;
  amount: number;
  discount: number;
  net_amount: number;
  paid_amount: number;
  due_date: string | null;
  paid_at: string | null;
  payment_method: string | null;
  status: 'draft' | 'pending' | 'partial' | 'paid' | 'overdue' | 'canceled';
  installment_number: number | null;
  installment_total: number | null;
  parent_entry_id: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
};

export type FinancialCategory = {
  id: string;
  company_id: string;
  name: string;
  kind: 'income' | 'expense';
  is_direct_cost: boolean;
  is_operational: boolean;
  is_system: boolean;
  color: string | null;
  archived: boolean;
};

export function useFinancialOverview(opts?: {
  dateFrom?: string | null;
  dateTo?: string | null;
  pipelineId?: string | null;
}) {
  const { profile } = useAuth();
  const companyId = profile?.company_id;
  return useQuery({
    queryKey: ['financial-overview', companyId, opts?.dateFrom ?? null, opts?.dateTo ?? null, opts?.pipelineId ?? null],
    enabled: !!companyId,
    staleTime: TWO_MIN,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_financial_overview' as any, {
        _company_id: companyId,
        _date_from: opts?.dateFrom ?? null,
        _date_to: opts?.dateTo ?? null,
        _pipeline_id: opts?.pipelineId ?? null,
      });
      if (error) throw error;
      return data as unknown as FinancialOverview;
    },
  });
}

export function useFinancialEntries(kind: 'receivable' | 'payable', filters?: {
  status?: string | null;
  categoryId?: string | null;
  search?: string | null;
}) {
  const { profile } = useAuth();
  const companyId = profile?.company_id;
  return useQuery({
    queryKey: ['financial-entries', companyId, kind, filters?.status ?? null, filters?.categoryId ?? null, filters?.search ?? null],
    enabled: !!companyId,
    staleTime: TWO_MIN,
    queryFn: async () => {
      let q = supabase
        .from('financial_entries' as any)
        .select('*')
        .eq('company_id', companyId!)
        .eq('kind', kind)
        .order('due_date', { ascending: true, nullsFirst: false })
        .limit(500);
      if (filters?.status && filters.status !== 'all') q = q.eq('status', filters.status);
      if (filters?.categoryId) q = q.eq('category_id', filters.categoryId);
      if (filters?.search) q = q.ilike('description', `%${filters.search}%`);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as unknown as FinancialEntry[];
    },
  });
}

export function useFinancialCategories(kind?: 'income' | 'expense') {
  const { profile } = useAuth();
  const companyId = profile?.company_id;
  return useQuery({
    queryKey: ['financial-categories', companyId, kind ?? 'all'],
    enabled: !!companyId,
    staleTime: TWO_MIN * 2,
    queryFn: async () => {
      let q = supabase
        .from('financial_categories' as any)
        .select('*')
        .eq('company_id', companyId!)
        .eq('archived', false)
        .order('kind')
        .order('name');
      if (kind) q = q.eq('kind', kind);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as unknown as FinancialCategory[];
    },
  });
}

export function useCreateFinancialEntry() {
  const qc = useQueryClient();
  const { profile } = useAuth();
  return useMutation({
    mutationFn: async (input: Partial<FinancialEntry> & { description: string; amount: number; kind: 'receivable' | 'payable' }) => {
      if (!profile?.company_id) throw new Error('Sem empresa');
      const payload: any = {
        company_id: profile.company_id,
        created_by: profile.id,
        status: 'pending',
        ...input,
      };
      const { data, error } = await supabase.from('financial_entries' as any).insert(payload).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['financial-entries'] });
      qc.invalidateQueries({ queryKey: ['financial-overview'] });
      toast.success('Lançamento criado');
    },
    onError: (e: any) => toast.error(e.message ?? 'Falha ao criar lançamento'),
  });
}

export function useUpdateFinancialEntry() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: Partial<FinancialEntry> }) => {
      const { error } = await supabase.from('financial_entries' as any).update(patch as any).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['financial-entries'] });
      qc.invalidateQueries({ queryKey: ['financial-overview'] });
    },
    onError: (e: any) => toast.error(e.message ?? 'Falha ao atualizar'),
  });
}

export function useMarkEntryPaid() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { entryId: string; paidAmount?: number; paidAt?: string; paymentMethod?: string }) => {
      const { error } = await supabase.rpc('financial_mark_paid' as any, {
        _entry_id: input.entryId,
        _paid_amount: input.paidAmount ?? null,
        _paid_at: input.paidAt ?? new Date().toISOString(),
        _payment_method: input.paymentMethod ?? null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['financial-entries'] });
      qc.invalidateQueries({ queryKey: ['financial-overview'] });
      toast.success('Lançamento baixado');
    },
    onError: (e: any) => toast.error(e.message ?? 'Falha ao dar baixa'),
  });
}

export function useCreateCategory() {
  const qc = useQueryClient();
  const { profile } = useAuth();
  return useMutation({
    mutationFn: async (input: { name: string; kind: 'income' | 'expense'; color?: string; is_direct_cost?: boolean; is_operational?: boolean }) => {
      if (!profile?.company_id) throw new Error('Sem empresa');
      const { error } = await supabase.from('financial_categories' as any).insert({
        company_id: profile.company_id,
        ...input,
      } as any);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['financial-categories'] });
      toast.success('Categoria criada');
    },
    onError: (e: any) => toast.error(e.message ?? 'Falha'),
  });
}

export function useArchiveCategory() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('financial_categories' as any).update({ archived: true } as any).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['financial-categories'] });
      toast.success('Categoria arquivada');
    },
    onError: (e: any) => toast.error(e.message ?? 'Falha'),
  });
}

// ===================== Dashboard (cross-data) =====================
export type FinancialDashboard = {
  period: { from: string; to: string; prev_from: string; prev_to: string };
  kpis: {
    revenue_won: number; revenue_won_prev: number;
    received: number; received_prev: number;
    to_receive: number;
    paid_out: number; paid_out_prev: number;
    to_pay: number;
    net_profit: number; net_profit_prev: number;
    margin_pct: number;
    avg_ticket: number; avg_ticket_prev: number;
    win_rate: number; win_rate_prev: number;
    count_total: number; count_won: number; count_lost: number; count_open: number;
    open_value: number; lost_value: number;
  };
  cashflow: Array<{ day: string; received: number; paid_out: number }>;
  funnel: Array<{ status: string; value: number; count: number }>;
  by_category: Array<{ name: string; color: string; value: number }>;
  aging: Array<{ bucket: string; value: number; count: number }>;
  top_customers: Array<{ name: string; value: number; count: number }>;
  upcoming: Array<{ id: string; kind: 'receivable' | 'payable'; description: string; due_date: string; amount: number; party_name: string | null; status: string }>;
  owners: Array<{ user_id: string | null; name: string; won_value: number; won_count: number; closed_count: number }>;
};

export function useFinancialDashboard(opts: {
  dateFrom: string;
  dateTo: string;
  pipelineId?: string | null;
  assignedTo?: string | null;
}) {
  const { profile } = useAuth();
  const companyId = profile?.company_id;
  return useQuery({
    queryKey: ['financial-dashboard', companyId, opts.dateFrom, opts.dateTo, opts.pipelineId ?? null, opts.assignedTo ?? null],
    enabled: !!companyId,
    staleTime: TWO_MIN,
    placeholderData: (prev) => prev,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_financial_dashboard' as any, {
        _company_id: companyId,
        _date_from: opts.dateFrom,
        _date_to: opts.dateTo,
        _pipeline_id: opts.pipelineId ?? null,
        _assigned_to: opts.assignedTo ?? null,
      });
      if (error) throw error;
      return data as unknown as FinancialDashboard;
    },
  });
}
