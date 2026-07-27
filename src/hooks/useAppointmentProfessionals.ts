import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';

export interface Professional {
  id: string;
  company_id: string;
  name: string;
  email: string | null;
  phone: string | null;
  specialty: string | null;
  color: string;
  avatar_url: string | null;
  linked_user_id: string | null;
  is_active: boolean;
  /** Início da jornada — formato HH:MM:SS */
  work_start_time: string;
  /** Fim da jornada — formato HH:MM:SS */
  work_end_time: string;
  /** Dias trabalhados — ISO weekday (0=Dom, 1=Seg, … 6=Sáb) */
  work_days: number[];
  /** Intervalo entre reuniões em minutos */
  buffer_minutes: number;
  /** CRM/CRO/etc. — usado em empresas da vertical médica */
  crm: string | null;
  /** Tipo de conselho (CRM, CRO, CRP, …) */
  council_type: string | null;
  /** Bio/apresentação do profissional */
  bio: string | null;
  /** Vínculo opcional com a tabela medical_doctors */
  medical_doctor_id: string | null;
  created_at: string;
  updated_at: string;
}

export function useProfessionals(includeInactive = false) {
  const { profile } = useAuth();
  const companyId = profile?.company_id;

  return useQuery({
    queryKey: ['appointment-professionals', companyId, includeInactive],
    enabled: !!companyId,
    staleTime: 2 * 60 * 1000,
    queryFn: async (): Promise<Professional[]> => {
      let q = supabase
        .from('appointment_professionals' as any)
        .select('*')
        .eq('company_id', companyId)
        .order('name', { ascending: true });
      if (!includeInactive) q = q.eq('is_active', true);
      const { data, error } = await q;
      if (error) throw error;
      return (data || []) as any;
    },
  });
}

export function useUpsertProfessional() {
  const { profile } = useAuth();
  const qc = useQueryClient();
  const companyId = profile?.company_id;

  return useMutation({
    mutationFn: async (input: Partial<Professional> & { id?: string }) => {
      if (!companyId) throw new Error('Sem empresa');
      if (input.id) {
        const { id, ...rest } = input;
        const { error } = await supabase
          .from('appointment_professionals' as any)
          .update(rest)
          .eq('id', id)
          .eq('company_id', companyId);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('appointment_professionals' as any)
          .insert({ ...input, company_id: companyId } as any);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['appointment-professionals', companyId] });
      toast.success('Profissional salvo');
    },
    onError: (e: any) => toast.error('Erro', { description: e.message }),
  });
}

export function useDeleteProfessional() {
  const { profile } = useAuth();
  const qc = useQueryClient();
  const companyId = profile?.company_id;
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('appointment_professionals' as any)
        .delete().eq('id', id).eq('company_id', companyId!);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['appointment-professionals', companyId] });
      toast.success('Profissional removido');
    },
    onError: (e: any) => toast.error('Erro', { description: e.message }),
  });
}
