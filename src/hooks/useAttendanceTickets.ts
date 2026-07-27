import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { invokeEvolutionProxy } from '@/services/evolutionProxy';

export type TicketStatus = 'open' | 'in_progress' | 'closed' | 'reopened' | 'awaiting_rating';

export interface AttendanceTicket {
  id: string;
  company_id: string;
  ticket_number: number;
  ticket_code: string;
  conversation_id: string | null;
  lead_id: string | null;
  contact_phone: string | null;
  contact_name: string | null;
  channel: string;
  status: TicketStatus;
  priority: string;
  priority_color: string | null;
  category: string | null;
  assigned_to: string | null;
  assigned_at: string | null;
  closed_at: string | null;
  closed_by: string | null;
  close_reason: string | null;
  close_notes: string | null;
  reopened_at: string | null;
  last_message_at: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export function useConversationActiveTicket(conversationId: string | null | undefined) {
  return useQuery({
    queryKey: ['attendance-ticket', 'conversation', conversationId],
    enabled: !!conversationId,
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('attendance_tickets')
        .select('*')
        .eq('conversation_id', conversationId!)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data as AttendanceTicket | null;
    },
  });
}

export function useConversationTicketsHistory(conversationId: string | null | undefined) {
  return useQuery({
    queryKey: ['attendance-tickets', 'history', conversationId],
    enabled: !!conversationId,
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('attendance_tickets')
        .select('*')
        .eq('conversation_id', conversationId!)
        .order('created_at', { ascending: false })
        .limit(50);
      if (error) throw error;
      return (data || []) as AttendanceTicket[];
    },
  });
}

export function useCreateTicket() {
  const qc = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: async (input: {
      conversation_id: string;
      lead_id?: string | null;
      contact_phone?: string | null;
      contact_name?: string | null;
      priority?: string;
      category?: string | null;
      assigned_to?: string | null;
    }) => {
      const { data, error } = await supabase.rpc('create_attendance_ticket', {
        _conversation_id: input.conversation_id,
        _lead_id: input.lead_id ?? null,
        _contact_phone: input.contact_phone ?? null,
        _contact_name: input.contact_name ?? null,
        _priority: input.priority ?? null,
        _category: input.category ?? null,
        _assigned_to: input.assigned_to ?? null,
      });
      if (error) throw error;
      return data as unknown as AttendanceTicket;
    },
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ['attendance-ticket', 'conversation', vars.conversation_id] });
      qc.invalidateQueries({ queryKey: ['attendance-tickets'] });
      toast({ title: 'Ticket aberto', description: 'Atendimento criado com sucesso.' });
    },
    onError: (e: any) => {
      const msg = String(e?.message || '');
      if (msg.includes('CONVERSATION_HAS_ACTIVE_TICKET')) {
        toast({
          title: 'Já existe um ticket ativo',
          description: 'Encerre o atendimento atual antes de abrir um novo.',
          variant: 'destructive',
        });
      } else if (msg.includes('TICKET_LOCKED_TO_PREVIOUS_AGENT')) {
        toast({
          title: 'Atendimento reservado',
          description: 'Apenas o agente que atendeu este contato pode abrir um novo ticket.',
          variant: 'destructive',
        });
      } else {
        toast({ title: 'Erro ao abrir ticket', description: e.message, variant: 'destructive' });
      }
    },
  });
}

export function useUpdateTicket() {
  const qc = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: async (input: {
      id: string;
      patch: Partial<Pick<AttendanceTicket, 'status' | 'priority' | 'category' | 'assigned_to'>>;
    }) => {
      const patch: Record<string, any> = { ...input.patch };
      if (input.patch.assigned_to !== undefined && input.patch.assigned_to) {
        patch.assigned_at = new Date().toISOString();
        if (!input.patch.status) patch.status = 'in_progress';
      }
      const { error } = await supabase
        .from('attendance_tickets')
        .update(patch)
        .eq('id', input.id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['attendance-ticket'] });
      qc.invalidateQueries({ queryKey: ['attendance-tickets'] });
      qc.invalidateQueries({ queryKey: ['attendance-ticket-assignments'] });
      qc.invalidateQueries({ queryKey: ['lead-history'] });
      toast({ title: 'Ticket atualizado' });
    },
    onError: (e: any) => {
      toast({ title: 'Erro', description: e.message, variant: 'destructive' });
    },
  });
}

export interface TicketAssignment {
  id: string;
  ticket_id: string;
  from_user_id: string | null;
  to_user_id: string | null;
  transferred_by: string | null;
  reason: string | null;
  mode: string;
  created_at: string;
}

export function useTicketAssignments(ticketId: string | null | undefined) {
  return useQuery({
    queryKey: ['attendance-ticket-assignments', ticketId],
    enabled: !!ticketId,
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('attendance_ticket_assignments')
        .select('*')
        .eq('ticket_id', ticketId!)
        .order('created_at', { ascending: false })
        .limit(50);
      if (error) throw error;
      return (data || []) as TicketAssignment[];
    },
  });
}

export function useTransferTicket() {
  const qc = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: async (input: { ticket_id: string; to_user_id: string; reason?: string }) => {
      const { data, error } = await supabase.rpc('transfer_attendance_ticket', {
        _ticket_id: input.ticket_id,
        _to_user_id: input.to_user_id,
        _reason: input.reason ?? null,
      });
      if (error) throw error;
      return data as unknown as AttendanceTicket;
    },
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ['attendance-ticket'] });
      qc.invalidateQueries({ queryKey: ['attendance-tickets'] });
      qc.invalidateQueries({ queryKey: ['attendance-ticket-assignments', vars.ticket_id] });
      qc.invalidateQueries({ queryKey: ['lead-history'] });
      toast({ title: 'Ticket transferido' });
    },
    onError: (e: any) => {
      toast({ title: 'Erro ao transferir', description: e.message, variant: 'destructive' });
    },
  });
}

export function useCloseTicket() {
  const qc = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: async (input: { ticket_id: string; reason: string; notes?: string; skipRating?: boolean }) => {
      const { data, error } = await supabase.rpc('close_attendance_ticket', {
        _ticket_id: input.ticket_id,
        _reason: input.reason,
        _notes: input.notes ?? null,
        _skip_rating: !!input.skipRating,
      });
      if (error) throw error;
      const ticket = data as unknown as AttendanceTicket;

      // Tenta enviar a mensagem de avaliação (se habilitado, não suprimido e ticket tiver telefone)
      try {
        if (input.skipRating) return ticket;
        const { data: settings } = await supabase
          .from('attendance_settings')
          .select('rating')
          .eq('company_id', ticket.company_id)
          .maybeSingle();
        const rating = (settings?.rating || {}) as any;
        if (rating?.enabled && ticket.contact_phone) {
          const { data: conv } = await supabase
            .from('conversations')
            .select('instance_name')
            .eq('id', ticket.conversation_id!)
            .maybeSingle();
          if (conv?.instance_name) {
            const scaleHint =
              rating.scale === 'nps'
                ? '(0 a 10)'
                : rating.scale === 'numeric'
                ? '(1 a 5)'
                : '(1 a 5 estrelas)';
            const text = `${rating.request_message || 'Como você avalia nosso atendimento?'} ${scaleHint}\n\nResponda com a nota.`;
            await invokeEvolutionProxy('sendText', {
              instanceName: conv.instance_name,
              number: ticket.contact_phone,
              text,
            });
          }
        }
      } catch (err) {
        console.warn('Falha ao enviar pedido de avaliação:', err);
      }

      return ticket;
    },
    onSuccess: (ticket) => {
      // Patch otimista: marca a conversa como finalizada na cache imediatamente
      // (o trigger do banco também sincroniza, mas isso garante UX instantânea).
      if (ticket?.conversation_id) {
        const nowIso = new Date().toISOString();
        qc.setQueriesData<any[]>({ queryKey: ['conversations'] }, (old) => {
          if (!Array.isArray(old)) return old;
          let changed = false;
          const next = old.map((c) => {
            if (c?.id === ticket.conversation_id && !c.closed_at) {
              changed = true;
              return { ...c, closed_at: nowIso };
            }
            return c;
          });
          return changed ? next : old;
        });
      }
      qc.invalidateQueries({ queryKey: ['attendance-ticket'] });
      qc.invalidateQueries({ queryKey: ['attendance-tickets'] });
      qc.invalidateQueries({ queryKey: ['attendance-ticket-rating'] });
      qc.invalidateQueries({ queryKey: ['attendance-ticket-events'] });
      qc.invalidateQueries({ queryKey: ['lead-history'] });
      qc.invalidateQueries({ queryKey: ['conversations'] });
      toast({
        title: ticket?.status === 'awaiting_rating' ? 'Aguardando avaliação' : 'Ticket encerrado',
        description:
          ticket?.status === 'awaiting_rating'
            ? 'O atendimento será encerrado após a avaliação ou o prazo configurado.'
            : undefined,
      });
    },

    onError: (e: any) => {
      toast({ title: 'Erro ao encerrar', description: e.message, variant: 'destructive' });
    },
  });
}

export function useReopenTicket() {
  const qc = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: async (ticket_id: string) => {
      const { data, error } = await supabase.rpc('reopen_attendance_ticket', {
        _ticket_id: ticket_id,
      });
      if (error) throw error;
      return data as unknown as AttendanceTicket;
    },
    onSuccess: (ticket) => {
      if (ticket?.conversation_id) {
        qc.setQueriesData<any[]>({ queryKey: ['conversations'] }, (old) => {
          if (!Array.isArray(old)) return old;
          let changed = false;
          const next = old.map((c) => {
            if (c?.id === ticket.conversation_id && c.closed_at) {
              changed = true;
              return { ...c, closed_at: null };
            }
            return c;
          });
          return changed ? next : old;
        });
      }
      qc.invalidateQueries({ queryKey: ['attendance-ticket'] });
      qc.invalidateQueries({ queryKey: ['attendance-tickets'] });
      qc.invalidateQueries({ queryKey: ['attendance-ticket-events'] });
      qc.invalidateQueries({ queryKey: ['lead-history'] });
      qc.invalidateQueries({ queryKey: ['conversations'] });
      toast({ title: 'Ticket reaberto' });
    },

    onError: (e: any) => {
      const msg = String(e?.message || '');
      if (msg.includes('TICKET_LOCKED_TO_PREVIOUS_AGENT')) {
        toast({
          title: 'Atendimento reservado',
          description: 'Apenas o agente que atendeu este contato pode reabrir o ticket.',
          variant: 'destructive',
        });
      } else {
        toast({ title: 'Não foi possível reabrir', description: e.message, variant: 'destructive' });
      }
    },
  });
}

export interface TicketRating {
  id: string;
  ticket_id: string;
  scale: 'stars' | 'numeric' | 'nps';
  score: number | null;
  comment: string | null;
  requested_at: string;
  responded_at: string | null;
  status: 'pending' | 'responded' | 'expired';
  raw_response: string | null;
}

export function useTicketRating(ticketId: string | null | undefined) {
  return useQuery({
    queryKey: ['attendance-ticket-rating', ticketId],
    enabled: !!ticketId,
    staleTime: 30_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('attendance_ticket_ratings')
        .select('*')
        .eq('ticket_id', ticketId!)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data as TicketRating | null;
    },
  });
}

export interface TicketEvent {
  id: string;
  company_id: string;
  ticket_id: string | null;
  conversation_id: string | null;
  event_type:
    | 'opened'
    | 'created'
    | 'closed'
    | 'reopened'
    | 'assigned'
    | 'transferred'
    | 'unassigned'
    | 'note'
    | 'rating'
    | 'escalated'
    | 'responded';
  actor_user_id: string | null;
  actor_name: string | null;
  reason: string | null;
  notes: string | null;
  created_at: string;
}

export function useConversationTicketEvents(conversationId: string | null | undefined) {
  return useQuery({
    queryKey: ['attendance-ticket-events', 'conversation', conversationId],
    enabled: !!conversationId,
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('attendance_ticket_events')
        .select('*')
        .eq('conversation_id', conversationId!)
        .order('created_at', { ascending: true })
        .limit(200);
      if (error) throw error;
      return (data || []) as TicketEvent[];
    },
  });
}
