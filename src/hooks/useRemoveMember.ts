import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

function translateRemoveError(message: string): string {
  const lower = message.toLowerCase();
  if (lower.includes('not authenticated')) return 'Você precisa estar logado para realizar esta ação.';
  if (lower.includes('user_id required')) return 'ID do usuário é obrigatório.';
  if (lower.includes('cannot remove yourself')) return 'Você não pode remover a própria conta.';
  if (lower.includes('user not found')) return 'Usuário não encontrado.';
  if (lower.includes('cannot remove a master')) return 'Não é possível remover um usuário master.';
  if (lower.includes('access denied')) return 'Você não tem permissão para remover este usuário.';
  return message || 'Não foi possível remover o membro da equipe.';
}

export function useRemoveMember() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (memberId: string) => {
      const { error } = await supabase.rpc('remove_team_member', {
        _user_id: memberId,
      });
      if (error) throw new Error(translateRemoveError(error.message));
      return memberId;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['team-members'] });
      queryClient.invalidateQueries({ queryKey: ['leads'] });
      queryClient.invalidateQueries({ queryKey: ['distribution-users'] });
      queryClient.invalidateQueries({ queryKey: ['instance-agents'] });
      toast.success('Membro removido', {
        description: 'O membro foi removido da equipe com sucesso.',
      });
    },
    onError: (error: any) => {
      console.error('Error removing member:', error);
      const msg = error?.message || 'Não foi possível remover o membro da equipe.';
      toast.error('Erro ao remover', {
        description: msg,
      });
    },
  });
}
