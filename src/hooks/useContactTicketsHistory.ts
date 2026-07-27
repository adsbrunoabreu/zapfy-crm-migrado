import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import type { AttendanceTicket } from './useAttendanceTickets';

export interface ContactTicketRow extends AttendanceTicket {
  assigned_name: string | null;
  assigned_avatar: string | null;
}

/**
 * Histórico agregado de tickets do contato:
 * - Filtra por leads vinculados ao contato OU pelo phone normalizado.
 * - Ordena do mais recente para o mais antigo.
 */
export function useContactTicketsHistory(params: {
  contactId: string | null | undefined;
  leadIds?: string[];
  phone?: string | null;
}) {
  const { profile } = useAuth();
  const companyId = profile?.company_id;
  const { contactId, leadIds = [], phone } = params;

  return useQuery({
    queryKey: ['contact-tickets-history', companyId, contactId, leadIds.join(','), phone || ''],
    enabled: !!companyId && !!contactId,
    staleTime: 60_000,
    queryFn: async () => {
      const filters: string[] = [];
      if (leadIds.length > 0) filters.push(`lead_id.in.(${leadIds.join(',')})`);
      if (phone) filters.push(`contact_phone.eq.${phone}`);

      if (filters.length === 0) return [] as ContactTicketRow[];

      const { data, error } = await supabase
        .from('attendance_tickets')
        .select('*')
        .eq('company_id', companyId!)
        .or(filters.join(','))
        .order('created_at', { ascending: false })
        .limit(100);

      if (error) throw error;
      const tickets = (data || []) as AttendanceTicket[];

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

      return tickets.map((t) => {
        const prof = t.assigned_to ? profilesById.get(t.assigned_to) : null;
        return {
          ...t,
          assigned_name: prof?.full_name ?? null,
          assigned_avatar: prof?.avatar_url ?? null,
        } as ContactTicketRow;
      });
    },
  });
}
