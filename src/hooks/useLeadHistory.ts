import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export type LeadHistoryEvent =
  | 'lead_created'
  | 'name_changed'
  | 'assigned_changed'
  | 'stage_changed'
  | 'pipeline_changed'
  | 'status_changed'
  | 'tag_added'
  | 'tag_removed'
  | 'ticket_opened'
  | 'ticket_closed'
  | 'ticket_transferred'
  | 'ticket_priority_changed'
  | 'ticket_category_changed';

export interface LeadHistoryRow {
  id: string;
  company_id: string;
  lead_id: string;
  event_type: LeadHistoryEvent;
  actor_user_id: string | null;
  actor_name: string | null;
  payload: Record<string, any>;
  created_at: string;
}

export function useLeadHistory(leadId: string | null | undefined) {
  return useQuery({
    queryKey: ['lead-history', leadId],
    enabled: !!leadId,
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('lead_history' as any)
        .select('*')
        .eq('lead_id', leadId!)
        .order('created_at', { ascending: false })
        .limit(50);
      if (error) throw error;
      return (data || []) as unknown as LeadHistoryRow[];
    },
  });
}
