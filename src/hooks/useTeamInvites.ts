import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { parsePlanLimitError } from '@/hooks/usePlanLimitGuard';

import type { AppRole } from '@/lib/roles';

export interface TeamInvite {
  id: string;
  email: string;
  role: AppRole;
  status: 'pending' | 'accepted' | 'expired' | 'cancelled';
  token: string;
  companyId: string;
  invitedBy: string | null;
  createdAt: string;
  expiresAt: string;
  acceptedAt: string | null;
}

export interface CreateInviteData {
  email: string;
  role: Exclude<AppRole, 'master'>;
}

export function useTeamInvites() {
  const { profile } = useAuth();

  return useQuery({
    queryKey: ['team-invites', profile?.company_id],
    queryFn: async () => {
      if (!profile?.company_id) return [];

      const { data, error } = await supabase
        .from('team_invites')
        .select('*')
        .eq('company_id', profile.company_id)
        .eq('status', 'pending')
        .order('created_at', { ascending: false });

      if (error) throw error;

      return data.map((invite): TeamInvite => {
        const r = invite.role as string;
        const normalized: AppRole =
          r === 'company_admin' ? 'admin' : r === 'user' ? 'agente' : (r as AppRole);
        return {
          id: invite.id,
          email: invite.email,
          role: normalized,
          status: invite.status as TeamInvite['status'],
          token: invite.token,
          companyId: invite.company_id,
          invitedBy: invite.invited_by,
          createdAt: invite.created_at!,
          expiresAt: invite.expires_at!,
          acceptedAt: invite.accepted_at,
        };
      });
    },
    enabled: !!profile?.company_id,
  });
}

export function useCreateInvite() {
  const queryClient = useQueryClient();
  const { profile } = useAuth();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (data: CreateInviteData) => {
      if (!profile?.company_id) throw new Error('Company not found');

      // Check if email is already a team member
      const { data: existingMember } = await supabase
        .from('profiles')
        .select('id')
        .eq('company_id', profile.company_id)
        .eq('email', data.email.toLowerCase())
        .maybeSingle();

      if (existingMember) {
        throw new Error('Este email já é membro da equipe');
      }

      // Check if there's already a pending invite
      const { data: existingInvite } = await supabase
        .from('team_invites')
        .select('id')
        .eq('company_id', profile.company_id)
        .eq('email', data.email.toLowerCase())
        .eq('status', 'pending')
        .maybeSingle();

      if (existingInvite) {
        throw new Error('Já existe um convite pendente para este email');
      }

      const { data: invite, error } = await supabase
        .from('team_invites')
        .insert({
          company_id: profile.company_id,
          email: data.email.toLowerCase(),
          role: data.role,
          invited_by: profile.id,
        } as any)
        .select()
        .single();

      if (error) throw error;
      return invite;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['team-invites'] });
      toast({
        title: 'Convite enviado!',
        description: 'O membro receberá acesso ao fazer cadastro com este email.',
      });
    },
    onError: (error: Error) => {
      const friendly = parsePlanLimitError(error);
      toast({
        title: friendly ? 'Limite do plano atingido' : 'Erro ao enviar convite',
        description: friendly || error.message,
        variant: 'destructive',
      });
    },
  });
}

export function useCancelInvite() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (inviteId: string) => {
      const { error } = await supabase
        .from('team_invites')
        .update({ status: 'cancelled' })
        .eq('id', inviteId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['team-invites'] });
      toast({
        title: 'Convite cancelado',
        description: 'O convite foi cancelado com sucesso.',
      });
    },
    onError: () => {
      toast({
        title: 'Erro ao cancelar convite',
        description: 'Não foi possível cancelar o convite.',
        variant: 'destructive',
      });
    },
  });
}

export async function checkPendingInvite(email: string) {
  const { data, error } = await supabase
    .rpc('check_pending_invite_by_email', { _email: email.toLowerCase() });

  if (error) {
    console.error('Error checking invite:', error);
    return null;
  }

  // RPC returns array, get first result
  return data && data.length > 0 ? data[0] : null;
}

export async function acceptInvite(inviteId: string, userId: string) {
  const { error } = await supabase
    .rpc('accept_invite', { _invite_id: inviteId, _user_id: userId });

  if (error) throw new Error(error.message || 'Erro ao aceitar convite');
}
