import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export interface UpdateMemberProfileInput {
  userId: string;
  full_name?: string | null;
  phone?: string | null;
  avatar_url?: string | null;
}

export function useUpdateMemberProfile() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ userId, ...patch }: UpdateMemberProfileInput) => {
      // Sem .select() para evitar 403 quando RLS impede leitura pós-update
      const { error } = await supabase
        .from('profiles')
        .update(patch)
        .eq('id', userId);
      if (error) throw error;
      return { userId };
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['team-members'] });
      qc.invalidateQueries({ queryKey: ['profile'] });
      toast.success('Perfil atualizado');
    },
    onError: (e: any) => toast.error(e?.message || 'Erro ao atualizar perfil'),
  });
}

export function useResetMemberPassword() {
  return useMutation({
    mutationFn: async (email: string) => {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/auth/reset`,
      });
      if (error) throw error;
    },
    onSuccess: () => toast.success('E-mail de redefinição enviado'),
    onError: (e: any) => toast.error(e?.message || 'Falha ao enviar e-mail'),
  });
}
