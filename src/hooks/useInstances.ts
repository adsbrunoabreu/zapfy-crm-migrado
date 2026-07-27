/**
 * useInstancesMap — devolve um mapa instance_name -> { id, color, display_name, provider }
 * para identificação visual e roteamento de envio.
 */
import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

export interface InstanceMeta {
  id: string;
  instance_name: string;
  display_name: string;
  provider: string | null;
  color: string | null;
}

export function useInstances() {
  const { profile } = useAuth();
  return useQuery({
    queryKey: ['whatsapp-instances', profile?.company_id],
    enabled: !!profile?.company_id,
    staleTime: 2 * 60 * 1000,
    queryFn: async (): Promise<InstanceMeta[]> => {
      const { data, error } = await supabase
        .from('whatsapp_instances')
        .select('id, instance_name, display_name, provider, color')
        .eq('company_id', profile!.company_id!)
        .order('created_at', { ascending: true })
        .limit(100);
      if (error) throw error;
      return (data ?? []) as InstanceMeta[];
    },
  });
}

export function useInstancesMap() {
  const { data = [] } = useInstances();
  return useMemo(() => {
    const byName = new Map<string, InstanceMeta>();
    const byId = new Map<string, InstanceMeta>();
    data.forEach((inst) => {
      if (inst.instance_name) byName.set(inst.instance_name, inst);
      byId.set(inst.id, inst);
    });
    const getForConversation = (conversation?: { instance_id?: string | null; instance_name?: string | null } | null) => {
      if (!conversation) return undefined;
      return (conversation.instance_id ? byId.get(conversation.instance_id) : undefined)
        ?? (conversation.instance_name ? byName.get(conversation.instance_name) : undefined);
    };
    return { byName, byId, list: data, getForConversation };
  }, [data]);
}
