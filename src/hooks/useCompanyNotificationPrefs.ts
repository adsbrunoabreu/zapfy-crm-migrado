import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';

export interface CompanyNotificationPrefs {
  company_id: string;
  email_new_lead: boolean;
  email_new_message: boolean;
  email_daily_report: boolean;
  email_recipients: string[];
  daily_report_hour: number;
}

const DEFAULTS: Omit<CompanyNotificationPrefs, 'company_id'> = {
  email_new_lead: false,
  email_new_message: false,
  email_daily_report: false,
  email_recipients: [],
  daily_report_hour: 8,
};

export function useCompanyNotificationPrefs() {
  const { profile } = useAuth();
  const companyId = profile?.company_id;

  return useQuery({
    queryKey: ['company-notification-prefs', companyId],
    enabled: !!companyId,
    staleTime: 2 * 60 * 1000,
    queryFn: async (): Promise<CompanyNotificationPrefs> => {
      const { data, error } = await supabase
        .from('company_notification_prefs' as any)
        .select('*')
        .eq('company_id', companyId)
        .maybeSingle();
      if (error) throw error;
      if (!data) return { company_id: companyId!, ...DEFAULTS };
      return data as any;
    },
  });
}

export function useUpdateCompanyNotificationPrefs() {
  const { profile } = useAuth();
  const qc = useQueryClient();
  const companyId = profile?.company_id;

  return useMutation({
    mutationFn: async (patch: Partial<Omit<CompanyNotificationPrefs, 'company_id'>>) => {
      if (!companyId) throw new Error('Sem empresa');
      const { error } = await supabase
        .from('company_notification_prefs' as any)
        .upsert(
          { company_id: companyId, ...DEFAULTS, ...patch },
          { onConflict: 'company_id' },
        );
      if (error) throw error;
    },
    onMutate: async (patch) => {
      await qc.cancelQueries({ queryKey: ['company-notification-prefs', companyId] });
      const prev = qc.getQueryData<CompanyNotificationPrefs>([
        'company-notification-prefs',
        companyId,
      ]);
      if (prev) {
        qc.setQueryData(['company-notification-prefs', companyId], { ...prev, ...patch });
      }
      return { prev };
    },
    onError: (e: any, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(['company-notification-prefs', companyId], ctx.prev);
      toast.error('Erro ao salvar', { description: e.message });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['company-notification-prefs', companyId] });
    },
  });
}
