import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

/**
 * Subscribes to realtime changes on leads (scoped by pipeline + company),
 * pipeline_stages, pipelines, lead_procedures e medical_procedures,
 * invalidando os caches do kanban e dashboards para refletir mudanças
 * de valor em tempo real.
 */
export function useRealtimePipeline(pipelineId: string | null) {
  const queryClient = useQueryClient();
  const { profile } = useAuth();
  const companyId = profile?.company_id ?? null;

  useEffect(() => {
    if (!pipelineId || pipelineId.startsWith('mock-') || !companyId) return;

    const invalidateLeads = () => {
      queryClient.invalidateQueries({ queryKey: ['pipeline-leads', companyId, pipelineId] });
      queryClient.invalidateQueries({ queryKey: ['pipeline-totals', pipelineId] });
      queryClient.invalidateQueries({ queryKey: ['leads'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      queryClient.invalidateQueries({ queryKey: ['my-dashboard'] });
      queryClient.invalidateQueries({ queryKey: ['report-leads'] });
      queryClient.invalidateQueries({ queryKey: ['pipeline-performance'] });
      queryClient.invalidateQueries({ queryKey: ['financial-overview'] });
      queryClient.invalidateQueries({ queryKey: ['budget-overview'] });
      queryClient.invalidateQueries({ queryKey: ['lead-budgets'] });
    };
    const invalidatePipelines = () => {
      queryClient.invalidateQueries({ queryKey: ['pipelines', companyId] });
      invalidateLeads();
    };
    const invalidateProcedures = (payload: any) => {
      const leadId = payload?.new?.lead_id ?? payload?.old?.lead_id;
      if (leadId) {
        queryClient.invalidateQueries({ queryKey: ['lead-procedures', leadId] });
        queryClient.invalidateQueries({ queryKey: ['lead-full', leadId] });
      }
      invalidateLeads();
    };

    const channel = supabase
      .channel(`pipeline-rt-${pipelineId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'leads', filter: `pipeline_id=eq.${pipelineId}` },
        invalidateLeads,
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'pipeline_stages', filter: `pipeline_id=eq.${pipelineId}` },
        invalidatePipelines,
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'pipelines', filter: `company_id=eq.${companyId}` },
        invalidatePipelines,
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'lead_procedures', filter: `company_id=eq.${companyId}` },
        invalidateProcedures,
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'medical_procedures', filter: `company_id=eq.${companyId}` },
        invalidateLeads,
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [pipelineId, companyId, queryClient]);
}
