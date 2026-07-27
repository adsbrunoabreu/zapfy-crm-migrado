import { useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { subscribeBroker } from '@/lib/realtimeBroker';

/**
 * Mantém dashboards, relatórios e financeiro (incluindo DRE) em sincronia em realtime.
 * Usa o broker compartilhado (`realtimeBroker`) em vez de canal próprio — todas as
 * tabelas relevantes já estão pré-declaradas lá.
 */
export function useReportsRealtime(companyId?: string) {
  const qc = useQueryClient();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!companyId) return;

    const invalidate = () => {
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => {
        // Dashboards
        qc.invalidateQueries({ queryKey: ['executive-dashboard'] });
        qc.invalidateQueries({ queryKey: ['my-dashboard-stats'] });
        qc.invalidateQueries({ queryKey: ['dashboard-stats'] });
        qc.invalidateQueries({ queryKey: ['dashboard-medical'] });
        qc.invalidateQueries({ queryKey: ['master-dashboard'] });
        // Relatórios
        qc.invalidateQueries({ queryKey: ['pipeline-performance'] });
        qc.invalidateQueries({ queryKey: ['attendance-reports'] });
        qc.invalidateQueries({ queryKey: ['report-leads'] });
        // Financeiro / DRE
        qc.invalidateQueries({ queryKey: ['financial-overview'] });
        qc.invalidateQueries({ queryKey: ['financial-dashboard'] });
        qc.invalidateQueries({ queryKey: ['financial-entries'] });
        qc.invalidateQueries({ queryKey: ['financial-categories'] });
        qc.invalidateQueries({ queryKey: ['finance-pending-receivables'] });
        qc.invalidateQueries({ queryKey: ['dre'] });
      }, 800);
    };

    const tables = [
      'leads',
      'lead_history',
      'lead_tags',
      'attendance_tickets',
      'attendance_ticket_events',
      'attendance_ticket_ratings',
      'financial_entries',
      'financial_categories',
      'appointments',
      'lead_procedures',
    ];

    const unsubs = tables.map((table) =>
      subscribeBroker(companyId, { table, event: '*', handler: invalidate }),
    );

    return () => {
      if (timer.current) clearTimeout(timer.current);
      unsubs.forEach((u) => u());
    };
  }, [companyId, qc]);
}
