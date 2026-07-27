import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { appRangeToIso } from '@/lib/appDate';

export interface AttendanceReportData {
  company_id: string;
  from: string;
  to: string;
  totals: {
    total: number;
    open: number;
    in_progress: number;
    reopened: number;
    closed: number;
    closed_in_period: number;
  };
  avg_handle_minutes: number;
  transfers: number;
  by_agent: Array<{
    user_id: string;
    name: string;
    avatar_url: string | null;
    total: number;
    open: number;
    closed: number;
    avg_handle_min: number;
    tmr_seconds: number;
    sla_rate: number;
    csat: number;
    nps: number | null;
    msgs_per_ticket: number;
    pending_ratings: number;
    expired_ratings: number;
  }>;
  ratings: {
    total_requested: number;
    responded: number;
    expired: number;
    pending: number;
    response_rate: number;
    expire_rate: number;
    avg_score: number;
    nps: number | null;
  };
  score_distribution: Array<{ score: number; count: number }>;
  daily: Array<{ day: string; created: number; closed: number }>;
  tmr_seconds: number;
  fcr_rate: number;
  transbordo_rate: number;
  sla_response_rate: number;
  messages_per_ticket: number;
  conversion_rate: number;
  active_now: number;
  waiting_now: number;
  top_categories: Array<{ category: string; count: number }>;
  previous: {
    tmr_seconds: number;
    avg_handle_minutes: number;
    fcr_rate: number;
    csat: number;
    closed: number;
    sla_response_rate: number;
    transbordo_rate: number;
    messages_per_ticket: number;
    conversion_rate: number;
    nps: number | null;
  };
}

export function useAttendanceReports(params: {
  from: Date;
  to: Date;
  companyId?: string;
  agentId?: string;
}) {
  const { profile, isMaster } = useAuth();
  const cid = params.companyId ?? profile?.company_id;

  return useQuery({
    queryKey: ['attendance-reports', cid, params.from.toISOString(), params.to.toISOString(), params.agentId ?? null],
    enabled: !!profile && (isMaster || !!cid),
    staleTime: 1000 * 30,
    refetchOnMount: 'always',
    refetchOnWindowFocus: true,
    queryFn: async (): Promise<AttendanceReportData> => {
      const { fromIso, toIso } = appRangeToIso({ from: params.from, to: params.to });
      const { data, error } = await supabase.rpc('get_attendance_reports', {
        _company_id: cid ?? null,
        _from: fromIso,
        _to: toIso,
        _agent_id: params.agentId ?? null,
      } as any);
      if (error) throw error;
      return data as unknown as AttendanceReportData;
    },
  });
}
