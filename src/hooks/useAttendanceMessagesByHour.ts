import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { appRangeToIso } from '@/lib/appDate';

export interface MessagesByHourPoint {
  hour: number;
  inbound: number;
  outbound: number;
  total: number;
}

export interface MessagesByHourData {
  from: string;
  to: string;
  by_hour: MessagesByHourPoint[];
}

export function useAttendanceMessagesByHour(params: {
  from: Date;
  to: Date;
  companyId?: string;
  agentId?: string;
}) {
  const { profile, isMaster } = useAuth();
  const cid = params.companyId ?? profile?.company_id;

  return useQuery({
    queryKey: [
      'attendance-messages-by-hour',
      cid,
      params.from.toISOString(),
      params.to.toISOString(),
      params.agentId ?? null,
    ],
    enabled: !!profile && (isMaster || !!cid),
    staleTime: 1000 * 60,
    refetchOnWindowFocus: false,
    queryFn: async (): Promise<MessagesByHourData> => {
      const { fromIso, toIso } = appRangeToIso({ from: params.from, to: params.to });
      const { data, error } = await supabase.rpc('get_attendance_messages_by_hour', {
        _company_id: cid ?? null,
        _from: fromIso,
        _to: toIso,
        _agent_id: params.agentId ?? null,
      } as any);
      if (error) throw error;
      return data as unknown as MessagesByHourData;
    },
  });
}
