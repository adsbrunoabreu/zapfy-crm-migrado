import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

export type LeadActivityType = 
  | 'lead_created'
  | 'lead_transferred'
  | 'field_updated'
  | 'tag_added'
  | 'tag_removed'
  | 'attachment_added'
  | 'attachment_removed'
  | 'stage_changed'
  | 'note_added'
  | 'message_scheduled'
  | 'message_sent'
  | 'lead_won'
  | 'lead_lost'
  | 'lead_reopened'
  | 'name_updated'
  | 'contact_linked'
  | 'contact_changed'
  | 'contact_unlinked';

export interface LeadActivity {
  id: string;
  company_id: string;
  lead_id: string;
  user_id: string | null;
  action_type: LeadActivityType;
  description: string;
  metadata: Record<string, any>;
  created_at: string;
  user?: {
    full_name: string | null;
    avatar_url: string | null;
  } | null;
}

export function useLeadActivities(leadId: string | null) {
  return useQuery({
    queryKey: ['lead-activities', leadId],
    queryFn: async () => {
      if (!leadId) return [];
      
      const { data, error } = await supabase
        .from('lead_activities')
        .select(`
          *,
          user:profiles(full_name, avatar_url)
        `)
        .eq('lead_id', leadId)
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      return data as LeadActivity[];
    },
    enabled: !!leadId,
  });
}

export function useCreateLeadActivity() {
  const queryClient = useQueryClient();
  const { profile } = useAuth();

  return useMutation({
    mutationFn: async (activity: {
      leadId: string;
      actionType: LeadActivityType;
      description: string;
      metadata?: Record<string, any>;
    }) => {
      if (!profile?.company_id) throw new Error('Empresa não encontrada');

      const { error } = await supabase
        .from('lead_activities')
        .insert({
          company_id: profile.company_id,
          lead_id: activity.leadId,
          user_id: profile.id,
          action_type: activity.actionType,
          description: activity.description,
          metadata: activity.metadata || {},
        });

      if (error) throw error;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ 
        queryKey: ['lead-activities', variables.leadId] 
      });
    },
  });
}
