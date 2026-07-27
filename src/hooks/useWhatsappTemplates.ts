import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface WhatsappTemplate {
  id: string;
  slug: string;
  name: string;
  body: string;
  variables: string[];
  is_active: boolean;
  updated_at: string;
}

export const useWhatsappTemplates = () => {
  return useQuery({
    queryKey: ['whatsapp_templates'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('whatsapp_templates')
        .select('*')
        .order('name', { ascending: true })
        .limit(500);
      if (error) throw error;
      return (data || []) as unknown as WhatsappTemplate[];
    },
  });
};

export const useSaveWhatsappTemplate = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (tpl: Partial<WhatsappTemplate> & { id?: string }) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (tpl.id) {
        const { id, ...rest } = tpl;
        const { error } = await supabase.from('whatsapp_templates').update(rest as any).eq('id', id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('whatsapp_templates')
          .insert({ ...tpl, created_by: user?.id } as any);
        if (error) throw error;
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['whatsapp_templates'] }),
  });
};

export const useDeleteWhatsappTemplate = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('whatsapp_templates').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['whatsapp_templates'] }),
  });
};
