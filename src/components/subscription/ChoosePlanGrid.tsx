import { useEffect, useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Check, Sparkles, Tag, ArrowRight } from 'lucide-react';
import { useSubscriptionPlans, type SubscriptionPlan } from '@/hooks/useSubscriptionPlans';
import { CheckoutInlineDialog } from '@/components/subscription/CheckoutInlineDialog';
import { cn } from '@/lib/utils';
import { getNormalMonthlyPrice } from '@/lib/promoPricing';

const formatBRL = (n: number) =>
  n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 0 });

interface Props {
  title?: string;
  subtitle?: string;
  initialCycle?: 'monthly' | 'yearly';
  onCycleChange?: (cycle: 'monthly' | 'yearly') => void;
}

/**
 * Grid inline de planos para o usuário escolher e pagar sem sair da plataforma.
 * Visual alinhado à landing page (PricingSection) com plano Pro destacado.
 */
export function ChoosePlanGrid({
  title = 'Escolha seu plano e ative sua conta',
  subtitle = 'Pagamento seguro por cartão ou Pix — sem sair da plataforma.',
  initialCycle,
  onCycleChange,
}: Props) {
  const { data: plans } = useSubscriptionPlans();
  const [cycle, setCycle] = useState<'monthly' | 'yearly'>(initialCycle || 'monthly');
  const [chosen, setChosen] = useState<SubscriptionPlan | null>(null);

  useEffect(() => {
    if (initialCycle && initialCycle !== cycle) setCycle(initialCycle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialCycle]);

  const handleCycle = (v: 'monthly' | 'yearly') => {
    setCycle(v);
    onCycleChange?.(v);
  };

  const activePlans = (plans || []).filter((p) => p.is_active);
  if (!activePlans.length) return null;

  return (
    <Card className="glass-card p-6 sm:p-8 space-y-6 border-border/60">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-lg bg-primary/15 border border-primary/30 flex items-center justify-center shrink-0">
            <Sparkles className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h2 className="font-display text-xl sm:text-2xl font-bold tracking-tight">{title}</h2>
            <p className="text-sm text-muted-foreground mt-0.5">{subtitle}</p>
          </div>
        </div>

        {/* Toggle estilo landing */}
        <div className="inline-flex items-center gap-1 p-1 rounded-full bg-card border border-border/60">
          <button
            onClick={() => handleCycle('monthly')}
            className={cn(
              'px-4 py-1.5 rounded-full text-sm font-medium transition-colors',
              cycle === 'monthly'
                ? 'bg-primary text-primary-foreground'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            Mensal
          </button>
          <button
            onClick={() => handleCycle('yearly')}
            className={cn(
              'px-4 py-1.5 rounded-full text-sm font-medium transition-colors flex items-center gap-1.5',
              cycle === 'yearly'
                ? 'bg-primary text-primary-foreground'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            Anual
            <Badge variant="success" size="xs" className="font-bold">economize</Badge>
          </button>
        </div>
      </div>

      <Badge variant="brand" size="lg" className="w-fit">
        <Tag className="w-4 h-4" />
        Valores promocionais de lançamento · por tempo limitado
      </Badge>

      {/* Grid de planos */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5 pt-2">
        {activePlans.map((plan) => {
          const monthly = Number(plan.monthly_price) || 0;
          const yearly = Number(plan.yearly_price) || 0;
          const isFree = (cycle === 'monthly' ? monthly : yearly) === 0;
          const yearlyMonthly = yearly > 0 ? yearly / 12 : 0;
          const savings = monthly > 0 && yearly > 0 ? monthly * 12 - yearly : 0;
          const normalPrice = getNormalMonthlyPrice(plan.name);
          const showNormalPrice = cycle === 'monthly' && normalPrice && normalPrice > monthly && monthly > 0;
          const planNameLower = plan.name.toLowerCase();
          const isFeatured = (plan as any).is_featured ||
            (planNameLower.includes('pro') && !planNameLower.includes('enterprise'));

          return (
            <div
              key={plan.id}
              className={cn(
                'relative rounded-2xl p-6 flex flex-col transition-all',
                isFeatured
                  ? 'bg-card border-2 border-blue-500 md:scale-[1.04] shadow-[0_0_60px_-10px_hsl(220_90%_55%/0.55)] ring-1 ring-blue-500/30 z-10'
                  : 'bg-card/60 border border-border/60 hover:border-blue-500/40',
              )}
            >
              {isFeatured && (
                <Badge className="absolute -top-3 left-1/2 -translate-x-1/2 bg-blue-600 hover:bg-blue-600 text-white border-transparent shadow-lg shadow-blue-600/40 font-semibold">
                  <Sparkles className="w-3 h-3" />
                  Mais vendido
                </Badge>
              )}

              <h3 className="font-display text-lg font-bold">{plan.name}</h3>
              {plan.description && (
                <p className="text-muted-foreground text-sm mt-1 min-h-[40px]">
                  {plan.description}
                </p>
              )}

              <div className="mt-4 min-h-[80px]">
                {isFree ? (
                  <div className="flex items-baseline gap-1">
                    <span className="font-display text-4xl font-extrabold">Grátis</span>
                  </div>
                ) : cycle === 'yearly' ? (
                  <>
                    <div className="flex items-baseline gap-1">
                      <span className="font-display text-4xl font-extrabold">{formatBRL(yearly)}</span>
                      <span className="text-muted-foreground text-sm">/ano</span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">
                      Equivale a {formatBRL(yearlyMonthly)}/mês · pagamento único anual
                    </p>
                    {savings > 0 && (
                      <p className="text-xs text-emerald-400 mt-0.5">
                        Economize {formatBRL(savings)} no ano
                      </p>
                    )}
                  </>
                ) : (
                  <>
                    <div className="flex items-baseline gap-2">
                      <span className="font-display text-4xl font-extrabold">{formatBRL(monthly)}</span>
                      <span className="text-muted-foreground text-sm">/mês</span>
                    </div>
                    {showNormalPrice && (
                      <div className="flex items-center gap-2 mt-1.5">
                        <span className="text-sm text-muted-foreground line-through decoration-muted-foreground/60">
                          De {formatBRL(normalPrice!)}
                        </span>
                        <Badge variant="success" size="xs" className="font-semibold">
                          −{Math.round(((normalPrice! - monthly) / normalPrice!) * 100)}%
                        </Badge>
                      </div>
                    )}
                  </>
                )}
              </div>

              <ul className="mt-5 space-y-2.5 flex-1">
                {(plan.features || []).map((f, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm">
                    <Check className={cn('w-4 h-4 mt-0.5 shrink-0', isFeatured ? 'text-blue-400' : 'text-primary')} />
                    <span className="text-foreground/90">{f}</span>
                  </li>
                ))}
              </ul>

              <Button
                className={cn(
                  'mt-6 w-full h-11 gap-2',
                  isFeatured
                    ? 'bg-blue-600 hover:bg-blue-500 text-white border-0 shadow-lg shadow-blue-600/30'
                    : 'border-blue-500/40 hover:border-blue-500 hover:bg-blue-500/10',
                )}
                variant={isFeatured ? 'default' : 'outline'}
                onClick={() => setChosen(plan)}
              >
                Assinar agora <ArrowRight className="w-4 h-4" />
              </Button>
            </div>
          );
        })}
      </div>

      <p className="text-center text-xs text-muted-foreground">
        Pagamento processado pelo Asaas · cartão de crédito ou Pix · cancele quando quiser
      </p>

      <CheckoutInlineDialog
        open={!!chosen}
        onOpenChange={(v) => !v && setChosen(null)}
        plan={chosen}
        cycle={cycle}
      />
    </Card>
  );
}
