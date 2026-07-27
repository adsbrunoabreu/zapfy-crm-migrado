import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

/**
 * Subscreve realtime em attendance_tickets e attendance_ticket_events para a empresa,
 * invalidando as queries de ticket consumidas pela UI de chat (lista, header e drawer).
 * Deve ser instanciado UMA VEZ na raiz da experiência de chat.
 */
export function useAttendanceTicketsRealtime(companyId: string | null | undefined) {
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!companyId) return;

    // Debounce: agrupa rajadas de eventos de ticket (ex.: durante envio de
    // mensagem que cria/atualiza ticket + evento + assignment) numa única
    // invalidação de ['conversation-tickets']. Sem isso, a query refaz
    // múltiplas vezes em ~500ms e a lista pisca.
    let convTicketsTimer: ReturnType<typeof setTimeout> | null = null;
    const invalidateConvTicketsDebounced = () => {
      if (convTicketsTimer) clearTimeout(convTicketsTimer);
      convTicketsTimer = setTimeout(() => {
        queryClient.invalidateQueries({ queryKey: ['conversation-tickets', companyId] });
      }, 800);
    };

    const invalidateForConversation = (conversationId?: string | null) => {
      invalidateConvTicketsDebounced();
      if (conversationId) {
        queryClient.invalidateQueries({
          queryKey: ['attendance-ticket', 'conversation', conversationId],
        });
        queryClient.invalidateQueries({
          queryKey: ['attendance-tickets', 'history', conversationId],
        });
      }
    };

    const channel = supabase
      .channel(`attendance-tickets-${companyId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'attendance_tickets',
          filter: `company_id=eq.${companyId}`,
        },
        (payload) => {
          const row: any = payload.new ?? payload.old ?? {};
          invalidateForConversation(row.conversation_id);
        },
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'attendance_ticket_events',
          filter: `company_id=eq.${companyId}`,
        },
        (payload) => {
          const row: any = payload.new ?? payload.old ?? {};
          if (row.ticket_id) {
            queryClient.invalidateQueries({
              queryKey: ['attendance-ticket-events', row.ticket_id],
            });
          }
          // Eventos novos podem refletir mudanças de assigned/closed/reopened
          invalidateConvTicketsDebounced();
        },
      )
      .subscribe();

    // Safety net: aba oculta por +30s → refetch ao voltar
    let hiddenAt: number | null = null;
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') {
        hiddenAt = Date.now();
      } else if (document.visibilityState === 'visible') {
        if (hiddenAt && Date.now() - hiddenAt > 30_000) {
          queryClient.invalidateQueries({ queryKey: ['conversation-tickets', companyId] });
        }
        hiddenAt = null;
      }
    };
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      if (convTicketsTimer) clearTimeout(convTicketsTimer);
      document.removeEventListener('visibilitychange', onVisibility);
      supabase.removeChannel(channel);
    };
  }, [companyId, queryClient]);
}
