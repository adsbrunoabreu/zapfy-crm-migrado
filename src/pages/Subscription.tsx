import { PageShell } from '@/components/layout/PageShell';
import { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useCompanySubscription } from '@/hooks/useSubscriptions';
import { useSubscriptionPlans } from '@/hooks/useSubscriptionPlans';
import { useReactivateSubscription } from '@/hooks/useChangePlan';
import { useTrialStatus } from '@/hooks/useTrialStatus';
import { CurrentPlanCard } from '@/components/subscription/CurrentPlanCard';
import { NextBillingCard } from '@/components/subscription/NextBillingCard';
import { UsageLimitsCard } from '@/components/subscription/UsageLimitsCard';
import { ChangePlanDialog } from '@/components/subscription/ChangePlanDialog';
import { InvoicesTable } from '@/components/subscription/InvoicesTable';
import { PixPaymentsCard } from '@/components/subscription/PixPaymentsCard';

import { CheckoutInlineDialog } from '@/components/subscription/CheckoutInlineDialog';
import { ChoosePlanGrid } from '@/components/subscription/ChoosePlanGrid';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ArrowUpDown, RefreshCw, AlertTriangle, Sparkles, Clock } from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

export default function Subscription() {
  const { profile } = useAuth();
  const companyId = profile?.company_id || undefined;
  const { data: subscription, isLoading } = useCompanySubscription(companyId);
  const { data: plans } = useSubscriptionPlans();
  const { data: trial } = useTrialStatus();
  const reactivate = useReactivateSubscription(companyId);

  const [showChange, setShowChange] = useState(false);
  const [showCheckout, setShowCheckout] = useState(false);

  // Persistimos em localStorage (sobrevive a reload e reabertura) com TTL de 24h.
  const PRESELECT_KEY = 'subscription:upgradePreselect';
  const PRESELECT_TTL_MS = 24 * 60 * 60 * 1000;
  type Preselect = { planId?: string | null; cycle?: 'monthly' | 'yearly' };
  const readPreselect = (): Preselect => {
    try {
      const raw = localStorage.getItem(PRESELECT_KEY);
      if (!raw) return {};
      const parsed = JSON.parse(raw) as Preselect & { _ts?: number };
      if (parsed._ts && Date.now() - parsed._ts > PRESELECT_TTL_MS) {
        localStorage.removeItem(PRESELECT_KEY);
        return {};
      }
      const { _ts, ...rest } = parsed;
      return rest;
    } catch {
      return {};
    }
  };
  const writePreselect = (next: Preselect) => {
    try {
      if (!next.planId && !next.cycle) {
        localStorage.removeItem(PRESELECT_KEY);
      } else {
        localStorage.setItem(PRESELECT_KEY, JSON.stringify({ ...next, _ts: Date.now() }));
      }
    } catch {}
  };
  const [upgradePreselect, setUpgradePreselect] = useState<Preselect>(readPreselect);

  const location = useLocation();
  const navigate = useNavigate();

  // Abre o seletor automaticamente quando vindo de um bloqueio (PlanLimitDialog).
  useEffect(() => {
    const state = (location.state || {}) as { upgrade?: boolean; planId?: string; cycle?: 'monthly' | 'yearly' };
    if (state.upgrade) {
      const next = { planId: state.planId, cycle: state.cycle };
      setUpgradePreselect(next);
      writePreselect(next);
      setShowChange(true);
      navigate(location.pathname, { replace: true, state: {} });
    }
  }, [location, navigate]);

  // Limpa a pré-seleção quando o plano atual já corresponde ao sugerido (upgrade concluído).
  useEffect(() => {
    if (upgradePreselect.planId && subscription?.plan_id === upgradePreselect.planId) {
      writePreselect({});
      setUpgradePreselect({});
    }
  }, [subscription?.plan_id, upgradePreselect.planId]);


  const currentPlan = useMemo(
    () => (plans || []).find((p) => p.id === subscription?.plan_id) || null,
    [plans, subscription],
  );
  const pendingPlan = useMemo(() => {
    const id = (subscription as any)?.pending_plan_id;
    return id ? (plans || []).find((p) => p.id === id) : null;
  }, [plans, subscription]);

  const cancelAtEnd = !!(subscription as any)?.cancel_at_period_end;
  const isCanceled = subscription?.status === 'canceled';
  const isPastDue = subscription?.status === 'past_due';
  const isTrialing =
    subscription?.status === 'trialing' ||
    (!subscription && trial?.plan_status === 'trial' && !trial?.expired);
  const trialExpired = !subscription && trial?.expired === true;
  const noActiveSub = !subscription || isCanceled;

  return (
    <PageShell title="Minha Assinatura" subtitle="Gerencie seu plano, ciclo de cobrança e faturas.">

      {/* Banners de estado — apenas um cenário por vez */}
      {trialExpired && (
        <Card className="glass-card p-4 border-rose/40 bg-rose/5 text-sm flex items-start gap-3">
          <AlertTriangle className="w-4 h-4 text-rose shrink-0 mt-0.5" />
          <div className="flex-1">
            Seu período de avaliação terminou. Escolha um plano abaixo para retomar o acesso completo.
          </div>
        </Card>
      )}
      {isTrialing && !trialExpired && (
        <Card className="glass-card p-4 border-cyan/40 bg-cyan/5 text-sm flex items-start gap-3">
          <Sparkles className="w-4 h-4 text-cyan shrink-0 mt-0.5" />
          <div className="flex-1">
            Você está em período de avaliação
            {trial?.hours_left != null && (
              <> — restam <strong>{Math.max(0, trial.hours_left)}h</strong></>
            )}
            {subscription?.current_period_end && !trial && (
              <> até <strong>{format(new Date(subscription.current_period_end), "dd 'de' MMMM", { locale: ptBR })}</strong></>
            )}
            . Escolha e pague seu plano antes do término para evitar interrupção.
          </div>
        </Card>
      )}
      {cancelAtEnd && !isCanceled && (
        <Card className="glass-card p-4 border-amber/40 bg-amber/5 flex items-start gap-3">
          <Clock className="w-4 h-4 text-amber shrink-0 mt-0.5" />
          <div className="flex-1 text-sm">
            Sua assinatura termina em{' '}
            <strong>
              {subscription?.current_period_end
                ? format(new Date(subscription.current_period_end), "dd 'de' MMMM", { locale: ptBR })
                : '—'}
            </strong>
            . Reative para manter o acesso e continuar sendo cobrado normalmente.
          </div>
          <Button size="sm" variant="outline" onClick={() => reactivate.mutate()} disabled={reactivate.isPending}>
            <RefreshCw className="w-3.5 h-3.5 mr-1.5" /> Reativar
          </Button>
        </Card>
      )}
      {isPastDue && (
        <Card className="glass-card p-4 border-rose/40 bg-rose/5 text-sm flex items-start gap-3">
          <AlertTriangle className="w-4 h-4 text-rose shrink-0 mt-0.5" />
          <div className="flex-1">
            Falha na cobrança da última fatura. Atualize seu método de pagamento para evitar suspensão.
          </div>
          <Button size="sm" variant="outline" onClick={() => setShowCheckout(true)}>
            Atualizar pagamento
          </Button>
        </Card>
      )}
      {isCanceled && (
        <Card className="glass-card p-4 border-rose/40 bg-rose/5 text-sm flex items-center justify-between gap-3">
          <span>Sua assinatura está cancelada. Reative ou escolha um novo plano abaixo para retomar o acesso.</span>
          <Button size="sm" onClick={() => reactivate.mutate()} disabled={reactivate.isPending}>
            <RefreshCw className="w-3.5 h-3.5 mr-1.5" /> Reativar
          </Button>
        </Card>
      )}

      {/* Sem assinatura ativa: mostrar APENAS escolha de plano (sem cards vazios/duplicados) */}
      {!isLoading && noActiveSub ? (
        <ChoosePlanGrid
          initialCycle={upgradePreselect.cycle}
          onCycleChange={(c) => {
            const next = { ...upgradePreselect, cycle: c };
            setUpgradePreselect(next);
            writePreselect(next);
          }}
        />
      ) : (
        <>
          {/* Cards principais */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <CurrentPlanCard
              subscription={subscription}
              loading={isLoading}
              onChangePlan={!cancelAtEnd && subscription ? () => setShowChange(true) : undefined}
            />
            <NextBillingCard
              subscription={subscription}
              pendingPlanName={pendingPlan?.name}
              loading={isLoading}
            />
          </div>

          <UsageLimitsCard companyId={companyId} plan={currentPlan} />

          <PixPaymentsCard companyId={companyId} />

          <InvoicesTable companyId={companyId} />
        </>
      )}

      {/* Card de Pix sempre visível também quando não há assinatura ativa,
          permitindo concluir um Pix gerado anteriormente */}
      {!isLoading && noActiveSub && <PixPaymentsCard companyId={companyId} />}

      <ChangePlanDialog
        open={showChange}
        onOpenChange={setShowChange}
        current={subscription || null}
        companyId={companyId}
        initialPlanId={upgradePreselect.planId ?? null}
        initialCycle={upgradePreselect.cycle}
        onSelectionChange={(sel) => {
          const next = { ...upgradePreselect, ...sel };
          setUpgradePreselect(next);
          writePreselect(next);
        }}
      />
      <CheckoutInlineDialog
        open={showCheckout}
        onOpenChange={setShowCheckout}
        plan={currentPlan}
        cycle={
          upgradePreselect.cycle ||
          (subscription?.billing_cycle as 'monthly' | 'yearly') ||
          'monthly'
        }
      />
    </PageShell>
  );
}
