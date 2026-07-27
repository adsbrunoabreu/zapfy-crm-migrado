import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { appRangeToIso } from '@/lib/appDate';

export interface PipelineReportKpis {
  total_leads: number;
  won: number;
  lost: number;
  closed: number;
  reopened: number;
  avg_cycle_days: number | null;
  avg_response_hours: number | null;
  revenue_won: number;
  revenue_lost: number;
  avg_ticket_won: number | null;
  pipeline_value: number;
  avg_ticket_all: number | null;
}

export interface PipelineReportStage {
  stage_id: string;
  name: string;
  color: string | null;
  position: number;
  stage_type: string;
  pipeline_id: string;
  entries: number;
  exits: number;
  current_count: number;
  avg_hours_in_stage: number;
}

export interface PipelineReportDaily {
  day: string;
  won: number;
  lost: number;
  reopened: number;
}

export interface PipelineReportTransition {
  from_id: string | null;
  from_name: string | null;
  from_color: string | null;
  to_id: string;
  to_name: string;
  to_color: string | null;
  cnt: number;
}

export interface PipelineByPipeline {
  pipeline_id: string;
  name: string;
  leads: number;
  won: number;
  lost: number;
  revenue: number;
  avg_cycle_days: number | null;
}

export interface PipelineByUser {
  user_id: string;
  name: string;
  avatar_url: string | null;
  leads: number;
  won: number;
  lost: number;
  revenue: number;
  avg_response_hours: number | null;
  avg_ticket: number | null;
}

export interface PipelineByLossReason {
  loss_reason_id: string | null;
  label: string;
  cnt: number;
  value_sum: number;
  avg_value: number | null;
  pct: number;
}

export interface PipelineLossReasonDaily {
  day: string;
  label: string;
  cnt: number;
}

export interface PipelinePerformanceReport {
  kpis: PipelineReportKpis;
  stages: PipelineReportStage[];
  daily: PipelineReportDaily[];
  transitions: PipelineReportTransition[];
  by_pipeline: PipelineByPipeline[];
  by_user: PipelineByUser[];
  by_loss_reason: PipelineByLossReason[];
  loss_reason_daily: PipelineLossReasonDaily[];
}

export type ReportStatusFilter = 'all' | 'open' | 'won' | 'lost' | 'reopened';

interface Params {
  from: Date;
  to: Date;
  companyId?: string;
  pipelineId?: string;
  userId?: string;
  status?: ReportStatusFilter;
  lossReasonId?: string;
}

export function usePipelinePerformance({ from, to, companyId, pipelineId, userId, status, lossReasonId }: Params) {
  return useQuery<PipelinePerformanceReport>({
    queryKey: [
      'pipeline-performance',
      companyId ?? 'mine',
      pipelineId ?? 'all',
      userId ?? 'all',
      status ?? 'all',
      lossReasonId ?? 'all',
      from.toISOString(),
      to.toISOString(),
    ],
    queryFn: async () => {
      const { fromIso, toIso } = appRangeToIso({ from, to });
      const { data, error } = await supabase.rpc('get_pipeline_performance_report', {
        _company_id: companyId ?? null,
        _from: fromIso,
        _to: toIso,
        _pipeline_id: pipelineId ?? null,
        _user_id: userId ?? null,
        _status: status ?? null,
        _loss_reason_id: lossReasonId ?? null,
      } as any);
      if (error) throw error;
      return data as unknown as PipelinePerformanceReport;
    },
    staleTime: 1000 * 30,
    refetchOnMount: 'always',
    refetchOnWindowFocus: true,
  });
}
