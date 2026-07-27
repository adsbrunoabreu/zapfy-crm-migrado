import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface EmailTemplate {
  id: string;
  company_id: string | null;
  slug: string;
  name: string;
  subject: string;
  html_body: string;
  text_body: string | null;
  variables: string[];
  is_active: boolean;
  updated_at: string;
}

export const useEmailTemplates = () => {
  return useQuery({
    queryKey: ['email_templates'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('email_templates')
        .select('*')
        .order('name', { ascending: true })
        .limit(500);
      if (error) throw error;
      return (data || []) as unknown as EmailTemplate[];
    },
  });
};

export const useSaveEmailTemplate = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (tpl: Partial<EmailTemplate> & { id?: string }) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (tpl.id) {
        const { id, ...rest } = tpl;
        const { error } = await supabase
          .from('email_templates')
          .update(rest as any)
          .eq('id', id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('email_templates')
          .insert({ ...tpl, created_by: user?.id } as any);
        if (error) throw error;
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['email_templates'] }),
  });
};

export const useDeleteEmailTemplate = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('email_templates').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['email_templates'] }),
  });
};
