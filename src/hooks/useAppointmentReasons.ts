import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';

export interface ReminderRule {
  offset_minutes: number;
  channel: 'whatsapp' | 'email';
  template: string;
  subject?: string;
}

export interface AutomationAction {
  type: 'send_message' | 'move_pipeline_stage' | 'add_tag' | 'create_task';
  params: Record<string, any>;
}

export interface AutomationRule {
  trigger: 'on_create' | 'on_confirm' | 'on_complete' | 'on_cancel' | 'on_no_show';
  actions: AutomationAction[];
}

export interface AppointmentReason {
  id: string;
  company_id: string;
  name: string;
  color: string;
  default_duration_minutes: number;
  client_reminders: ReminderRule[];
  automation_enabled: boolean;
  automation_rules: AutomationRule[];
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export function useAppointmentReasons(includeInactive = false) {
  const { profile } = useAuth();
  const companyId = profile?.company_id;

  return useQuery({
    queryKey: ['appointment-reasons', companyId, includeInactive],
    enabled: !!companyId,
    staleTime: 2 * 60 * 1000,
    queryFn: async (): Promise<AppointmentReason[]> => {
      let q = supabase
        .from('appointment_reasons' as any)
        .select('*').eq('company_id', companyId).order('name');
      if (!includeInactive) q = q.eq('is_active', true);
      const { data, error } = await q;
      if (error) throw error;
      return (data || []) as any;
    },
  });
}

export function useUpsertReason() {
  const { profile } = useAuth();
  const qc = useQueryClient();
  const companyId = profile?.company_id;
  return useMutation({
    mutationFn: async (input: Partial<AppointmentReason> & { id?: string }) => {
      if (!companyId) throw new Error('Sem empresa');
      if (input.id) {
        const { id, ...rest } = input;
        const { error } = await supabase
          .from('appointment_reasons' as any)
          .update(rest).eq('id', id).eq('company_id', companyId);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('appointment_reasons' as any)
          .insert({ ...input, company_id: companyId } as any);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['appointment-reasons', companyId] });
      toast.success('Motivo salvo');
    },
    onError: (e: any) => toast.error('Erro', { description: e.message }),
  });
}

export function useDeleteReason() {
  const { profile } = useAuth();
  const qc = useQueryClient();
  const companyId = profile?.company_id;
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('appointment_reasons' as any)
        .delete().eq('id', id).eq('company_id', companyId!);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['appointment-reasons', companyId] });
      toast.success('Motivo removido');
    },
    onError: (e: any) => toast.error('Erro', { description: e.message }),
  });
}
