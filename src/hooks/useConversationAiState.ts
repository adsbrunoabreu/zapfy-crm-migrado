import { useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export type ConversationAiState = {
  id: string;
  conversation_id: string;
  company_id: string;
  agent_id: string;
  status: 'active' | 'paused' | 'handoff' | 'done' | 'error';
  paused_until: string | null;
  handoff_reason: string | null;
  updated_at: string;
};

export function useConversationAiState(conversationId: string | undefined) {
  const queryClient = useQueryClient();
  const queryKey = ['conversation-ai-state', conversationId];

  const query = useQuery({
    queryKey,
    enabled: !!conversationId,
    staleTime: 30_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('conversation_ai_state')
        .select('id, conversation_id, company_id, agent_id, status, paused_until, handoff_reason, updated_at')
        .eq('conversation_id', conversationId!)
        .maybeSingle();
      if (error) throw error;
      return data as ConversationAiState | null;
    },
  });

  // Realtime subscription
  useEffect(() => {
    if (!conversationId) return;
    const channel = supabase
      .channel(`conv-ai-state-${conversationId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'conversation_ai_state',
          filter: `conversation_id=eq.${conversationId}`,
        },
        () => {
          queryClient.invalidateQueries({ queryKey });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversationId]);

  const resumeAi = useMutation({
    mutationFn: async () => {
      if (!conversationId) throw new Error('conversationId ausente');
      const { error } = await supabase
        .from('conversation_ai_state')
        .update({
          status: 'active',
          paused_until: null,
          handoff_reason: null,
        })
        .eq('conversation_id', conversationId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey });
    },
  });

  return { ...query, resumeAi };
}
