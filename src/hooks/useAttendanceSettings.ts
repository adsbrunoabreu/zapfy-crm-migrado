import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

export type DayKey = 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun';

export interface DayHours {
  enabled: boolean;
  start: string;
  end: string;
}

export interface BusinessHours {
  timezone: string;
  days: Record<DayKey, DayHours>;
  off_hours_enabled: boolean;
  off_hours_message: string;
  on_call_mode: { enabled: boolean; start: string; end: string };
}

export interface Holiday {
  id: string;
  date: string; // YYYY-MM-DD
  message: string;
}

export interface Priority {
  name: string;
  color: string;
  enabled: boolean;
}

export interface TicketsConfig {
  prefix: string;
  next_number: number;
  show_channel: boolean;
  show_internal_notes: boolean;
  assignment_mode: 'manual' | 'round_robin' | 'least_load' | 'online_least_load' | 'queue';
  /** Quando true, cria/reabre ticket automaticamente em toda nova conversa.
   *  Default false: agente abre o ticket manualmente pelo botão. */
  auto_create: boolean;
  priorities: Priority[];
  categories: string[];
}

export interface ClosingConfig {
  closing_message: string;
  reasons: string[];
  inactivity_minutes: number;
  allow_reopen: boolean;
  reopen_window_hours: number;
  preserve_history: boolean;
}

export interface RatingConfig {
  enabled: boolean;
  scale: 'stars' | 'emojis' | 'nps';
  allow_comment: boolean;
  response_window_hours: number;
  request_message: string;
  block_multiple: boolean;
}

export interface QuickReply {
  id: string;
  shortcut: string;
  text: string;
}

export interface SignatureConfig {
  enabled: boolean;
  format: 'bold_name' | 'attended_by' | 'name_dash' | 'custom';
  custom_template: string;
  show_avatar: boolean;
  /** Onde anexar a assinatura no corpo da mensagem. Default 'top'. */
  position?: 'top' | 'bottom';
}


export interface GeneralConfig {
  max_concurrent_per_agent: number;
  welcome_message: string;
  show_wait_time: boolean;
  supervisor_alert_minutes: number;
  allow_transfer: boolean;
}

export interface AttendanceSettings {
  id?: string;
  company_id: string;
  business_hours: BusinessHours;
  holidays: Holiday[];
  tickets: TicketsConfig;
  closing: ClosingConfig;
  rating: RatingConfig;
  quick_replies: QuickReply[];
  signature: SignatureConfig;
  general: GeneralConfig;
}

export const DEFAULT_SETTINGS: Omit<AttendanceSettings, 'company_id'> = {
  business_hours: {
    timezone: 'America/Sao_Paulo',
    days: {
      mon: { enabled: true, start: '09:00', end: '18:00' },
      tue: { enabled: true, start: '09:00', end: '18:00' },
      wed: { enabled: true, start: '09:00', end: '18:00' },
      thu: { enabled: true, start: '09:00', end: '18:00' },
      fri: { enabled: true, start: '09:00', end: '18:00' },
      sat: { enabled: false, start: '09:00', end: '13:00' },
      sun: { enabled: false, start: '09:00', end: '13:00' },
    },
    off_hours_enabled: false,
    off_hours_message:
      'Olá! No momento estamos fora do horário de atendimento. Retornaremos assim que possível.',
    on_call_mode: { enabled: false, start: '18:00', end: '22:00' },
  },
  holidays: [],
  tickets: {
    prefix: 'ATD',
    next_number: 1,
    show_channel: true,
    show_internal_notes: true,
    assignment_mode: 'online_least_load',
    auto_create: false,
    priorities: [
      { name: 'Baixa', color: '#10b981', enabled: true },
      { name: 'Média', color: '#3b82f6', enabled: true },
      { name: 'Alta', color: '#f59e0b', enabled: true },
      { name: 'Urgente', color: '#ef4444', enabled: true },
    ],
    categories: ['Suporte', 'Vendas', 'Financeiro'],
  },
  closing: {
    closing_message: 'Atendimento encerrado. Obrigado pelo contato!',
    reasons: ['Resolvido', 'Desistência', 'Sem resposta'],
    inactivity_minutes: 0,
    allow_reopen: true,
    reopen_window_hours: 24,
    preserve_history: true,
  },
  rating: {
    enabled: false,
    scale: 'stars',
    allow_comment: true,
    response_window_hours: 0,
    request_message: 'Como você avalia nosso atendimento?',
    block_multiple: true,
  },
  quick_replies: [],
  signature: {
    enabled: false,
    format: 'bold_name',
    custom_template: '*{{nome_agente}}*',
    show_avatar: false,
    position: 'top',
  },

  general: {
    max_concurrent_per_agent: 5,
    welcome_message: 'Olá! Em que podemos ajudar?',
    show_wait_time: false,
    supervisor_alert_minutes: 0,
    allow_transfer: true,
  },
};

export function useAttendanceSettings() {
  const { profile } = useAuth();
  const companyId = profile?.company_id;

  return useQuery({
    queryKey: ['attendance-settings', companyId],
    enabled: !!companyId,
    queryFn: async (): Promise<AttendanceSettings> => {
      if (!companyId) throw new Error('Sem empresa');
      const { data, error } = await supabase
        .from('attendance_settings' as any)
        .select('*')
        .eq('company_id', companyId)
        .maybeSingle();
      if (error) throw error;
      if (!data) {
        return { company_id: companyId, ...DEFAULT_SETTINGS };
      }
      const row = data as any;
      return {
        id: row.id,
        company_id: row.company_id,
        business_hours: { ...DEFAULT_SETTINGS.business_hours, ...(row.business_hours || {}) },
        holidays: row.holidays || [],
        tickets: { ...DEFAULT_SETTINGS.tickets, ...(row.tickets || {}) },
        closing: { ...DEFAULT_SETTINGS.closing, ...(row.closing || {}) },
        rating: { ...DEFAULT_SETTINGS.rating, ...(row.rating || {}) },
        quick_replies: row.quick_replies || [],
        signature: { ...DEFAULT_SETTINGS.signature, ...(row.signature || {}) },
        general: { ...DEFAULT_SETTINGS.general, ...(row.general || {}) },
      };
    },
  });
}

export function useSaveAttendanceSettings() {
  const qc = useQueryClient();
  const { profile } = useAuth();
  const companyId = profile?.company_id;

  return useMutation({
    mutationFn: async (settings: AttendanceSettings) => {
      if (!companyId) throw new Error('Sem empresa');

      const payload = {
        company_id: companyId,
        business_hours: settings.business_hours,
        holidays: settings.holidays,
        tickets: settings.tickets,
        closing: { ...settings.closing, preserve_history: true },
        rating: settings.rating,
        quick_replies: settings.quick_replies,
        signature: settings.signature,
        general: settings.general,
      };

      const { error } = await supabase
        .from('attendance_settings' as any)
        .upsert(payload, { onConflict: 'company_id' });

      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['attendance-settings', companyId] });
    },
  });
}
