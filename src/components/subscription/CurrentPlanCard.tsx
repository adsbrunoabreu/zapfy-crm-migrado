import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Subscription } from '@/hooks/useSubscriptions';
import { CreditCard, Tag, ArrowUpDown } from 'lucide-react';
import { getNormalMonthlyPrice } from '@/lib/promoPricing';

interface Props {
  subscription: Subscription | null;
  loading?: boolean;
  onChangePlan?: () => void;
}

const statusMap: Record<string, { label: string; className: string }> = {
  active:    { label: 'Ativa',         className: 'bg-emerald/15 text-emerald border-emerald/30' },
  trialing:  { label: 'Em avaliação',  className: 'bg-cyan/15 text-cyan border-cyan/30' },
  past_due:  { label: 'Inadimplente',  className: 'bg-amber/15 text-amber border-amber/30' },
  canceled:  { label: 'Cancelada',     className: 'bg-rose/15 text-rose border-rose/30' },
};

const formatBRL = (n: number) =>
  n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

export function CurrentPlanCard({ subscription, loading, onChangePlan }: Props) {
  if (loading) {
    return <Card className="glass-card p-6 animate-pulse h-40" />;
  }
  if (!subscription) {
    return (
      <Card className="glass-card p-6">
        <p className="text-sm text-muted-foreground">Nenhuma assinatura encontrada.</p>
      </Card>
    );
  }

  const cycleLabel = subscription.billing_cycle === 'yearly' ? 'Anual' : 'Mensal';
  const status = statusMap[subscription.status] || statusMap.active;
  const monthly = Number(subscription.monthly_price) || 0;
  const normalMonthly = getNormalMonthlyPrice(subscription.plan_name);
  const isPromo = normalMonthly !== null && normalMonthly > monthly && monthly > 0;

  return (
    <Card className="glass-card p-6">
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2 text-muted-foreground text-xs uppercase tracking-wider">
            <CreditCard className="w-3.5 h-3.5" />
            Plano atual
          </div>
          <h2 className="text-2xl font-bold tracking-tight">{subscription.plan_name}</h2>
          <p className="text-sm text-muted-foreground">{cycleLabel}</p>
        </div>
        <Badge variant="outline" className={status.className}>{status.label}</Badge>
      </div>
      {subscription.billing_cycle === 'yearly' ? (
        <>
          <div className="mt-6 flex items-baseline gap-2">
            <span className="text-3xl font-bold">{formatBRL(monthly * 12)}</span>
            <span className="text-sm text-muted-foreground">/ano</span>
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            Equivale a {formatBRL(monthly)}/mês · pagamento único anual
          </p>
          {isPromo && (
            <div className="mt-2 inline-flex items-center gap-1.5 px-2 py-1 rounded-md bg-amber-500/10 border border-amber-500/30 text-amber-400 text-[11px] font-medium">
              <Tag className="w-3 h-3" />
              Preço promocional · normal {formatBRL(normalMonthly!)}/mês
            </div>
          )}
        </>
      ) : (
        <>
          <div className="mt-6 flex items-baseline gap-2">
            <span className="text-3xl font-bold">{formatBRL(monthly)}</span>
            <span className="text-sm text-muted-foreground">/mês</span>
          </div>
          {isPromo && (
            <div className="mt-2 flex items-center gap-2">
              <span className="text-sm text-muted-foreground line-through decoration-muted-foreground/60">
                {formatBRL(normalMonthly!)}
              </span>
              <span className="inline-flex items-center gap-1 text-[11px] px-1.5 py-0.5 rounded-md bg-amber-500/10 border border-amber-500/30 text-amber-400 font-semibold">
                <Tag className="w-3 h-3" />
                Promo de lançamento
              </span>
            </div>
          )}
        </>
      )}
      {(subscription as any)?.cancel_at_period_end ? (
        <div className="mt-5 pt-4 border-t border-border/60">
          <p className="text-xs text-muted-foreground">
            Troca de plano indisponível enquanto houver cancelamento agendado. Reative a assinatura para alterar o plano.
          </p>
        </div>
      ) : onChangePlan ? (
        <div className="mt-5 pt-4 border-t border-border/60">
          <Button onClick={onChangePlan} className="w-full sm:w-auto">
            <ArrowUpDown className="w-4 h-4 mr-2" /> Trocar de plano
          </Button>
        </div>
      ) : null}
    </Card>
  );
}
