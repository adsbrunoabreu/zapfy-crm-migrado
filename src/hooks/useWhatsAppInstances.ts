import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import {
  callProxy,
  extractOwnerPhone,
  findInstanceInList,
} from '@/components/settings/connections/proxyUtils';
import type { WhatsAppInstance } from '@/components/settings/connections/types';

export function useWhatsAppInstances(companyId: string | undefined) {
  const { toast } = useToast();
  const [instances, setInstances] = useState<WhatsAppInstance[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchInstances = useCallback(async () => {
    if (!companyId) return;
    try {
      const { data, error } = await (supabase as any)
        .from('whatsapp_instances')
        .select('*')
        .eq('company_id', companyId)
        .order('created_at', { ascending: true });
      if (error) throw error;
      setInstances((data || []) as WhatsAppInstance[]);
    } catch {
      toast({
        title: 'Erro',
        description: 'Não foi possível carregar as instâncias.',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  }, [companyId, toast]);

  useEffect(() => {
    fetchInstances();
  }, [fetchInstances]);

  // Realtime
  useEffect(() => {
    if (!companyId) return;
    const channel = supabase
      .channel('instances-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'whatsapp_instances',
          filter: `company_id=eq.${companyId}`,
        },
        () => fetchInstances()
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [companyId, fetchInstances]);

  // Backfill phone_connected once after first load
  const backfillRanRef = useRef(false);
  useEffect(() => {
    if (backfillRanRef.current) return;
    if (loading || !companyId || instances.length === 0) return;

    const targets = instances.filter((i) => i.status === 'connected' && !i.phone_connected);
    if (targets.length === 0) {
      backfillRanRef.current = true;
      return;
    }
    backfillRanRef.current = true;
    let cancelled = false;

    (async () => {
      let all: unknown = null;
      try {
        all = await callProxy('fetchInstances', {});
      } catch {
        return;
      }
      if (cancelled) return;

      let updated = 0;
      for (const inst of targets) {
        if (cancelled) return;
        const match = findInstanceInList(all, inst.instance_name);
        const phone = extractOwnerPhone(match);
        if (!phone) continue;
        try {
          await (supabase as any)
            .from('whatsapp_instances')
            .update({ phone_connected: phone })
            .eq('id', inst.id);
          await (supabase as any).rpc('log_instance_sync', {
            _instance_name: inst.instance_name,
            _phone: phone,
            _success: true,
          });
          updated++;
        } catch {
          /* skip */
        }
      }

      if (updated > 0 && !cancelled) {
        toast({
          title: 'Sincronização automática',
          description: `Telefone vinculado em ${updated} instância(s).`,
        });
        fetchInstances();
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [loading, companyId, instances, fetchInstances, toast]);

  return { instances, loading, fetchInstances };
}
