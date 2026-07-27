import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';

export interface InstanceAgent {
  id: string;
  instance_id: string;
  user_id: string;
}

export function useInstanceAgents() {
  const { profile } = useAuth();
  const companyId = profile?.company_id;

  return useQuery({
    queryKey: ['instance-agents', companyId],
    enabled: !!companyId,
    staleTime: 60 * 1000,
    queryFn: async (): Promise<InstanceAgent[]> => {
      const { data, error } = await supabase
        .from('instance_agents')
        .select('id, instance_id, user_id')
        .eq('company_id', companyId!)
        .limit(2000);
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useToggleInstanceAgent() {
  const qc = useQueryClient();
  const { profile } = useAuth();
  return useMutation({
    mutationFn: async ({ instance_id, user_id, enabled }: { instance_id: string; user_id: string; enabled: boolean }) => {
      if (!profile?.company_id) throw new Error('Sem empresa');
      if (enabled) {
        const { error } = await supabase
          .from('instance_agents')
          .insert({ company_id: profile.company_id, instance_id, user_id });
        if (error && !String(error.message).includes('duplicate')) throw error;
      } else {
        const { error } = await supabase
          .from('instance_agents')
          .delete()
          .eq('instance_id', instance_id)
          .eq('user_id', user_id);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['instance-agents'] });
      qc.invalidateQueries({ queryKey: ['my-instances'] });
    },
    onError: (e: any) => toast.error(e?.message || 'Falha ao atualizar vínculo'),
  });
}

/** IDs das instâncias acessíveis ao usuário logado (considerando fallback "aberta"). */
export function useMyInstances() {
  const { profile } = useAuth();
  const companyId = profile?.company_id;
  const userId = profile?.id;
  const isPrivileged = profile?.role === 'admin' || profile?.role === 'master';

  return useQuery({
    queryKey: ['my-instances', companyId, userId, isPrivileged],
    enabled: !!companyId && !!userId,
    staleTime: 60 * 1000,
    queryFn: async (): Promise<string[]> => {
      const { data: instances, error: e1 } = await supabase
        .from('whatsapp_instances')
        .select('id')
        .eq('company_id', companyId!)
        .eq('is_active', true)
        .limit(200);
      if (e1) throw e1;
      const allIds = (instances ?? []).map((i) => i.id);
      if (isPrivileged) return allIds;

      const { data: links } = await supabase
        .from('instance_agents')
        .select('instance_id, user_id')
        .eq('company_id', companyId!)
        .limit(2000);
      const byInstance = new Map<string, Set<string>>();
      (links ?? []).forEach((l) => {
        if (!byInstance.has(l.instance_id)) byInstance.set(l.instance_id, new Set());
        byInstance.get(l.instance_id)!.add(l.user_id);
      });

      return allIds.filter((id) => {
        const set = byInstance.get(id);
        if (!set || set.size === 0) return true; // instância "aberta"
        return set.has(userId!);
      });
    },
  });
}
