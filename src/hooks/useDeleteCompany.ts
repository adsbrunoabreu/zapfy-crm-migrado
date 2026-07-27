import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface CompanyDataCounts {
  users: number;
  leads: number;
  conversations: number;
}

export async function fetchCompanyDataCounts(companyId: string): Promise<CompanyDataCounts> {
  const [u, l, c] = await Promise.all([
    supabase.from('profiles').select('id', { count: 'exact', head: true }).eq('company_id', companyId),
    supabase.from('leads').select('id', { count: 'exact', head: true }).eq('company_id', companyId),
    supabase.from('conversations').select('id', { count: 'exact', head: true }).eq('company_id', companyId),
  ]);
  return {
    users: u.count || 0,
    leads: l.count || 0,
    conversations: c.count || 0,
  };
}

export function useDeleteCompany() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (companyId: string) => {
      const { data, error } = await supabase.functions.invoke('admin-delete-company', {
        body: { company_id: companyId },
      });
      if (error) {
        const ctx: any = (error as any).context;
        let serverMsg: string | undefined;
        try {
          const json = typeof ctx === 'string' ? JSON.parse(ctx) : ctx?.body ? JSON.parse(ctx.body) : ctx;
          serverMsg = json?.error;
        } catch {}
        throw new Error(serverMsg || error.message);
      }
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['companies'] });
    },
  });
}
