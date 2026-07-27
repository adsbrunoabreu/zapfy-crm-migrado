import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';

export interface ReportPreference {
  professional_id: string;
  company_id: string;
  daily_email_enabled: boolean;
  daily_whatsapp_enabled: boolean;
  daily_send_time: string; // 'HH:MM:SS'
  whatsapp_number: string | null;
  email_override: string | null;
  last_sent_date: string | null;
}

export function useReportPreferences() {
  const { profile } = useAuth();
  const companyId = profile?.company_id;
  return useQuery({
    queryKey: ['report-preferences', companyId],
    enabled: !!companyId,
    staleTime: 2 * 60 * 1000,
    queryFn: async (): Promise<ReportPreference[]> => {
      const { data, error } = await supabase
        .from('professional_report_preferences' as any)
        .select('*').eq('company_id', companyId);
      if (error) throw error;
      return (data || []) as any;
    },
  });
}

export function useUpsertReportPreference() {
  const { profile } = useAuth();
  const qc = useQueryClient();
  const companyId = profile?.company_id;
  return useMutation({
    mutationFn: async (input: Partial<ReportPreference> & { professional_id: string }) => {
      if (!companyId) throw new Error('Sem empresa');
      // Upsert
      const { error } = await supabase
        .from('professional_report_preferences' as any)
        .upsert({ ...input, company_id: companyId } as any, { onConflict: 'professional_id' });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['report-preferences', companyId] });
      toast.success('Preferências salvas');
    },
    onError: (e: any) => toast.error('Erro', { description: e.message }),
  });
}
