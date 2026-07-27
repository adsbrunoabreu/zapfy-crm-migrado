import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

/**
 * Conjunto de conversation_ids que têm mensagens outbound com falha de envio
 * nas últimas 7 dias. Usado para exibir o filtro "Falhas" na lista de conversas.
 */
export function useFailedConversations() {
  const { profile } = useAuth();
  const companyId = profile?.company_id;

  return useQuery({
    queryKey: ['failed-conversations', companyId],
    enabled: !!companyId,
    staleTime: 60 * 1000,
    queryFn: async () => {
      const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
      const { data } = await supabase
        .from('chat_messages')
        .select('conversation_id')
        .eq('company_id', companyId!)
        .eq('from_me', true)
        .in('status', ['error', 'failed'])
        .gte('timestamp', since)
        .limit(2000);
      const set = new Set<string>();
      data?.forEach((m: any) => m.conversation_id && set.add(m.conversation_id));
      return set;
    },
  });
}
