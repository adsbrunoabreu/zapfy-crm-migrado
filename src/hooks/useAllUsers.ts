import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { Database } from '@/integrations/supabase/types';

type AppRole = Database['public']['Enums']['app_role'];

export interface AdminUser {
  id: string;
  email: string;
  full_name: string | null;
  avatar_url: string | null;
  phone: string | null;
  role: AppRole;
  company_id: string | null;
  company_name: string | null;
  is_active: boolean;
  is_online: boolean;
  last_seen: string | null;
  created_at: string;
}

export function useAllUsers() {
  return useQuery({
    queryKey: ['admin', 'users'],
    queryFn: async (): Promise<AdminUser[]> => {
      const { data, error } = await supabase
        .from('profiles')
        .select('*, companies(name)')
        .order('created_at', { ascending: false })
        .limit(1000);
      if (error) throw error;
      return (data || []).map((p: any) => ({
        ...p,
        company_name: p.companies?.name || null,
      }));
    },
  });
}

export function useUpdateUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      full_name,
      phone,
      company_id,
      is_active,
      role,
    }: {
      id: string;
      full_name?: string;
      phone?: string | null;
      company_id?: string | null;
      is_active?: boolean;
      role?: AppRole;
    }) => {
      const patch: Record<string, unknown> = {};
      if (full_name !== undefined) patch.full_name = full_name;
      if (phone !== undefined) patch.phone = phone;
      if (company_id !== undefined) patch.company_id = company_id;
      if (is_active !== undefined) patch.is_active = is_active;
      if (role !== undefined) patch.role = role;

      const { error, count } = await supabase
        .from('profiles')
        .update(patch, { count: 'exact' })
        .eq('id', id);
      if (error) throw error;
      if (!count) {
        throw new Error('Sem permissão para atualizar este usuário.');
      }

      // Sync user_roles if role changed
      if (role !== undefined) {
        await supabase.from('user_roles').delete().eq('user_id', id);
        await supabase.from('user_roles').insert({ user_id: id, role });
      }
    },
    // Optimistic update for inline toggles/role changes
    onMutate: async (vars) => {
      await qc.cancelQueries({ queryKey: ['admin', 'users'] });
      const prev = qc.getQueryData<AdminUser[]>(['admin', 'users']);
      qc.setQueryData<AdminUser[]>(['admin', 'users'], (old) =>
        old?.map((u) =>
          u.id === vars.id ? { ...u, ...vars } as AdminUser : u
        ) || []
      );
      return { prev };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(['admin', 'users'], ctx.prev);
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ['admin', 'users'] }),
  });
}

// Hard delete: removes from auth.users + profiles + user_roles via edge function (Master only)
export function useDeleteUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { data, error } = await supabase.functions.invoke('admin-delete-user', {
        body: { user_id: id },
      });
      if (error) {
        const ctx: any = (error as any).context;
        const msg = ctx ? (await ctx.json?.().catch(() => null))?.error : null;
        throw new Error(msg || error.message);
      }
      if (data?.error) throw new Error(data.error);
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin', 'users'] });
      qc.invalidateQueries({ queryKey: ['admin', 'pending-users'] });
    },
  });
}

// Backwards-compat alias
export const useSoftDeleteUser = useDeleteUser;

// Create invite (Master can invite to any company; admins to their own)
export function useCreateUserInvite() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      email: string;
      role: AppRole;
      company_id: string | null;
    }) => {
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) throw new Error('Não autenticado');
      const { data, error } = await supabase
        .from('team_invites')
        .insert({
          email: input.email.toLowerCase().trim(),
          role: input.role,
          company_id: input.company_id,
          invited_by: auth.user.id,
          status: 'pending',
        })
        .select('id, token')
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin', 'users'] }),
  });
}
