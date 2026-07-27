import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export interface LeadMedicalNote {
  id: string;
  lead_id: string;
  company_id: string;
  author_id: string | null;
  author_name: string;
  body: string;
  created_at: string;
}

export function useLeadMedicalNotes(leadId: string | null) {
  return useQuery({
    queryKey: ['lead-medical-notes', leadId],
    enabled: !!leadId,
    staleTime: 30_000,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('lead_medical_notes')
        .select('*')
        .eq('lead_id', leadId!)
        .order('created_at', { ascending: false })
        .limit(200);
      if (error) throw error;
      return (data ?? []) as LeadMedicalNote[];
    },
  });
}

export function useCreateLeadMedicalNote() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ leadId, body }: { leadId: string; body: string }) => {
      const trimmed = body.trim();
      if (!trimmed) throw new Error('Nota vazia');
      const { error } = await (supabase as any)
        .from('lead_medical_notes')
        .insert({ lead_id: leadId, body: trimmed, author_name: '' /* trigger preenche */ });
      if (error) throw error;
    },
    onSuccess: (_d, v) => {
      qc.invalidateQueries({ queryKey: ['lead-medical-notes', v.leadId] });
      toast.success('Nota adicionada');
    },
    onError: (e: any) => toast.error('Erro ao salvar nota: ' + (e.message ?? '')),
  });
}
