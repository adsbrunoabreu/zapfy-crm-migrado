import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Loader2, AlertCircle } from 'lucide-react';
import { formatBRL, subStatusLabel, type SubStatus } from './types';

interface Plan {
  id: string;
  name: string;
  monthly_price: number;
  yearly_price: number;
  is_active: boolean;
}

interface Props {
  subLoading: boolean;
  subscription: any;
  plans: Plan[];
  planId: string | null;
  planName: string;
  monthlyPrice: string;
  billingCycle: 'monthly' | 'yearly';
  subStatus: SubStatus;
  effectiveMrr: number;
  upsertPending: boolean;

  onApplyPlan: (id: string) => void;
  onPlanNameChange: (v: string) => void;
  onPriceChange: (v: string) => void;
  onCycleChange: (v: 'monthly' | 'yearly') => void;
  onSubStatusChange: (v: SubStatus) => void;
  onSave: () => void;
}

export function PlanTab({
  subLoading,
  subscription,
  plans,
  planId,
  planName,
  monthlyPrice,
  billingCycle,
  subStatus,
  effectiveMrr,
  upsertPending,
  onApplyPlan,
  onPlanNameChange,
  onPriceChange,
  onCycleChange,
  onSubStatusChange,
  onSave,
}: Props) {
  if (subLoading) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <>
      {subscription ? (
        <Card className="p-4 bg-secondary/30">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs text-muted-foreground">Assinatura atual</p>
              <p className="font-semibold">{subscription.plan_name}</p>
            </div>
            <Badge variant="outline" className={subStatusLabel[subscription.status as SubStatus].cls}>
              {subStatusLabel[subscription.status as SubStatus].label}
            </Badge>
          </div>
        </Card>
      ) : (
        <Card className="p-4 border-dashed flex items-center gap-2 text-sm text-muted-foreground">
          <AlertCircle className="w-4 h-4" />
          Nenhuma assinatura ativa. Configure abaixo.
        </Card>
      )}

      <div className="space-y-2">
        <Label>Plano do catálogo</Label>
        <Select value={planId ?? '__custom__'} onValueChange={onApplyPlan}>
          <SelectTrigger>
            <SelectValue placeholder="Selecione" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__custom__">Customizado</SelectItem>
            {plans
              .filter((p) => p.is_active || p.id === planId)
              .map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.name} ·{' '}
                  {formatBRL(billingCycle === 'yearly' ? p.yearly_price : p.monthly_price)}
                </SelectItem>
              ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-2">
        <Label>Nome do plano</Label>
        <Input value={planName} onChange={(e) => onPlanNameChange(e.target.value)} />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-2">
          <Label>Valor (R$)</Label>
          <Input
            type="number"
            step="0.01"
            value={monthlyPrice}
            onChange={(e) => onPriceChange(e.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label>Ciclo</Label>
          <Select value={billingCycle} onValueChange={(v) => onCycleChange(v as 'monthly' | 'yearly')}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="monthly">Mensal</SelectItem>
              <SelectItem value="yearly">Anual</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="space-y-2">
        <Label>Status da assinatura</Label>
        <Select value={subStatus} onValueChange={(v) => onSubStatusChange(v as SubStatus)}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="trialing">Em teste</SelectItem>
            <SelectItem value="active">Ativa</SelectItem>
            <SelectItem value="past_due">Atrasada</SelectItem>
            <SelectItem value="canceled">Cancelada</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <Card className="p-3 bg-secondary/30 text-sm">
        <span className="text-muted-foreground">MRR efetivo: </span>
        <span className="font-medium text-emerald">{formatBRL(effectiveMrr)}</span>
        {billingCycle === 'yearly' && (
          <span className="text-xs text-muted-foreground ml-1">(anual ÷ 12)</span>
        )}
      </Card>

      <Button className="w-full" onClick={onSave} disabled={upsertPending}>
        {upsertPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
        {subscription ? 'Salvar assinatura' : 'Criar assinatura'}
      </Button>
    </>
  );
}
