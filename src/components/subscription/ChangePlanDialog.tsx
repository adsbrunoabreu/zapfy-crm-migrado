import { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Check, Loader2, Tag } from 'lucide-react';
import { useSubscriptionPlans, SubscriptionPlan } from '@/hooks/useSubscriptionPlans';
import { useChangePlan } from '@/hooks/useChangePlan';
import { Subscription } from '@/hooks/useSubscriptions';
import { cn } from '@/lib/utils';
import { getNormalMonthlyPrice } from '@/lib/promoPricing';

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  current: Subscription | null;
  companyId?: string;
  initialPlanId?: string | null;
  initialCycle?: 'monthly' | 'yearly';
  /** Notifica quando o usuário trocar plano/ciclo dentro do diálogo, para persistência. */
  onSelectionChange?: (sel: { planId?: string | null; cycle?: 'monthly' | 'yearly' }) => void;
}

const formatBRL = (n: number) =>
  n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

export function ChangePlanDialog({ open, onOpenChange, current, companyId, initialPlanId, initialCycle, onSelectionChange }: Props) {
  const { data: plans } = useSubscriptionPlans();
  const change = useChangePlan(companyId);
  const [cycle, setCycle] = useState<'monthly' | 'yearly'>(initialCycle || current?.billing_cycle || 'monthly');
  const [selectedId, setSelectedId] = useState<string | null>(initialPlanId ?? null);

  useEffect(() => {
    if (open) {
      if (initialPlanId) setSelectedId(initialPlanId);
      if (initialCycle) setCycle(initialCycle);
    }
  }, [open, initialPlanId, initialCycle]);

  const handleCycleChange = (v: 'monthly' | 'yearly') => {
    setCycle(v);
    onSelectionChange?.({ planId: selectedId, cycle: v });
  };
  const handleSelectPlan = (id: string) => {
    setSelectedId(id);
    onSelectionChange?.({ planId: id, cycle });
  };

  const activePlans = (plans || []).filter((p) => p.is_active);
  const currentPlanId = current?.plan_id;

  const handleConfirm = async () => {
    if (!selectedId) return;
    await change.mutateAsync({ planId: selectedId, billingCycle: cycle });
    onOpenChange(false);
    setSelectedId(null);
  };

  const yearlyDiscount = (p: SubscriptionPlan) => {
    if (!p.monthly_price || !p.yearly_price) return 0;
    const fullYear = p.monthly_price * 12;
    if (fullYear <= 0) return 0;
    return Math.round(((fullYear - p.yearly_price) / fullYear) * 100);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Trocar de plano</DialogTitle>
          <DialogDescription>
            Upgrades começam imediatamente. Downgrades entram em vigor ao fim do período atual.
          </DialogDescription>
        </DialogHeader>

        <Tabs value={cycle} onValueChange={(v) => handleCycleChange(v as 'monthly' | 'yearly')}>
          <TabsList className="grid w-fit grid-cols-2">
            <TabsTrigger value="monthly">Mensal</TabsTrigger>
            <TabsTrigger value="yearly">Anual · economize</TabsTrigger>
          </TabsList>
        </Tabs>

        <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-amber-500/10 border border-amber-500/30 text-amber-400 text-xs font-medium w-fit">
          <Tag className="w-3.5 h-3.5" />
          Valores promocionais de lançamento · por tempo limitado
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mt-4">
          {activePlans.map((p) => {
            const isYearly = cycle === 'yearly';
            const monthlyEquiv = isYearly ? (p.yearly_price || 0) / 12 : p.monthly_price;
            const isCurrent = p.id === currentPlanId && cycle === current?.billing_cycle;
            const isSelected = p.id === selectedId;
            const discount = yearlyDiscount(p);
            return (
              <Card
                key={p.id}
                onClick={() => !isCurrent && handleSelectPlan(p.id)}
                className={cn(
                  'glass-card p-4 transition-colors cursor-pointer',
                  isSelected && 'ring-2 ring-primary',
                  isCurrent && 'opacity-60 cursor-not-allowed',
                )}
              >
                <div className="flex items-center justify-between">
                  <h3 className="font-semibold">{p.name}</h3>
                  {isCurrent && <span className="text-xs text-muted-foreground">Atual</span>}
                </div>
                {isYearly ? (
                  <>
                    <div className="mt-2 flex items-baseline gap-1">
                      <span className="text-2xl font-bold">{formatBRL(p.yearly_price || 0)}</span>
                      <span className="text-xs text-muted-foreground">/ano</span>
                    </div>
                    <p className="text-[11px] text-muted-foreground mt-0.5">
                      Equivale a {formatBRL(monthlyEquiv)}/mês · pagamento único anual
                    </p>
                    {discount > 0 && (
                      <p className="text-xs text-emerald mt-0.5">Economize {discount}%</p>
                    )}
                  </>
                ) : (
                  <>
                    <div className="mt-2 flex items-baseline gap-1">
                      <span className="text-2xl font-bold">{formatBRL(p.monthly_price)}</span>
                      <span className="text-xs text-muted-foreground">/mês</span>
                    </div>
                    {(() => {
                      const normal = getNormalMonthlyPrice(p.name);
                      if (normal && normal > p.monthly_price && p.monthly_price > 0) {
                        return (
                          <p className="text-[11px] text-muted-foreground mt-0.5">
                            de <span className="line-through">{formatBRL(normal)}</span> por{' '}
                            <span className="text-amber-400 font-semibold">{formatBRL(p.monthly_price)}</span>
                          </p>
                        );
                      }
                      return null;
                    })()}
                  </>
                )}
                <ul className="mt-3 space-y-1.5 text-xs">
                  {(p.features || []).slice(0, 6).map((f, i) => (
                    <li key={i} className="flex items-start gap-1.5">
                      <Check className="w-3.5 h-3.5 text-emerald shrink-0 mt-0.5" />
                      <span>{f}</span>
                    </li>
                  ))}
                </ul>
              </Card>
            );
          })}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button
            disabled={!selectedId || change.isPending}
            onClick={handleConfirm}
          >
            {change.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            Confirmar troca
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
