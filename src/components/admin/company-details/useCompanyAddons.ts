import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

interface UseCompanyAddonsParams {
  companyId: string | null;
  open: boolean;
}

export function useCompanyAddons({ companyId, open }: UseCompanyAddonsParams) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // ─── Queries ───
  const { data: aiAddon, refetch: refetchAddon } = useQuery({
    queryKey: ['company-ai-addon', companyId],
    queryFn: async () => {
      if (!companyId) return null;
      const { data } = await supabase
        .from('company_addons')
        .select('*')
        .eq('company_id', companyId)
        .eq('addon_slug', 'ai_agent')
        .maybeSingle();
      return data;
    },
    enabled: !!companyId && open,
  });

  const { data: automationsAddon, refetch: refetchAutomations } = useQuery({
    queryKey: ['company-automations-addon', companyId],
    queryFn: async () => {
      if (!companyId) return null;
      const { data } = await supabase
        .from('company_addons')
        .select('*')
        .eq('company_id', companyId)
        .eq('addon_slug', 'automations')
        .maybeSingle();
      return data;
    },
    enabled: !!companyId && open,
  });

  const { data: defaultPricing } = useQuery({
    queryKey: ['ai-addon-default-pricing'],
    queryFn: async () => {
      const { data } = await supabase
        .from('ai_addon_pricing')
        .select('*')
        .eq('addon_slug', 'ai_agent')
        .maybeSingle();
      return data;
    },
    enabled: open,
  });

  const { data: automationsDefaultPricing } = useQuery({
    queryKey: ['automations-addon-default-pricing'],
    queryFn: async () => {
      const { data } = await supabase
        .from('ai_addon_pricing')
        .select('*')
        .eq('addon_slug', 'automations')
        .maybeSingle();
      return data;
    },
    enabled: open,
  });

  const { data: companyBilling, refetch: refetchBilling } = useQuery({
    queryKey: ['company-billing-schedule', companyId],
    enabled: !!companyId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('companies')
        .select('timezone, billing_run_hour, last_billing_sync_at')
        .eq('id', companyId!)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  // ─── Local state ───
  const aiAgentEnabled = !!aiAddon?.is_active;
  const automationsEnabled = !!automationsAddon?.is_active;

  const [savingAi, setSavingAi] = useState(false);
  const [savingAutomations, setSavingAutomations] = useState(false);
  const [savingSchedule, setSavingSchedule] = useState(false);

  const [addonPrice, setAddonPrice] = useState('');
  const [addonIncluded, setAddonIncluded] = useState('');
  const [addonOverage, setAddonOverage] = useState('');
  const [automationsPrice, setAutomationsPrice] = useState('');

  const [billingTz, setBillingTz] = useState('America/Sao_Paulo');
  const [billingHour, setBillingHour] = useState('3');

  useEffect(() => {
    const src: any = aiAddon || defaultPricing;
    if (src) {
      setAddonPrice(String(src.monthly_price ?? '197.00'));
      setAddonIncluded(String(src.included_messages ?? 5000));
      setAddonOverage(String(src.overage_price_per_message ?? 0.04));
    }
  }, [aiAddon, defaultPricing]);

  useEffect(() => {
    const src: any = automationsAddon || automationsDefaultPricing;
    if (src) setAutomationsPrice(String(src.monthly_price ?? '97.00'));
  }, [automationsAddon, automationsDefaultPricing]);

  useEffect(() => {
    if (companyBilling) {
      setBillingTz(companyBilling.timezone || 'America/Sao_Paulo');
      setBillingHour(String(companyBilling.billing_run_hour ?? 3));
    }
  }, [companyBilling]);

  // ─── Handlers ───
  const handleToggleAiAgent = async (checked: boolean) => {
    if (!companyId) return;
    setSavingAi(true);
    try {
      const monthly = parseFloat(addonPrice.replace(',', '.')) || 0;
      const included = parseInt(addonIncluded, 10) || 0;
      const overage = parseFloat(addonOverage.replace(',', '.')) || 0;

      if (checked) {
        const { error } = await supabase.from('company_addons').upsert(
          {
            company_id: companyId,
            addon_slug: 'ai_agent',
            monthly_price: monthly,
            included_messages: included,
            overage_price_per_message: overage,
            is_active: true,
            deactivated_at: null,
          },
          { onConflict: 'company_id,addon_slug' }
        );
        if (error) throw error;
      } else if (aiAddon) {
        const { error } = await supabase
          .from('company_addons')
          .update({ is_active: false, deactivated_at: new Date().toISOString() })
          .eq('id', aiAddon.id);
        if (error) throw error;
      }
      await refetchAddon();
      queryClient.invalidateQueries({ queryKey: ['companies'] });

      let syncNote = '';
      try {
        const { data: syncRes, error: syncErr } = await supabase.functions.invoke(
          'compute-addon-billing',
          { body: { mode: 'manual', company_id: companyId } }
        );
        if (syncErr) throw syncErr;
        const upd = syncRes?.updated?.[0];
        if (upd?.skipped === 'no_asaas_sub_or_key') {
          syncNote = ' (sem assinatura Asaas vinculada — valor não sincronizado)';
        } else if (upd?.new_subscription_value != null) {
          syncNote = ` Novo valor da assinatura: R$ ${Number(upd.new_subscription_value).toFixed(2)}.`;
        }
      } catch (e: any) {
        syncNote = ` Falha ao sincronizar Asaas: ${e?.message || 'erro'}`;
      }

      toast({
        title: checked ? 'Add-on Agente IA ativado' : 'Add-on Agente IA desativado',
        description:
          (checked
            ? `Cobrança: R$ ${monthly.toFixed(2)}/mês + R$ ${overage.toFixed(4)} por msg excedente.`
            : 'O módulo foi desativado para esta empresa.') + syncNote,
      });
    } catch (err: any) {
      toast({ title: 'Erro', description: err.message, variant: 'destructive' });
    } finally {
      setSavingAi(false);
    }
  };

  const handleSaveAddonPricing = async () => {
    if (!companyId || !aiAddon) return;
    setSavingAi(true);
    try {
      const { error } = await supabase
        .from('company_addons')
        .update({
          monthly_price: parseFloat(addonPrice.replace(',', '.')) || 0,
          included_messages: parseInt(addonIncluded, 10) || 0,
          overage_price_per_message: parseFloat(addonOverage.replace(',', '.')) || 0,
        })
        .eq('id', aiAddon.id);
      if (error) throw error;
      await refetchAddon();

      let syncNote = '';
      try {
        const { data: syncRes } = await supabase.functions.invoke('compute-addon-billing', {
          body: { mode: 'manual', company_id: companyId },
        });
        const upd = syncRes?.updated?.[0];
        if (upd?.new_subscription_value != null) {
          syncNote = ` Novo valor: R$ ${Number(upd.new_subscription_value).toFixed(2)}.`;
        }
      } catch {
        /* silencioso */
      }

      toast({ title: 'Preço atualizado', description: syncNote || undefined });
    } catch (err: any) {
      toast({ title: 'Erro', description: err.message, variant: 'destructive' });
    } finally {
      setSavingAi(false);
    }
  };

  const handleToggleAutomations = async (checked: boolean) => {
    if (!companyId) return;
    setSavingAutomations(true);
    try {
      const monthly = parseFloat(automationsPrice.replace(',', '.')) || 0;
      if (checked) {
        const { error } = await supabase.from('company_addons').upsert(
          {
            company_id: companyId,
            addon_slug: 'automations',
            monthly_price: monthly,
            included_messages: 0,
            overage_price_per_message: 0,
            is_active: true,
            deactivated_at: null,
          },
          { onConflict: 'company_id,addon_slug' }
        );
        if (error) throw error;
      } else if (automationsAddon) {
        const { error } = await supabase
          .from('company_addons')
          .update({ is_active: false, deactivated_at: new Date().toISOString() })
          .eq('id', automationsAddon.id);
        if (error) throw error;
      }
      await refetchAutomations();
      queryClient.invalidateQueries({ queryKey: ['company-addons', companyId] });
      try {
        await supabase.functions.invoke('compute-addon-billing', {
          body: { mode: 'manual', company_id: companyId },
        });
      } catch {
        /* silent */
      }
      toast({
        title: checked ? 'Add-on Automações ativado' : 'Add-on Automações desativado',
        description: checked
          ? `Cobrança: R$ ${monthly.toFixed(2)}/mês.`
          : 'O módulo foi desativado para esta empresa.',
      });
    } catch (err: any) {
      toast({ title: 'Erro', description: err.message, variant: 'destructive' });
    } finally {
      setSavingAutomations(false);
    }
  };

  const handleSaveAutomationsPrice = async () => {
    if (!companyId || !automationsAddon) return;
    setSavingAutomations(true);
    try {
      const { error } = await supabase
        .from('company_addons')
        .update({ monthly_price: parseFloat(automationsPrice.replace(',', '.')) || 0 })
        .eq('id', automationsAddon.id);
      if (error) throw error;
      await refetchAutomations();
      try {
        await supabase.functions.invoke('compute-addon-billing', {
          body: { mode: 'manual', company_id: companyId },
        });
      } catch {
        /* silent */
      }
      toast({ title: 'Preço atualizado' });
    } catch (err: any) {
      toast({ title: 'Erro', description: err.message, variant: 'destructive' });
    } finally {
      setSavingAutomations(false);
    }
  };

  const handleSaveBillingSchedule = async () => {
    if (!companyId) return;
    setSavingSchedule(true);
    try {
      const hour = Math.max(0, Math.min(23, parseInt(billingHour, 10) || 0));
      const { error } = await supabase
        .from('companies')
        .update({ timezone: billingTz, billing_run_hour: hour })
        .eq('id', companyId);
      if (error) throw error;
      await refetchBilling();
      toast({ title: 'Horário de cobrança atualizado' });
    } catch (err: any) {
      toast({ title: 'Erro', description: err.message, variant: 'destructive' });
    } finally {
      setSavingSchedule(false);
    }
  };

  return {
    // state
    aiAgentEnabled,
    automationsEnabled,
    savingAi,
    savingAutomations,
    savingSchedule,
    addonPrice,
    setAddonPrice,
    addonIncluded,
    setAddonIncluded,
    addonOverage,
    setAddonOverage,
    automationsPrice,
    setAutomationsPrice,
    billingTz,
    setBillingTz,
    billingHour,
    setBillingHour,
    companyBilling,
    // handlers
    handleToggleAiAgent,
    handleSaveAddonPricing,
    handleToggleAutomations,
    handleSaveAutomationsPrice,
    handleSaveBillingSchedule,
  };
}
