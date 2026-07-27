import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export type AddonField = 'ai_agent_enabled' | 'automations_enabled' | 'ecommerce_enabled';

export interface CompanyAddonRow {
  id: string;
  name: string;
  cnpj: string | null;
  status: string | null;
  plan_id: string | null;
  plan_name: string | null;
  ai_agent_enabled: boolean;
  automations_enabled: boolean;
  ecommerce_enabled: boolean;
  created_at: string;
}

export function useCompaniesWithAddons() {
  return useQuery({
    queryKey: ['admin-addons-companies'],
    staleTime: 2 * 60 * 1000,
    queryFn: async (): Promise<CompanyAddonRow[]> => {
      const { data, error } = await (supabase as any)
        .from('companies')
        .select('id, name, cnpj, status, plan_id, ai_agent_enabled, automations_enabled, ecommerce_enabled, created_at, plans(name)')
        .order('name', { ascending: true })
        .limit(1000);
      if (error) throw error;
      return (data ?? []).map((c: any) => ({
        id: c.id,
        name: c.name,
        cnpj: c.cnpj,
        status: c.status,
        plan_id: c.plan_id,
        plan_name: c.plans?.name ?? null,
        ai_agent_enabled: !!c.ai_agent_enabled,
        automations_enabled: !!c.automations_enabled,
        ecommerce_enabled: !!c.ecommerce_enabled,
        created_at: c.created_at,
      }));
    },
  });
}

export function useToggleCompanyAddon() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      companyId,
      field,
      value,
    }: {
      companyId: string;
      field: AddonField;
      value: boolean;
    }) => {
      const { error } = await supabase
        .from('companies')
        .update({ [field]: value })
        .eq('id', companyId);
      if (error) throw error;

      // Auditoria best-effort
      try {
        await supabase.from('system_logs').insert({
          source: 'admin-addons',
          level: 'info',
          message: `${field} ${value ? 'ativado' : 'desativado'}`,
          metadata: { company_id: companyId, addon: field, enabled: value } as any,
        } as any);
      } catch {
        /* ignore */
      }
      return { companyId, field, value };
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-addons-companies'] });
      qc.invalidateQueries({ queryKey: ['companies'] });
      qc.invalidateQueries({ queryKey: ['company-addons'] });
    },
  });
}
