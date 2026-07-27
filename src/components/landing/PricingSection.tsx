import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Check, ArrowRight, Sparkles, Loader2, Tag } from 'lucide-react';
import { usePublicPlans } from '@/hooks/usePublicPlans';

type BillingCycle = 'monthly' | 'yearly';

function formatBRL(value: number) {
  return value.toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: 0,
  });
}

function getNormalPrice(planName: string): number | null {
  const n = planName.toLowerCase();
  if (n.includes('starter') || n.includes('start')) return 197;
  if (n.includes('pro') && !n.includes('enterprise')) return 397;
  if (n.includes('business') || n.includes('enterprise')) return 597;
  return null;
}

export function PricingSection() {
  const navigate = useNavigate();
  const [cycle, setCycle] = useState<BillingCycle>('monthly');
  const { data: plans = [], isLoading } = usePublicPlans();

  if (!isLoading && plans.length === 0) return null;

  return (
    <section id="pricing" className="py-20 md:py-28 bg-secondary/20 border-y border-border/40">
      <div className="max-w-7xl mx-auto px-6">
        <div className="text-center max-w-2xl mx-auto mb-12">
          <span className="text-sm font-semibold text-primary uppercase tracking-wider">
            Planos
          </span>
          <h2 className="font-display text-3xl md:text-5xl font-bold mt-3 tracking-tight">
            Preço justo, sem surpresa
          </h2>
          <p className="text-muted-foreground text-lg mt-4">
            Comece grátis. Sem fidelidade. Cancele quando quiser.
          </p>

          <Badge variant="brand" size="lg" className="mt-6">
            <Tag className="w-4 h-4" />
            Valores promocionais de lançamento · por tempo limitado
          </Badge>

          <div className="inline-flex items-center gap-1 mt-6 p-1 rounded-full bg-card border border-border/60">
            <button
              onClick={() => setCycle('monthly')}
              className={`px-4 py-1.5 rounded-full text-sm font-medium transition-colors ${
                cycle === 'monthly'
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              Mensal
            </button>
            <button
              onClick={() => setCycle('yearly')}
              className={`px-4 py-1.5 rounded-full text-sm font-medium transition-colors flex items-center gap-1.5 ${
                cycle === 'yearly'
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              Anual
              <Badge variant="success" size="xs" className="font-bold">economize</Badge>
            </button>
          </div>
        </div>

        {isLoading ? (
          <div className="flex justify-center py-16">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5 max-w-5xl mx-auto">
            {plans.map((plan) => {
              const monthly = Number(plan.monthly_price) || 0;
              const yearly = Number(plan.yearly_price) || 0;
              const price = cycle === 'monthly' ? monthly : yearly;
              const isFree = price === 0;
              const yearlyMonthly = yearly > 0 ? yearly / 12 : 0;
              const savings = monthly > 0 && yearly > 0 ? monthly * 12 - yearly : 0;
              const normalPrice = getNormalPrice(plan.name);
              const showNormalPrice = cycle === 'monthly' && normalPrice !== null && !isFree && normalPrice > monthly;
              const planNameLower = plan.name.toLowerCase();
              const isFeatured = plan.is_featured || (planNameLower.includes('pro') && !planNameLower.includes('enterprise'));

              return (
                <div
                  key={plan.id}
                  className={`relative rounded-2xl p-7 flex flex-col transition-all ${
                    isFeatured
                      ? 'bg-card border-2 border-blue-500 md:scale-[1.05] shadow-[0_0_80px_-10px_hsl(220_90%_55%/0.55)] ring-1 ring-blue-500/30'
                      : 'bg-card/60 border border-border/60 hover:border-blue-500/40'
                  }`}
                >
                  {isFeatured && (
                    <Badge className="absolute -top-3 left-1/2 -translate-x-1/2 bg-blue-600 hover:bg-blue-600 text-white border-transparent shadow-lg shadow-blue-600/40 font-semibold">
                      <Sparkles className="w-3 h-3" />
                      Mais vendido
                    </Badge>
                  )}

                  <h3 className="font-display text-lg font-bold">{plan.name}</h3>
                  <p className="text-muted-foreground text-sm mt-1 min-h-[40px]">
                    {plan.description || ''}
                  </p>

                  <div className="mt-5 min-h-[80px]">
                    {isFree ? (
                      <div className="flex items-baseline gap-1">
                        <span className="font-display text-4xl font-extrabold">Grátis</span>
                      </div>
                    ) : cycle === 'yearly' ? (
                      <>
                        <div className="flex items-baseline gap-1">
                          <span className="font-display text-4xl font-extrabold">
                            {formatBRL(yearly)}
                          </span>
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
                          <span className="font-display text-4xl font-extrabold">
                            {formatBRL(monthly)}
                          </span>
                          <span className="text-muted-foreground text-sm">/mês</span>
                        </div>
                        {showNormalPrice && (
                          <div className="flex items-center gap-2 mt-1.5">
                            <span className="text-sm text-muted-foreground line-through decoration-muted-foreground/60">
                              De {formatBRL(normalPrice)}
                            </span>
                            <Badge variant="success" size="xs" className="font-semibold">
                              −{Math.round(((normalPrice - monthly) / normalPrice) * 100)}%
                            </Badge>
                          </div>
                        )}
                      </>
                    )}
                  </div>

                  <ul className="mt-6 space-y-2.5 flex-1">
                    {plan.features.map((f, i) => (
                      <li key={i} className="flex items-start gap-2 text-sm">
                        <Check className={`w-4 h-4 mt-0.5 shrink-0 ${isFeatured ? 'text-blue-400' : 'text-primary'}`} />
                        <span className="text-foreground/90">{f}</span>
                      </li>
                    ))}
                  </ul>

                  <Button
                    className={`mt-7 w-full h-11 gap-2 ${
                      isFeatured
                        ? 'bg-blue-600 hover:bg-blue-500 text-white border-0 shadow-lg shadow-blue-600/30'
                        : 'border-blue-500/40 hover:border-blue-500 hover:bg-blue-500/10'
                    }`}
                    variant={isFeatured ? 'default' : 'outline'}
                    onClick={() => navigate(`/auth?plan=${plan.id}&cycle=${cycle}`)}
                  >
                    {isFree ? 'Começar grátis' : 'Começar agora'} <ArrowRight className="w-4 h-4" />
                  </Button>
                </div>
              );
            })}
          </div>
        )}

        <p className="text-center text-xs text-muted-foreground mt-8">
          Todos os planos incluem 1 dia de teste grátis · sem cartão de crédito
        </p>
      </div>
    </section>
  );
}

