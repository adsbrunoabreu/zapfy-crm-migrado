import { useState } from 'react';
import { format, startOfMonth, endOfMonth } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Target, Calendar, DollarSign, Users, TrendingUp } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { DatePicker } from '@/components/ui/date-picker';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import { useCreateGoal, CreateGoalData } from '@/hooks/useUserGoals';

interface SetGoalDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  member: {
    id: string;
    name: string;
    email: string;
  };
}

const goalTypeConfig = {
  leads: { label: 'Leads', icon: Users, description: 'Quantidade de leads atribuídos' },
  value: { label: 'Valor', icon: DollarSign, description: 'Valor total em leads' },
  conversions: { label: 'Conversões', icon: TrendingUp, description: 'Leads fechados (won)' },
};

export function SetGoalDialog({ open, onOpenChange, member }: SetGoalDialogProps) {
  const createGoal = useCreateGoal();
  const [goalType, setGoalType] = useState<'leads' | 'value' | 'conversions'>('leads');
  const [targetValue, setTargetValue] = useState('');
  const [periodStart, setPeriodStart] = useState<Date>(startOfMonth(new Date()));
  const [periodEnd, setPeriodEnd] = useState<Date>(endOfMonth(new Date()));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!targetValue || parseFloat(targetValue) <= 0) return;

    const data: CreateGoalData = {
      user_id: member.id,
      goal_type: goalType,
      target_value: parseFloat(targetValue),
      period_start: format(periodStart, 'yyyy-MM-dd'),
      period_end: format(periodEnd, 'yyyy-MM-dd'),
    };

    await createGoal.mutateAsync(data);
    onOpenChange(false);
    resetForm();
  };

  const resetForm = () => {
    setGoalType('leads');
    setTargetValue('');
    setPeriodStart(startOfMonth(new Date()));
    setPeriodEnd(endOfMonth(new Date()));
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Target className="w-5 h-5 text-primary" />
            Definir Meta para {member.name}
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="space-y-2">
            <Label>Tipo de Meta</Label>
            <Select value={goalType} onValueChange={(v) => setGoalType(v as typeof goalType)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(goalTypeConfig).map(([key, config]) => {
                  const Icon = config.icon;
                  return (
                    <SelectItem key={key} value={key}>
                      <div className="flex items-center gap-2">
                        <Icon className="w-4 h-4" />
                        <span>{config.label}</span>
                      </div>
                    </SelectItem>
                  );
                })}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              {goalTypeConfig[goalType].description}
            </p>
          </div>

          <div className="space-y-2">
            <Label>Valor da Meta</Label>
            <div className="relative">
              {goalType === 'value' && (
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                  R$
                </span>
              )}
              <Input
                type="number"
                placeholder={goalType === 'value' ? '10000' : '10'}
                value={targetValue}
                onChange={(e) => setTargetValue(e.target.value)}
                className={cn(goalType === 'value' && 'pl-10')}
                min="1"
                required
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Data Início</Label>
              <DatePicker value={periodStart} onChange={(d) => d && setPeriodStart(d)} placeholder="Selecionar" className="w-full" />
            </div>
            <div className="space-y-2">
              <Label>Data Fim</Label>
              <DatePicker value={periodEnd} onChange={(d) => d && setPeriodEnd(d)} placeholder="Selecionar" className="w-full" />
            </div>
          </div>

          <div className="flex justify-end gap-3">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" variant="glow" disabled={createGoal.isPending}>
              {createGoal.isPending ? 'Salvando...' : 'Salvar Meta'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
