import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface AuditFilters {
  companyId?: string;
  conversationId?: string;
  leadId?: string;
  fromTs?: string;
  toTs?: string;
  status?: string;
  search?: string;
  direction?: 'in' | 'out';
  limit?: number;
  offset?: number;
}

export interface AuditMessageRow {
  id: string;
  company_id: string;
  conversation_id: string | null;
  message_id: string | null;
  provider_message_id: string | null;
  provider: string | null;
  message_type: string | null;
  content: string | null;
  status: string | null;
  from_me: boolean;
  sender_name: string | null;
  remote_jid: string | null;
  timestamp: string | null;
  created_at: string;
  webhook_received_at: string | null;
  sync_error: string | null;
  lead_id: string | null;
  lead_name: string | null;
  events_count: number;
  total_count: number;
}

export interface AuditEvent {
  ts: string;
  event: string;
  status: string | null;
  description: string | null;
  metadata: Record<string, unknown> | null;
}

export interface AuditTimeline {
  message: AuditMessageRow & Record<string, unknown>;
  events: AuditEvent[];
}

export function useMessageAuditList(filters: AuditFilters) {
  const enabled = !!filters.companyId;
  return useQuery({
    queryKey: ['message-audit-list', filters],
    enabled,
    staleTime: 1000 * 30,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_message_audit_list', {
        _company_id: filters.companyId!,
        _conversation_id: filters.conversationId ?? null,
        _lead_id: filters.leadId ?? null,
        _from_ts: filters.fromTs ?? null,
        _to_ts: filters.toTs ?? null,
        _status: filters.status ?? null,
        _search: filters.search ?? null,
        _direction: filters.direction ?? null,
        _limit: filters.limit ?? 50,
        _offset: filters.offset ?? 0,
      });
      if (error) throw error;
      return (data ?? []) as unknown as AuditMessageRow[];
    },
  });
}

export function useMessageAuditTimeline(messagePk: string | null) {
  return useQuery({
    queryKey: ['message-audit-timeline', messagePk],
    enabled: !!messagePk,
    staleTime: 1000 * 15,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_message_audit_timeline', {
        _message_pk: messagePk!,
      });
      if (error) throw error;
      return data as unknown as AuditTimeline;
    },
  });
}
