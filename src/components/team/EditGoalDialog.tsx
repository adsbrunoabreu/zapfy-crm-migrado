import { useState, useEffect } from 'react';
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
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { CalendarIcon, Loader2 } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import { useUpdateGoal, UserGoal } from '@/hooks/useUserGoals';

interface EditGoalDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  goal: UserGoal;
}

export function EditGoalDialog({ open, onOpenChange, goal }: EditGoalDialogProps) {
  const [goalType, setGoalType] = useState<UserGoal['goal_type']>(goal.goal_type);
  const [targetValue, setTargetValue] = useState(goal.target_value.toString());
  const [periodStart, setPeriodStart] = useState<Date>(parseISO(goal.period_start));
  const [periodEnd, setPeriodEnd] = useState<Date>(parseISO(goal.period_end));

  const updateGoal = useUpdateGoal();

  useEffect(() => {
    setGoalType(goal.goal_type);
    setTargetValue(goal.target_value.toString());
    setPeriodStart(parseISO(goal.period_start));
    setPeriodEnd(parseISO(goal.period_end));
  }, [goal]);

  const handleSubmit = async () => {
    await updateGoal.mutateAsync({
      id: goal.id,
      goal_type: goalType,
      target_value: parseFloat(targetValue) || 0,
      period_start: format(periodStart, 'yyyy-MM-dd'),
      period_end: format(periodEnd, 'yyyy-MM-dd'),
    });
    onOpenChange(false);
  };

  const goalTypeLabels = {
    leads: 'Leads',
    value: 'Valor (R$)',
    conversions: 'Conversões',
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Editar Meta</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label>Tipo de Meta</Label>
            <Select value={goalType} onValueChange={(v) => setGoalType(v as any)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="leads">Quantidade de Leads</SelectItem>
                <SelectItem value="value">Valor Total (R$)</SelectItem>
                <SelectItem value="conversions">Conversões</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Valor da Meta</Label>
            <Input
              type="number"
              value={targetValue}
              onChange={(e) => setTargetValue(e.target.value)}
              placeholder={goalType === 'value' ? 'Ex: 50000' : 'Ex: 20'}
            />
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
        </div>

        <div className="flex justify-end gap-3">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={handleSubmit} disabled={updateGoal.isPending}>
            {updateGoal.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            Salvar
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
