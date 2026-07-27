import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

/**
 * Regras de dependência entre add-ons:
 *  - ecommerce_enabled exige ai_agent_enabled (loja vende via IA no WhatsApp)
 *  - ai_agent_enabled  exige automations_enabled (precisa dos triggers de fluxo)
 */
export interface SyncReport {
  scanned: number;
  updated: number;
  changes: Array<{
    company_id: string;
    name: string;
    before: { ai: boolean; auto: boolean; store: boolean };
    after: { ai: boolean; auto: boolean; store: boolean };
  }>;
}

export function useSyncGlobalAddons() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (): Promise<SyncReport> => {
      // Apenas empresas ativas/trial
      const { data, error } = await supabase
        .from('companies')
        .select('id, name, plan_status, ai_agent_enabled, automations_enabled, ecommerce_enabled')
        .in('plan_status', ['active', 'trial'])
        .limit(1000);
      if (error) throw error;

      const report: SyncReport = { scanned: data?.length ?? 0, updated: 0, changes: [] };

      for (const c of data ?? []) {
        const before = {
          ai: !!c.ai_agent_enabled,
          auto: !!c.automations_enabled,
          store: !!c.ecommerce_enabled,
        };
        const after = { ...before };

        // Aplicar dependências (forward chain)
        if (after.store) after.ai = true;
        if (after.ai) after.auto = true;

        const changed =
          after.ai !== before.ai ||
          after.auto !== before.auto ||
          after.store !== before.store;

        if (!changed) continue;

        const { error: upErr } = await supabase
          .from('companies')
          .update({
            ai_agent_enabled: after.ai,
            automations_enabled: after.auto,
            ecommerce_enabled: after.store,
          })
          .eq('id', c.id);
        if (upErr) continue;

        report.updated += 1;
        report.changes.push({ company_id: c.id, name: c.name, before, after });
      }

      // Auditoria
      try {
        await supabase.from('system_logs').insert({
          source: 'admin-addons-sync',
          level: 'info',
          message: `Sincronização global de add-ons (${report.updated}/${report.scanned} atualizadas)`,
          metadata: { report } as any,
        } as any);
      } catch {
        /* ignore */
      }

      return report;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-addons-companies'] });
      qc.invalidateQueries({ queryKey: ['companies'] });
      qc.invalidateQueries({ queryKey: ['company-addons'] });
    },
  });
}
