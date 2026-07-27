import { useQuery, keepPreviousData } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import type { TicketStatus } from './useAttendanceTickets';

export interface ConversationTicketSummary {
  conversation_id: string;
  ticket_id: string;
  status: TicketStatus;
  assigned_to: string | null;
  assigned_name: string | null;
  assigned_avatar: string | null;
  created_at: string;
}

/**
 * Retorna o ticket mais recente por conversa, indexado por conversation_id.
 * Faz lookup de profile do assignee para mostrar iniciais/avatar na lista.
 */
export function useConversationTickets() {
  const { profile } = useAuth();
  const companyId = profile?.company_id;

  return useQuery({
    queryKey: ['conversation-tickets', companyId],
    enabled: !!companyId,
    staleTime: 60_000,
    // Mantém o Map populado durante refetches para evitar gap onde
    // ticketsByConv vira undefined e classifyBucket reclassifica tudo como
    // 'waiting' (causa flicker na lista de conversas).
    placeholderData: keepPreviousData,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('attendance_tickets')
        .select('id, conversation_id, status, assigned_to, created_at')
        .eq('company_id', companyId!)
        .not('conversation_id', 'is', null)
        .order('created_at', { ascending: false })
        .limit(1000);

      if (error) throw error;

      const tickets = (data || []) as Array<{
        id: string;
        conversation_id: string;
        status: TicketStatus;
        assigned_to: string | null;
        created_at: string;
      }>;

      const assigneeIds = Array.from(
        new Set(tickets.map((t) => t.assigned_to).filter(Boolean) as string[])
      );

      const profilesById = new Map<string, { full_name: string | null; avatar_url: string | null }>();
      if (assigneeIds.length > 0) {
        const { data: profs } = await supabase
          .from('profiles')
          .select('id, full_name, avatar_url')
          .in('id', assigneeIds);
        (profs || []).forEach((p: any) => {
          profilesById.set(p.id, { full_name: p.full_name, avatar_url: p.avatar_url });
        });
      }

      const map = new Map<string, ConversationTicketSummary>();
      tickets.forEach((t) => {
        if (map.has(t.conversation_id)) return; // mais recente já está
        const prof = t.assigned_to ? profilesById.get(t.assigned_to) : null;
        map.set(t.conversation_id, {
          conversation_id: t.conversation_id,
          ticket_id: t.id,
          status: t.status,
          assigned_to: t.assigned_to,
          assigned_name: prof?.full_name ?? null,
          assigned_avatar: prof?.avatar_url ?? null,
          created_at: t.created_at,
        });
      });
      return map;
    },
  });
}
