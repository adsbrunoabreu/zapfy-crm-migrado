import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export interface LeadProcedure {
  id: string;
  lead_id: string;
  medical_procedure_id: string | null;
  product_id: string | null;
  item_type: 'service' | 'product';
  company_id: string;
  created_at: string;
  price_snapshot: number | null;
  quantity: number;
  discount_pct: number | null;
  discount_amount: number | null;
  net_price: number | null;
  procedure?: { id: string; name: string; base_price: number | null } | null;
  product?: { id: string; name: string; base_price: number | null; sku: string | null } | null;
}

const INVALIDATE_KEYS = [
  'lead-procedures',
  'lead-full',
  'pipeline-leads',
  'pipeline-totals',
  'leads',
  'dashboard',
  'my-dashboard',
  'report-leads',
  'pipeline-performance',
  'financial-overview',
];

function invalidateAll(qc: ReturnType<typeof useQueryClient>, leadId?: string) {
  qc.invalidateQueries({ queryKey: ['lead-procedures', leadId] });
  qc.invalidateQueries({ queryKey: ['lead-full', leadId] });
  for (const k of INVALIDATE_KEYS.slice(2)) {
    qc.invalidateQueries({ queryKey: [k] });
  }
}

export function useLeadProcedures(leadId: string | null) {
  return useQuery({
    queryKey: ['lead-procedures', leadId],
    enabled: !!leadId,
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('lead_procedures')
        .select('id, lead_id, medical_procedure_id, product_id, item_type, company_id, created_at, price_snapshot, quantity, discount_pct, discount_amount, net_price, procedure:medical_procedures(id, name, base_price), product:products(id, name, base_price, sku)')
        .eq('lead_id', leadId!)
        .order('created_at', { ascending: true });
      if (error) throw error;
      return (data ?? []) as LeadProcedure[];
    },
  });
}

export function useAddLeadProcedure() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ leadId, procedureId }: { leadId: string; procedureId: string }) => {
      // Se já existe linha para esse procedimento, incrementa quantidade
      const { data: existing, error: selErr } = await (supabase as any)
        .from('lead_procedures')
        .select('id, quantity')
        .eq('lead_id', leadId)
        .eq('medical_procedure_id', procedureId)
        .maybeSingle();
      if (selErr) throw selErr;

      if (existing?.id) {
        const newQty = Math.min(999, (Number(existing.quantity) || 1) + 1);
        const { error } = await (supabase as any)
          .from('lead_procedures')
          .update({ quantity: newQty })
          .eq('id', existing.id);
        if (error) throw error;
        return { bumped: true };
      }

      const { error } = await (supabase as any)
        .from('lead_procedures')
        .insert({ lead_id: leadId, medical_procedure_id: procedureId });
      if (error) throw error;
      return { bumped: false };
    },
    onSuccess: (res, v) => {
      invalidateAll(qc, v.leadId);
      if (res?.bumped) toast.success('Quantidade atualizada');
    },
    onError: (e: any) => toast.error('Erro ao adicionar procedimento: ' + (e.message ?? '')),
  });
}

export function useAddLeadProduct() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ leadId, productId }: { leadId: string; productId: string }) => {
      // Se já existe linha para esse produto, incrementa quantidade
      const { data: existing, error: selErr } = await (supabase as any)
        .from('lead_procedures')
        .select('id, quantity')
        .eq('lead_id', leadId)
        .eq('product_id', productId)
        .eq('item_type', 'product')
        .maybeSingle();
      if (selErr) throw selErr;

      if (existing?.id) {
        const newQty = Math.min(999, (Number(existing.quantity) || 1) + 1);
        const { error } = await (supabase as any)
          .from('lead_procedures')
          .update({ quantity: newQty })
          .eq('id', existing.id);
        if (error) throw error;
        return { bumped: true };
      }

      // Snapshot do preço do produto
      const { data: prod, error: prodErr } = await (supabase as any)
        .from('products')
        .select('base_price, name, company_id')
        .eq('id', productId)
        .single();
      if (prodErr) throw prodErr;

      const { error } = await (supabase as any)
        .from('lead_procedures')
        .insert({
          lead_id: leadId,
          product_id: productId,
          item_type: 'product',
          company_id: prod.company_id,
          price_snapshot: prod.base_price ?? 0,
          item_name_snapshot: prod.name,
          quantity: 1,
        });
      if (error) throw error;
      return { bumped: false };
    },
    onSuccess: (res, v) => {
      invalidateAll(qc, v.leadId);
      if (res?.bumped) toast.success('Quantidade do produto atualizada');
    },
    onError: (e: any) => toast.error('Erro ao adicionar produto: ' + (e.message ?? '')),
  });
}


export function useUpdateProcedureQuantity() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, quantity }: { id: string; leadId: string; quantity: number }) => {
      const q = Math.max(1, Math.min(999, Math.floor(Number(quantity) || 1)));
      const { error } = await (supabase as any)
        .from('lead_procedures')
        .update({ quantity: q })
        .eq('id', id);
      if (error) throw error;
    },
    onMutate: async ({ id, leadId, quantity }) => {
      const key = ['lead-procedures', leadId];
      await qc.cancelQueries({ queryKey: key });
      const prev = qc.getQueryData<LeadProcedure[]>(key);
      const q = Math.max(1, Math.min(999, Math.floor(Number(quantity) || 1)));
      if (prev) {
        qc.setQueryData<LeadProcedure[]>(key, prev.map((p) =>
          p.id === id ? { ...p, quantity: q } : p
        ));
      }
      return { prev, key };
    },
    onError: (e: any, _v, ctx) => {
      if (ctx?.prev && ctx.key) qc.setQueryData(ctx.key, ctx.prev);
      toast.error('Erro ao atualizar quantidade: ' + (e.message ?? ''));
    },
    onSettled: (_d, _e, v) => invalidateAll(qc, v.leadId),
  });
}


export function useRemoveLeadProcedure() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id }: { id: string; leadId: string }) => {
      const { error } = await (supabase as any)
        .from('lead_procedures').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: (_d, v) => invalidateAll(qc, v.leadId),
    onError: (e: any) => toast.error('Erro ao remover procedimento: ' + (e.message ?? '')),
  });
}
