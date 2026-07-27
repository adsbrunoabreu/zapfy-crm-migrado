import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';

export type AppointmentStatus =
  | 'scheduled' | 'confirmed' | 'in_progress' | 'completed' | 'cancelled' | 'no_show';

export interface AgendaChecklistItem {
  id: string;
  text: string;
  done: boolean;
}

export interface Appointment {
  id: string;
  company_id: string;
  professional_id: string;
  reason_id: string | null;
  lead_id: string | null;
  title: string | null;
  notes: string | null;
  start_at: string;
  end_at: string;
  timezone: string;
  status: AppointmentStatus;
  cancel_reason: string | null;
  meeting_url: string | null;
  location: string | null;
  agenda_checklist: AgendaChecklistItem[];
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface AppointmentWithRefs extends Appointment {
  professional?: { id: string; name: string; color: string; specialty: string | null } | null;
  reason?: { id: string; name: string; color: string } | null;
  lead?: { id: string; name: string; phone: string | null } | null;
}

export function useAppointments(rangeStart?: Date, rangeEnd?: Date, filters?: {
  professionalId?: string | null;
  reasonId?: string | null;
  status?: AppointmentStatus | null;
}) {
  const { profile } = useAuth();
  const companyId = profile?.company_id;
  const qc = useQueryClient();
  const startISO = rangeStart?.toISOString();
  const endISO = rangeEnd?.toISOString();
  const queryKey = ['appointments', companyId, startISO, endISO, filters];

  const query = useQuery({
    queryKey,
    enabled: !!companyId,
    staleTime: 60 * 1000,
    queryFn: async (): Promise<AppointmentWithRefs[]> => {
      let q = supabase
        .from('appointments' as any)
        .select('*')
        .eq('company_id', companyId)
        .order('start_at', { ascending: true })
        .limit(500);

      if (startISO) q = q.gte('start_at', startISO);
      if (endISO) q = q.lte('start_at', endISO);
      if (filters?.professionalId) q = q.eq('professional_id', filters.professionalId);
      if (filters?.reasonId) q = q.eq('reason_id', filters.reasonId);
      if (filters?.status) q = q.eq('status', filters.status);

      const { data, error } = await q;
      if (error) throw error;
      const appts = ((data || []) as unknown) as Appointment[];
      if (appts.length === 0) return [];

      // Hidratação client-side (refs leves, cacheadas separadamente em outros hooks)
      const proIds = Array.from(new Set(appts.map(a => a.professional_id).filter(Boolean)));
      const reasonIds = Array.from(new Set(appts.map(a => a.reason_id).filter(Boolean) as string[]));
      const leadIds = Array.from(new Set(appts.map(a => a.lead_id).filter(Boolean) as string[]));

      const [prosRes, reasonsRes, leadsRes] = await Promise.all([
        proIds.length ? supabase.from('appointment_professionals' as any).select('id,name,color,specialty').in('id', proIds) : Promise.resolve({ data: [], error: null }),
        reasonIds.length ? supabase.from('appointment_reasons' as any).select('id,name,color').in('id', reasonIds) : Promise.resolve({ data: [], error: null }),
        leadIds.length ? supabase.from('leads').select('id,name,phone').in('id', leadIds).limit(500) : Promise.resolve({ data: [], error: null }),
      ]);
      const proMap = new Map((prosRes.data || []).map((p: any) => [p.id, p]));
      const reasonMap = new Map((reasonsRes.data || []).map((r: any) => [r.id, r]));
      const leadMap = new Map((leadsRes.data || []).map((l: any) => [l.id, l]));

      return appts.map(a => ({
        ...a,
        professional: proMap.get(a.professional_id) || null,
        reason: a.reason_id ? reasonMap.get(a.reason_id) || null : null,
        lead: a.lead_id ? leadMap.get(a.lead_id) || null : null,
      })) as AppointmentWithRefs[];
    },
  });

  // Realtime
  useEffect(() => {
    if (!companyId) return;
    const channel = supabase
      .channel(`appointments-${companyId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'appointments', filter: `company_id=eq.${companyId}` },
        () => qc.invalidateQueries({ queryKey: ['appointments', companyId] }))
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [companyId, qc]);

  return query;
}

export interface UpsertAppointmentInput {
  id?: string;
  professional_id: string;
  reason_id?: string | null;
  lead_id?: string | null;
  title?: string | null;
  notes?: string | null;
  start_at: string;
  end_at?: string | null;
  status?: AppointmentStatus;
  meeting_url?: string | null;
  location?: string | null;
  timezone?: string;
  agenda_checklist?: AgendaChecklistItem[];
  /** Quando informado junto com lead_id, move o lead para esta etapa do funil */
  move_lead_to_stage_id?: string | null;
}

export function useUpsertAppointment() {
  const { profile } = useAuth();
  const qc = useQueryClient();
  const companyId = profile?.company_id;

  return useMutation({
    mutationFn: async (input: UpsertAppointmentInput) => {
      if (!companyId) throw new Error('Sem empresa');
      const { move_lead_to_stage_id, ...apptData } = input;

      let apptId: string;
      if (apptData.id) {
        const { id, ...rest } = apptData;
        const { error } = await supabase
          .from('appointments' as any)
          .update(rest)
          .eq('id', id)
          .eq('company_id', companyId);
        if (error) throw error;
        apptId = id;
      } else {
        const { data, error } = await supabase
          .from('appointments' as any)
          .insert({
            ...apptData,
            company_id: companyId,
            created_by: profile?.id,
          } as any)
          .select('id')
          .single();
        if (error) throw error;
        apptId = (data as any).id;
      }

      // Mover lead para etapa do funil (opcional)
      if (move_lead_to_stage_id && apptData.lead_id) {
        const { error: leadErr } = await supabase
          .from('leads')
          .update({ stage_id: move_lead_to_stage_id })
          .eq('id', apptData.lead_id)
          .eq('company_id', companyId);
        if (leadErr) {
          // Não falha o agendamento se update do lead falhar
          // eslint-disable-next-line no-console
          console.warn('[useUpsertAppointment] falha ao mover lead de etapa', leadErr);
        }
      }

      return apptId;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['appointments', companyId] });
      qc.invalidateQueries({ queryKey: ['pipeline-leads'] });
      toast.success('Agendamento salvo');
    },
    onError: (e: any) => toast.error('Erro ao salvar', { description: e.message }),
  });
}

// (segunda definição duplicada removida — versão acima já cobre stage move)

export function useChangeAppointmentStatus() {
  const { profile } = useAuth();
  const qc = useQueryClient();
  const companyId = profile?.company_id;

  return useMutation({
    mutationFn: async (input: { id: string; status: AppointmentStatus; cancel_reason?: string | null }) => {
      if (!companyId) throw new Error('Sem empresa');
      const update: any = { status: input.status };
      if (input.cancel_reason !== undefined) update.cancel_reason = input.cancel_reason;
      const { error } = await supabase
        .from('appointments' as any)
        .update(update)
        .eq('id', input.id)
        .eq('company_id', companyId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['appointments', companyId] });
      toast.success('Status atualizado');
    },
    onError: (e: any) => toast.error('Erro', { description: e.message }),
  });
}

export function useDeleteAppointment() {
  const { profile } = useAuth();
  const qc = useQueryClient();
  const companyId = profile?.company_id;

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('appointments' as any)
        .delete()
        .eq('id', id)
        .eq('company_id', companyId!);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['appointments', companyId] });
      toast.success('Agendamento excluído');
    },
    onError: (e: any) => toast.error('Erro', { description: e.message }),
  });
}

// ──────────────────────────────────────────────────────────────────────────
// Conflict check
// ──────────────────────────────────────────────────────────────────────────

export interface AppointmentConflict {
  id: string;
  title: string | null;
  start_at: string;
  end_at: string;
}

/**
 * Verifica se um horário proposto colide com agendamentos existentes do profissional.
 * Debounce de 400ms antes de chamar o backend. Não dispara se faltar dado.
 */
export function useConflictCheck(
  professionalId: string | null | undefined,
  startISO: string | null | undefined,
  endISO: string | null | undefined,
  excludeId?: string | null,
) {
  // Chave estável; só habilita quando todos os campos estão prontos
  const enabled = !!professionalId && !!startISO && !!endISO && new Date(endISO) > new Date(startISO);

  return useQuery({
    queryKey: ['appointment-conflicts', professionalId, startISO, endISO, excludeId ?? null],
    enabled,
    staleTime: 0,
    gcTime: 30 * 1000,
    queryFn: async (): Promise<AppointmentConflict[]> => {
      const { data, error } = await supabase.rpc('check_appointment_conflict' as any, {
        _professional_id: professionalId,
        _start: startISO,
        _end: endISO,
        _exclude: excludeId ?? null,
      });
      if (error) throw error;
      return (data || []) as AppointmentConflict[];
    },
  });
}
