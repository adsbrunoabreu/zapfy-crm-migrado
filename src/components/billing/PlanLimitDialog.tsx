import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Lock, Sparkles, Check, ArrowUpRight } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/contexts/AuthContext';
import { useSubscriptionPlans, SubscriptionPlan } from '@/hooks/useSubscriptionPlans';
import { useCompanySubscription } from '@/hooks/useSubscriptions';
import { usePlanLimitGuard } from '@/hooks/usePlanLimitGuard';

export type PlanLimitResource = 'users' | 'instances' | 'pipelines' | 'leads';

interface PlanLimitDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Recurso bloqueado — quando informado, calcula plano sugerido e benefícios. */
  resource?: PlanLimitResource;
  /** Mensagem customizada. Se ausente, é gerada a partir do recurso. */
  message?: string;
  title?: string;
  ctaLabel?: string;
  ctaTo?: string;
}

const RESOURCE_LABEL: Record<PlanLimitResource, string> = {
  users: 'usuários',
  instances: 'instâncias WhatsApp',
  pipelines: 'pipelines',
  leads: 'leads',
};

const formatBRL = (n: number) =>
  n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

function planLimitFor(plan: SubscriptionPlan, resource: PlanLimitResource): number | null {
  switch (resource) {
    case 'users': return plan.max_users;
    case 'instances': return plan.max_whatsapp_instances;
    case 'pipelines': return plan.max_pipelines;
    case 'leads': return plan.max_leads;
  }
}

function fmtLimit(v: number | null): string {
  return v == null ? 'Ilimitado' : v.toLocaleString('pt-BR');
}

export function PlanLimitDialog({
  open,
  onOpenChange,
  resource,
  message,
  title = 'Você atingiu o limite do seu plano',
  ctaLabel,
  ctaTo,
}: PlanLimitDialogProps) {
  const navigate = useNavigate();
  const { profile } = useAuth();
  const { data: plans } = useSubscriptionPlans();
  const { data: subscription } = useCompanySubscription(profile?.company_id || undefined);
  const guard = usePlanLimitGuard();

  const currentPlan = useMemo(
    () => (plans || []).find((p) => p.id === subscription?.plan_id) || null,
    [plans, subscription],
  );

  // Próximo plano: primeiro plano ativo cujo limite do recurso é maior (ou ilimitado)
  // que o atual, ordenado por display_order.
  const nextPlan = useMemo<SubscriptionPlan | null>(() => {
    if (!resource || !plans) return null;
    const active = plans.filter((p) => p.is_active).sort((a, b) => a.display_order - b.display_order);
    const currentLimit = currentPlan ? planLimitFor(currentPlan, resource) : 0;
    const better = active.find((p) => {
      if (currentPlan && p.id === currentPlan.id) return false;
      const lim = planLimitFor(p, resource);
      if (lim == null) return true; // ilimitado é sempre melhor
      if (currentLimit == null) return false;
      return lim > (currentLimit ?? 0);
    });
    return better || null;
  }, [plans, currentPlan, resource]);

  // Benefícios desbloqueados: deltas de cada recurso entre plano atual e próximo.
  const unlockedDeltas = useMemo(() => {
    if (!nextPlan) return [] as string[];
    const items: string[] = [];
    const compare = (label: string, cur: number | null, next: number | null) => {
      if (next == null && cur != null) items.push(`${label}: ${fmtLimit(cur)} → Ilimitado`);
      else if (next != null && cur != null && next > cur) items.push(`${label}: ${fmtLimit(cur)} → ${fmtLimit(next)}`);
      else if (next != null && cur == null) return; // já era ilimitado
    };
    compare('Usuários', currentPlan?.max_users ?? 0, nextPlan.max_users);
    compare('Leads', currentPlan?.max_leads ?? 0, nextPlan.max_leads);
    compare('Instâncias WhatsApp', currentPlan?.max_whatsapp_instances ?? 0, nextPlan.max_whatsapp_instances);
    compare('Pipelines', currentPlan?.max_pipelines ?? 0, nextPlan.max_pipelines);
    return items;
  }, [currentPlan, nextPlan]);

  const fallbackMessage = useMemo(() => {
    if (message) return message;
    if (!resource) return 'Para liberar mais recursos, faça upgrade do seu plano.';
    const reason = {
      users: guard.userBlockedReason,
      instances: guard.instanceBlockedReason,
      pipelines: guard.pipelineBlockedReason,
      leads: guard.leadBlockedReason,
    }[resource];
    return reason || `Limite de ${RESOURCE_LABEL[resource]} do plano atingido.`;
  }, [message, resource, guard]);

  const goUpgrade = () => {
    onOpenChange(false);
    if (ctaTo) {
      navigate(ctaTo);
      return;
    }
    // Vai para Assinatura e abre automaticamente o seletor de plano com o sugerido pré-selecionado.
    navigate('/subscription', {
      state: { upgrade: true, planId: nextPlan?.id, cycle: subscription?.billing_cycle || 'monthly' },
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full border border-border bg-muted/30">
            <Lock className="h-5 w-5 text-muted-foreground" />
          </div>
          <DialogTitle className="text-center">{title}</DialogTitle>
          <DialogDescription className="text-center">{fallbackMessage}</DialogDescription>
        </DialogHeader>

        {nextPlan && (
          <div className="rounded-lg border border-border bg-muted/20 p-4 space-y-3">
            <div className="flex items-baseline justify-between gap-2">
              <div className="flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-primary" />
                <span className="text-sm font-medium">Plano sugerido: {nextPlan.name}</span>
              </div>
              <span className="text-xs text-muted-foreground tabular-nums">
                {formatBRL(nextPlan.monthly_price)}<span className="opacity-70">/mês</span>
              </span>
            </div>
            {unlockedDeltas.length > 0 && (
              <div>
                <p className="text-[11px] uppercase tracking-wider text-muted-foreground mb-1.5">
                  O que será liberado
                </p>
                <ul className="space-y-1">
                  {unlockedDeltas.map((d, i) => (
                    <li key={i} className="flex items-start gap-1.5 text-xs">
                      <Check className="h-3.5 w-3.5 text-emerald shrink-0 mt-0.5" />
                      <span>{d}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}

        <DialogFooter className="sm:justify-center gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Agora não
          </Button>
          <Button onClick={goUpgrade}>
            <ArrowUpRight className="mr-1.5 h-4 w-4" />
            {ctaLabel || (nextPlan ? `Fazer upgrade para ${nextPlan.name}` : 'Ver planos')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default PlanLimitDialog;
