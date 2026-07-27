import { useEffect, useState } from 'react';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Loader2, CircleDollarSign, Calendar, AlertCircle } from 'lucide-react';
import { useCompanySubscription, useUpsertSubscription } from '@/hooks/useSubscriptions';
import { useSubscriptionPlans } from '@/hooks/useSubscriptionPlans';
import { useToast } from '@/hooks/use-toast';
import { format, addMonths, addYears } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  companyId: string | null;
  companyName: string;
}

const statusLabel: Record<string, { label: string; cls: string }> = {
  active: { label: 'Ativa', cls: 'bg-emerald/20 text-emerald border-emerald/30' },
  trialing: { label: 'Em teste', cls: 'bg-amber/20 text-amber border-amber/30' },
  past_due: { label: 'Atrasada', cls: 'bg-rose/20 text-rose border-rose/30' },
  canceled: { label: 'Cancelada', cls: 'bg-muted text-muted-foreground border-border' },
};

function formatCurrency(value: number) {
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 2 });
}

export function CompanySubscriptionDrawer({ open, onOpenChange, companyId, companyName }: Props) {
  const { toast } = useToast();
  const { data: subscription, isLoading } = useCompanySubscription(companyId || undefined);
  const { data: plans = [] } = useSubscriptionPlans();
  const upsert = useUpsertSubscription();

  const [planId, setPlanId] = useState<string | null>(null);
  const [planName, setPlanName] = useState('Starter');
  const [monthlyPrice, setMonthlyPrice] = useState('97');
  const [billingCycle, setBillingCycle] = useState<'monthly' | 'yearly'>('monthly');
  const [status, setStatus] = useState<'active' | 'trialing' | 'canceled' | 'past_due'>('trialing');

  useEffect(() => {
    if (subscription) {
      setPlanId((subscription as any).plan_id ?? null);
      setPlanName(subscription.plan_name);
      setMonthlyPrice(String(subscription.monthly_price));
      setBillingCycle(subscription.billing_cycle);
      setStatus(subscription.status);
    } else {
      setPlanId(null);
      setPlanName('Starter');
      setMonthlyPrice('97');
      setBillingCycle('monthly');
      setStatus('trialing');
    }
  }, [subscription, companyId]);

  const applyPlan = (id: string) => {
    const p = plans.find((pl) => pl.id === id);
    if (!p) return;
    setPlanId(p.id);
    setPlanName(p.name);
    setMonthlyPrice(String(billingCycle === 'yearly' ? p.yearly_price : p.monthly_price));
  };


  const handleSave = async () => {
    if (!companyId) return;
    const price = parseFloat(monthlyPrice.replace(',', '.'));
    if (isNaN(price) || price < 0) {
      toast({ title: 'Valor inválido', variant: 'destructive' });
      return;
    }

    const now = new Date();
    const periodEnd = billingCycle === 'yearly' ? addYears(now, 1) : addMonths(now, 1);

    try {
      await upsert.mutateAsync({
        id: subscription?.id,
        company_id: companyId,
        plan_id: planId ?? undefined,
        plan_name: planName,
        monthly_price: price,
        billing_cycle: billingCycle,
        status,
        ...(subscription
          ? {}
          : {
              started_at: now.toISOString(),
              current_period_start: now.toISOString(),
              current_period_end: periodEnd.toISOString(),
            }),
        ...(status === 'canceled' && !subscription?.canceled_at ? { canceled_at: now.toISOString() } : {}),
      } as any);
      toast({ title: 'Assinatura salva', description: `Plano de "${companyName}" atualizado.` });
      onOpenChange(false);
    } catch (err: any) {
      toast({ title: 'Erro ao salvar', description: err.message, variant: 'destructive' });
    }
  };

  const handleCancel = async () => {
    if (!subscription) return;
    try {
      await upsert.mutateAsync({
        id: subscription.id,
        company_id: subscription.company_id,
        status: 'canceled',
        canceled_at: new Date().toISOString(),
      });
      toast({ title: 'Assinatura cancelada' });
      onOpenChange(false);
    } catch (err: any) {
      toast({ title: 'Erro', description: err.message, variant: 'destructive' });
    }
  };

  const handlePlanChange = (id: string) => {
    if (id === '__custom__') {
      setPlanId(null);
      return;
    }
    applyPlan(id);
  };

  const effectiveMrr =
    billingCycle === 'yearly'
      ? parseFloat(monthlyPrice.replace(',', '.') || '0') / 12
      : parseFloat(monthlyPrice.replace(',', '.') || '0');

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-xl h-[100dvh] overflow-hidden p-0 flex flex-col">
        <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain">
          <div className="p-6 flex flex-col gap-4">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <CircleDollarSign className="w-5 h-5 text-emerald" />
            Assinatura
          </SheetTitle>
          <SheetDescription>{companyName}</SheetDescription>
        </SheetHeader>

        {isLoading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="space-y-6 py-6">
            {subscription ? (
              <div className="rounded-lg border border-border/50 p-4 space-y-3 bg-secondary/20">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs text-muted-foreground">Plano atual</p>
                    <p className="font-semibold">{subscription.plan_name}</p>
                  </div>
                  <Badge variant="outline" className={statusLabel[subscription.status]?.cls}>
                    {statusLabel[subscription.status]?.label}
                  </Badge>
                </div>
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <p className="text-xs text-muted-foreground">MRR</p>
                    <p className="font-medium text-emerald">{formatCurrency(effectiveMrr)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Próximo vencimento</p>
                    <p className="font-medium flex items-center gap-1">
                      <Calendar className="w-3 h-3" />
                      {format(new Date(subscription.current_period_end), "dd 'de' MMM yyyy", { locale: ptBR })}
                    </p>
                  </div>
                </div>
              </div>
            ) : (
              <div className="rounded-lg border border-dashed border-border p-4 flex items-center gap-2 text-sm text-muted-foreground">
                <AlertCircle className="w-4 h-4" />
                Esta empresa ainda não tem assinatura. Cadastre uma abaixo.
              </div>
            )}

            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Plano do catálogo</Label>
                <Select value={planId ?? '__custom__'} onValueChange={handlePlanChange}>
                  <SelectTrigger><SelectValue placeholder="Selecione um plano" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__custom__">Customizado (definir abaixo)</SelectItem>
                    {plans.filter((p) => p.is_active || p.id === planId).map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.name} · {formatCurrency(billingCycle === 'yearly' ? p.yearly_price : p.monthly_price)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="plan-name">Nome do plano</Label>
                <Input id="plan-name" value={planName} onChange={(e) => setPlanName(e.target.value)} />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label htmlFor="price">Valor (R$)</Label>
                  <Input
                    id="price"
                    type="number"
                    step="0.01"
                    value={monthlyPrice}
                    onChange={(e) => setMonthlyPrice(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Ciclo</Label>
                  <Select value={billingCycle} onValueChange={(v) => setBillingCycle(v as any)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="monthly">Mensal</SelectItem>
                      <SelectItem value="yearly">Anual</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-2">
                <Label>Status</Label>
                <Select value={status} onValueChange={(v) => setStatus(v as any)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="trialing">Em teste</SelectItem>
                    <SelectItem value="active">Ativa</SelectItem>
                    <SelectItem value="past_due">Atrasada</SelectItem>
                    <SelectItem value="canceled">Cancelada</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="rounded-md bg-secondary/30 p-3 text-sm">
                <span className="text-muted-foreground">MRR efetivo: </span>
                <span className="font-medium text-emerald">{formatCurrency(effectiveMrr)}</span>
                {billingCycle === 'yearly' && (
                  <span className="text-xs text-muted-foreground ml-1">(anual ÷ 12)</span>
                )}
              </div>
            </div>

            <div className="flex gap-2 pt-2">
              <Button onClick={handleSave} disabled={upsert.isPending} className="flex-1">
                {upsert.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                {subscription ? 'Salvar alterações' : 'Criar assinatura'}
              </Button>
              {subscription && subscription.status !== 'canceled' && (
                <Button variant="destructive" onClick={handleCancel} disabled={upsert.isPending}>
                  Cancelar
                </Button>
              )}
            </div>
          </div>
        )}
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
