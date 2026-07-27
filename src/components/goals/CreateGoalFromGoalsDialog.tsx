import { useMemo, useState } from 'react';
import { differenceInDays, format, startOfMonth, endOfMonth } from 'date-fns';
import { Target } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { DatePicker } from '@/components/ui/date-picker';
import { CurrencyInput } from '@/components/ui/currency-input';
import { useCreateGoal, CreateGoalData, GoalType } from '@/hooks/useUserGoals';
import { useTeamMembers } from '@/hooks/useTeamMembers';
import { METRIC_CONFIG } from '@/lib/goals/metrics';
import { SmartTargetSuggestion } from './SmartTargetSuggestion';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CreateGoalFromGoalsDialog({ open, onOpenChange }: Props) {
  const createGoal = useCreateGoal();
  const { data: members = [] } = useTeamMembers();
  const [userId, setUserId] = useState('');
  const [goalType, setGoalType] = useState<GoalType>('value');
  const [targetValue, setTargetValue] = useState<number | null>(null);
  const [periodStart, setPeriodStart] = useState<Date>(startOfMonth(new Date()));
  const [periodEnd, setPeriodEnd] = useState<Date>(endOfMonth(new Date()));

  const periodDays = useMemo(
    () => Math.max(1, differenceInDays(periodEnd, periodStart) + 1),
    [periodStart, periodEnd],
  );

  const reset = () => {
    setUserId('');
    setGoalType('value');
    setTargetValue(null);
    setPeriodStart(startOfMonth(new Date()));
    setPeriodEnd(endOfMonth(new Date()));
  };

  const canSubmit = userId && (targetValue ?? 0) > 0 && periodEnd >= periodStart;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    const data: CreateGoalData = {
      user_id: userId,
      goal_type: goalType,
      target_value: targetValue ?? 0,
      period_start: format(periodStart, 'yyyy-MM-dd'),
      period_end: format(periodEnd, 'yyyy-MM-dd'),
    };
    await createGoal.mutateAsync(data);
    onOpenChange(false);
    reset();
  };

  const cfg = METRIC_CONFIG[goalType];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[520px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Target className="w-5 h-5 text-primary" /> Nova meta individual
          </DialogTitle>
          <DialogDescription>Defina meta personalizada por agente com sugestão inteligente.</DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="space-y-2">
            <Label>Agente</Label>
            <Select value={userId} onValueChange={setUserId}>
              <SelectTrigger>
                <SelectValue placeholder="Selecione um agente" />
              </SelectTrigger>
              <SelectContent>
                {members.map((m: any) => (
                  <SelectItem key={m.id} value={m.id}>
                    {m.name || m.email}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Métrica</Label>
            <Select value={goalType} onValueChange={(v) => setGoalType(v as GoalType)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.values(METRIC_CONFIG).map((c) => {
                  const Icon = c.icon;
                  return (
                    <SelectItem key={c.key} value={c.key}>
                      <span className="flex items-center gap-2">
                        <Icon className="w-3.5 h-3.5" /> {c.label}
                      </span>
                    </SelectItem>
                  );
                })}
              </SelectContent>
            </Select>
            <p className="text-[11px] text-muted-foreground">{cfg.description}</p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Início</Label>
              <DatePicker value={periodStart} onChange={(d) => d && setPeriodStart(d)} className="w-full" />
            </div>
            <div className="space-y-2">
              <Label>Fim</Label>
              <DatePicker value={periodEnd} onChange={(d) => d && setPeriodEnd(d)} className="w-full" />
            </div>
          </div>

          {userId && (
            <SmartTargetSuggestion
              metric={goalType}
              scope="group"
              userIds={[userId]}
              periodDays={periodDays}
              onPick={(v) => setTargetValue(v)}
            />
          )}

          <div className="space-y-2">
            <Label>Valor-alvo</Label>
            {cfg.unit === 'currency' ? (
              <CurrencyInput value={targetValue} onValueChange={setTargetValue} />
            ) : (
              <Input
                type="number"
                step={cfg.unit === 'percentage' ? '0.1' : '1'}
                value={targetValue ?? ''}
                onChange={(e) => setTargetValue(e.target.value === '' ? null : Number(e.target.value))}
                placeholder="0"
              />
            )}
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" variant="glow" disabled={createGoal.isPending || !canSubmit}>
              {createGoal.isPending ? 'Salvando...' : 'Criar meta'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
