import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface PendingUser {
  id: string;
  email: string;
  full_name: string | null;
  role: string;
  created_at: string;
}

export function usePendingUsers() {
  return useQuery({
    queryKey: ['admin', 'pending-users'],
    queryFn: async (): Promise<PendingUser[]> => {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, email, full_name, role, created_at')
        .is('company_id', null)
        .neq('role', 'master')
        .order('created_at', { ascending: false })
        .limit(500);
      if (error) throw error;
      return (data || []) as PendingUser[];
    },
    staleTime: 60_000,
  });
}

type TenantRole = 'admin' | 'gestor' | 'financeiro' | 'agente';

export function useLinkUserToCompany() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ user_id, company_id, role = 'admin' }: { user_id: string; company_id: string; role?: TenantRole }) => {
      const { error } = await supabase
        .from('profiles')
        .update({ company_id, role, is_active: true })
        .eq('id', user_id);
      if (error) throw error;
      await supabase.from('user_roles').delete().eq('user_id', user_id);
      const { error: rErr } = await supabase.from('user_roles').insert({ user_id, role } as any);
      if (rErr) throw rErr;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin', 'pending-users'] });
      qc.invalidateQueries({ queryKey: ['admin', 'users'] });
      qc.invalidateQueries({ queryKey: ['admin', 'companies'] });
    },
  });
}

export function useCreateCompanyForUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ user_id, company_name }: { user_id: string; company_name: string }) => {
      const { data: company, error: cErr } = await supabase
        .from('companies')
        .insert({ name: company_name, plan_status: 'trial' })
        .select('id')
        .single();
      if (cErr) throw cErr;
      const { error: pErr } = await supabase
        .from('profiles')
        .update({ company_id: company.id, role: 'admin', is_active: true })
        .eq('id', user_id);
      if (pErr) throw pErr;
      await supabase.from('user_roles').delete().eq('user_id', user_id);
      await supabase.from('user_roles').insert({ user_id, role: 'admin' } as any);
      return company;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin', 'pending-users'] });
      qc.invalidateQueries({ queryKey: ['admin', 'users'] });
      qc.invalidateQueries({ queryKey: ['admin', 'companies'] });
    },
  });
}
