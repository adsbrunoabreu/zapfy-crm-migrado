import { useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';
import { subscribeBroker } from '@/lib/realtimeBroker';
import { toast } from 'sonner';

/**
 * Mantém React Query de assinatura/plano/trial sincronizado em tempo real
 * com confirmações de pagamento vindas do webhook Asaas (sem reload).
 *
 * Usa o broker compartilhado (`realtimeBroker`) — não abre canal próprio.
 */
export function useBillingRealtime() {
  const { profile } = useAuth();
  const companyId = profile?.company_id || null;
  const qc = useQueryClient();
  const lastNotifiedRef = useRef<string | null>(null);

  useEffect(() => {
    if (!companyId) return;

    const invalidateAll = () => {
      qc.invalidateQueries({ queryKey: ['trial-status'] });
      qc.invalidateQueries({ queryKey: ['subscription', companyId] });
      qc.invalidateQueries({ queryKey: ['subscriptions'] });
      qc.invalidateQueries({ queryKey: ['invoices'] });
      qc.invalidateQueries({ queryKey: ['plan-status'] });
    };

    const notifyPaid = (key: string) => {
      if (lastNotifiedRef.current === key) return;
      lastNotifiedRef.current = key;
      toast.success('Pagamento confirmado!', {
        description: 'Sua assinatura foi atualizada automaticamente.',
      });
    };

    const unsubs: Array<() => void> = [];

    // companies → mudança de plan_status
    unsubs.push(
      subscribeBroker(companyId, {
        table: 'companies',
        event: 'UPDATE',
        matchKey: { col: 'id', value: companyId },
        handler: ({ new: n, old: o }: any) => {
          if (o?.plan_status !== n?.plan_status) {
            invalidateAll();
            if (n?.plan_status === 'active' && o?.plan_status && o.plan_status !== 'active') {
              notifyPaid(`company-${n.id}-${n.plan_status}`);
            }
          }
        },
      }),
    );

    // invoices
    unsubs.push(
      subscribeBroker(companyId, {
        table: 'invoices',
        event: '*',
        handler: ({ new: n, old: o }: any) => {
          invalidateAll();
          if (n?.status === 'paid' && o?.status !== 'paid') {
            notifyPaid(`invoice-${n.id}`);
          }
        },
      }),
    );

    // subscriptions
    unsubs.push(
      subscribeBroker(companyId, {
        table: 'subscriptions',
        event: '*',
        handler: () => invalidateAll(),
      }),
    );

    return () => {
      unsubs.forEach((u) => u());
    };
  }, [companyId, qc]);
}
