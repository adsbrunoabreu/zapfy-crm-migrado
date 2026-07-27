import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useCreateLeadActivity } from './useLeadActivities';
import { invalidateLeadQueries } from './useLeads';

export function useTransferLead() {
  const queryClient = useQueryClient();
  const createActivity = useCreateLeadActivity();

  return useMutation({
    mutationFn: async ({ 
      leadId, 
      newAssigneeId,
      oldAssigneeName,
      newAssigneeName,
      oldAssigneeId,
    }: { 
      leadId: string; 
      newAssigneeId: string | null;
      oldAssigneeName?: string;
      newAssigneeName?: string;
      oldAssigneeId?: string | null;
    }) => {
      const { error } = await supabase
        .from('leads')
        .update({ assigned_to: newAssigneeId })
        .eq('id', leadId);

      if (error) throw error;
      
      return { leadId, oldAssigneeName, newAssigneeName, oldAssigneeId, newAssigneeId };
    },
    onSuccess: async (data) => {
      invalidateLeadQueries(queryClient);
      
      // Registrar atividade de transferência
      const fromName = data.oldAssigneeName || 'Não atribuído';
      const toName = data.newAssigneeName || 'Não atribuído';
      
      try {
        await createActivity.mutateAsync({
          leadId: data.leadId,
          actionType: 'lead_transferred',
          description: `Lead transferido de ${fromName} para ${toName}`,
          metadata: {
            from_user_id: data.oldAssigneeId || null,
            from_user_name: fromName,
            to_user_id: data.newAssigneeId,
            to_user_name: toName,
          }
        });
      } catch (e) {
        console.error('Erro ao registrar atividade:', e);
      }
      
      toast.success('Lead transferido com sucesso!');
    },
    onError: (error) => {
      console.error('Erro ao transferir lead:', error);
      toast.error('Erro ao transferir lead');
    },
  });
}
