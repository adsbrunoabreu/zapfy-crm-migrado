import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import type { AppRole } from '@/lib/roles';

interface UpdateRoleParams {
  memberId: string;
  newRole: Exclude<AppRole, 'master'>;
}

export function useUpdateMemberRole() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({ memberId, newRole }: UpdateRoleParams) => {
      // Update profile role
      const { error: profileError } = await supabase
        .from('profiles')
        .update({ role: newRole })
        .eq('id', memberId);

      if (profileError) throw profileError;

      // Check if user_roles entry exists
      const { data: existingRole } = await supabase
        .from('user_roles')
        .select('id')
        .eq('user_id', memberId)
        .single();

      if (existingRole) {
        // Update existing role
        const { error: roleError } = await supabase
          .from('user_roles')
          .update({ role: newRole })
          .eq('user_id', memberId);

        if (roleError) throw roleError;
      } else {
        // Insert new role
        const { error: insertError } = await supabase
          .from('user_roles')
          .insert({ user_id: memberId, role: newRole } as any);

        if (insertError) throw insertError;
      }

      return { memberId, newRole };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['team-members'] });
      toast({
        title: 'Função atualizada',
        description: 'A função do membro foi alterada com sucesso.',
      });
    },
    onError: (error) => {
      console.error('Error updating role:', error);
      toast({
        title: 'Erro ao atualizar',
        description: 'Não foi possível atualizar a função do membro.',
        variant: 'destructive',
      });
    },
  });
}
