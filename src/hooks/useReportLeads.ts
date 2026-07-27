import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import type { ReportStatusFilter } from './usePipelinePerformance';
import { appRangeToIso } from '@/lib/appDate';

export interface ReportLeadRow {
  id: string;
  numeric_id: number;
  name: string;
  status: string;
  value: number | null;
  created_at: string;
  closed_at: string | null;
  pipeline_id: string | null;
  pipeline_name: string | null;
  stage_id: string | null;
  stage_name: string | null;
  stage_color: string | null;
  assigned_to: string | null;
  assignee_name: string | null;
  loss_reason_id: string | null;
  loss_reason_label: string | null;
}

interface Params {
  from: Date;
  to: Date;
  companyId?: string;
  pipelineId?: string;
  userId?: string;
  status?: ReportStatusFilter;
  lossReasonId?: string;
  page: number;
  pageSize: number;
}

export function useReportLeads(params: Params) {
  const { profile, isMaster } = useAuth();
  const scopeCompany = isMaster ? params.companyId : profile?.company_id;

  return useQuery({
    queryKey: [
      'report-leads',
      scopeCompany ?? 'mine',
      params.pipelineId ?? 'all',
      params.userId ?? 'all',
      params.status ?? 'all',
      params.lossReasonId ?? 'all',
      params.from.toISOString(),
      params.to.toISOString(),
      params.page,
      params.pageSize,
    ],
    queryFn: async () => {
      if (!scopeCompany) return { rows: [] as ReportLeadRow[], total: 0 };
      const { fromIso, toIso } = appRangeToIso({ from: params.from, to: params.to });

      // Eixo canônico: won/lost → closed_at; demais → created_at. is_demo=false sempre.
      const useClosedAxis = params.status === 'won' || params.status === 'lost';

      let q = supabase
        .from('leads')
        .select(
          `id, numeric_id, tenant_seq, name, status, value, created_at, closed_at, pipeline_id, stage_id, assigned_to, loss_reason_id, loss_reason_text,
           pipeline:pipelines(name),
           stage:pipeline_stages(name, color),
           assignee:profiles!assigned_to(full_name, email),
           reason:loss_reasons(label)`,
          { count: 'exact' }
        )
        .eq('company_id', scopeCompany)
        .eq('is_demo', false);

      if (useClosedAxis) {
        q = q.not('closed_at', 'is', null).gte('closed_at', fromIso).lte('closed_at', toIso);
      } else {
        q = q.gte('created_at', fromIso).lte('created_at', toIso);
      }

      if (params.pipelineId) q = q.eq('pipeline_id', params.pipelineId);
      if (params.userId === '00000000-0000-0000-0000-000000000000') q = q.is('assigned_to', null);
      else if (params.userId) q = q.eq('assigned_to', params.userId);
      if (params.lossReasonId) q = q.eq('loss_reason_id', params.lossReasonId);
      if (params.status === 'won') q = q.eq('status', 'won');
      else if (params.status === 'lost') q = q.eq('status', 'lost');
      else if (params.status === 'open') q = q.not('status', 'in', '(won,lost)');

      const start = params.page * params.pageSize;
      const end = start + params.pageSize - 1;
      q = q.order(useClosedAxis ? 'closed_at' : 'created_at', { ascending: false }).range(start, end);

      const { data, error, count } = await q;
      if (error) throw error;

      const rows: ReportLeadRow[] = (data || []).map((r: any) => ({
        id: r.id,
        numeric_id: r.tenant_seq ?? r.numeric_id,
        name: r.name,
        status: r.status,
        value: r.value,
        created_at: r.created_at,
        closed_at: r.closed_at,
        pipeline_id: r.pipeline_id,
        pipeline_name: r.pipeline?.name ?? null,
        stage_id: r.stage_id,
        stage_name: r.stage?.name ?? null,
        stage_color: r.stage?.color ?? null,
        assigned_to: r.assigned_to,
        assignee_name: r.assignee?.full_name ?? r.assignee?.email ?? null,
        loss_reason_id: r.loss_reason_id,
        loss_reason_label: r.reason?.label ?? r.loss_reason_text ?? null,
      }));

      return { rows, total: count ?? 0 };
    },
    enabled: !!scopeCompany,
    staleTime: 1000 * 60 * 2,
  });
}
