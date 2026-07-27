import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export interface Product {
  id: string;
  company_id: string;
  name: string;
  sku: string | null;
  base_price: number;
  active: boolean;
  created_at: string;
  updated_at: string;
}

export function useProducts(opts?: { onlyActive?: boolean }) {
  const onlyActive = opts?.onlyActive ?? false;
  return useQuery({
    queryKey: ['products', { onlyActive }],
    staleTime: 120_000,
    queryFn: async () => {
      let q = (supabase as any)
        .from('products')
        .select('id, company_id, name, sku, base_price, active, created_at, updated_at')
        .order('name', { ascending: true })
        .limit(500);
      if (onlyActive) q = q.eq('active', true);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as Product[];
    },
  });
}

export function useCreateProduct() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (p: { name: string; sku?: string | null; base_price: number; active?: boolean }) => {
      const { data: prof } = await supabase.from('profiles').select('company_id').eq('id', (await supabase.auth.getUser()).data.user!.id).maybeSingle();
      if (!prof?.company_id) throw new Error('Empresa não encontrada');
      const { data, error } = await (supabase as any)
        .from('products')
        .insert({
          company_id: prof.company_id,
          name: p.name.trim(),
          sku: p.sku?.trim() || null,
          base_price: Number(p.base_price) || 0,
          active: p.active ?? true,
        })
        .select('id')
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['products'] }),
    onError: (e: any) => toast.error('Erro ao criar produto: ' + (e.message ?? '')),
  });
}

export function useUpdateProduct() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...patch }: { id: string; name?: string; sku?: string | null; base_price?: number; active?: boolean }) => {
      const clean: Record<string, any> = {};
      if (patch.name !== undefined) clean.name = patch.name.trim();
      if (patch.sku !== undefined) clean.sku = patch.sku?.trim() || null;
      if (patch.base_price !== undefined) clean.base_price = Number(patch.base_price) || 0;
      if (patch.active !== undefined) clean.active = patch.active;
      const { error } = await (supabase as any).from('products').update(clean).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['products'] }),
    onError: (e: any) => toast.error('Erro ao atualizar produto: ' + (e.message ?? '')),
  });
}

export function useDeleteProduct() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase as any).from('products').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['products'] }),
    onError: (e: any) => toast.error('Erro ao excluir produto: ' + (e.message ?? '')),
  });
}
