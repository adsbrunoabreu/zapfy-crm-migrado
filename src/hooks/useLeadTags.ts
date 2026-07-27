import { useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Tag } from './useTags';
import { useCreateLeadActivity } from './useLeadActivities';

export interface LeadTag {
  id: string;
  lead_id: string;
  tag_id: string;
  created_at: string;
  tag?: Tag;
}

export function useLeadTags(leadId: string | null) {
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: ['lead-tags', leadId],
    queryFn: async () => {
      if (!leadId) return [];

      const { data, error } = await supabase
        .from('lead_tags')
        .select(`
          *,
          tag:tags(*)
        `)
        .eq('lead_id', leadId);

      if (error) throw error;
      return data as (LeadTag & { tag: Tag })[];
    },
    enabled: !!leadId,
  });

  // Realtime: invalida quando tags do lead mudam em outra instância
  useEffect(() => {
    if (!leadId) return;
    const channel = supabase
      .channel(`lead-tags-${leadId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'lead_tags', filter: `lead_id=eq.${leadId}` },
        () => {
          queryClient.invalidateQueries({ queryKey: ['lead-tags', leadId] });
        }
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [leadId, queryClient]);

  return query;
}

export function useAddTagToLead() {
  const queryClient = useQueryClient();
  const createActivity = useCreateLeadActivity();

  return useMutation({
    mutationFn: async ({ leadId, tagId, tagName, tagColor }: { leadId: string; tagId: string; tagName?: string; tagColor?: string }) => {
      const { data, error } = await supabase
        .from('lead_tags')
        .insert({ lead_id: leadId, tag_id: tagId })
        .select()
        .single();

      if (error) throw error;
      return { ...data, tagName, tagColor };
    },
    onSuccess: async (data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['lead-tags', variables.leadId] });
      queryClient.invalidateQueries({ queryKey: ['company-lead-tags'] });
      queryClient.invalidateQueries({ queryKey: ['pipeline-leads'] });
      queryClient.invalidateQueries({ queryKey: ['lead-full', variables.leadId] });
      
      // Registrar atividade
      if (variables.tagName) {
        try {
          await createActivity.mutateAsync({
            leadId: variables.leadId,
            actionType: 'tag_added',
            description: `Tag "${variables.tagName}" adicionada`,
            metadata: {
              tag_id: variables.tagId,
              tag_name: variables.tagName,
              tag_color: variables.tagColor,
            }
          });
        } catch (e) {
          console.error('Erro ao registrar atividade:', e);
        }
      }
    },
    onError: (error) => {
      toast.error('Erro ao adicionar tag: ' + error.message);
    },
  });
}

export function useRemoveTagFromLead() {
  const queryClient = useQueryClient();
  const createActivity = useCreateLeadActivity();

  return useMutation({
    mutationFn: async ({ leadId, tagId, tagName }: { leadId: string; tagId: string; tagName?: string }) => {
      const { error } = await supabase
        .from('lead_tags')
        .delete()
        .eq('lead_id', leadId)
        .eq('tag_id', tagId);

      if (error) throw error;
      return { tagName };
    },
    onSuccess: async (data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['lead-tags', variables.leadId] });
      queryClient.invalidateQueries({ queryKey: ['company-lead-tags'] });
      queryClient.invalidateQueries({ queryKey: ['pipeline-leads'] });
      queryClient.invalidateQueries({ queryKey: ['lead-full', variables.leadId] });
      
      // Registrar atividade
      if (variables.tagName) {
        try {
          await createActivity.mutateAsync({
            leadId: variables.leadId,
            actionType: 'tag_removed',
            description: `Tag "${variables.tagName}" removida`,
            metadata: {
              tag_id: variables.tagId,
              tag_name: variables.tagName,
            }
          });
        } catch (e) {
          console.error('Erro ao registrar atividade:', e);
        }
      }
    },
    onError: (error) => {
      toast.error('Erro ao remover tag: ' + error.message);
    },
  });
}
