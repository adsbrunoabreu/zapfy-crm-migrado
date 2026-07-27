import { useMemo, useState, useEffect } from 'react';
import { differenceInDays, format, startOfMonth, endOfMonth } from 'date-fns';
import { Building2, Loader2, Settings2, Target, Users, Workflow } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { DatePicker } from '@/components/ui/date-picker';
import { CurrencyInput } from '@/components/ui/currency-input';
import { cn } from '@/lib/utils';
import { useUpsertTeamGoal, type GoalMetric, type GoalScope, type TeamGoal } from '@/hooks/useTeamGoals';
import { useGoalGroups } from '@/hooks/useGoalGroups';
import { usePipelines } from '@/hooks/usePipelines';
import { METRIC_CONFIG } from '@/lib/goals/metrics';
import { SmartTargetSuggestion } from './SmartTargetSuggestion';
import { GoalGroupsManager } from './GoalGroupsManager';

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  /** Quando passado, abre em modo edição */
  goal?: TeamGoal | null;
}

const SCOPE_OPTIONS: { value: GoalScope; label: string; description: string; icon: React.ElementType }[] = [
  { value: 'company', label: 'Empresa toda', description: 'Soma de todos os agentes', icon: Building2 },
  { value: 'group', label: 'Grupo / Squad', description: 'Squad customizado de agentes', icon: Users },
  { value: 'pipeline', label: 'Funil', description: 'Todos os leads de um pipeline', icon: Workflow },
];

export function CreateTeamGoalDialog({ open, onOpenChange, goal }: Props) {
  const upsert = useUpsertTeamGoal();
  const { data: groups = [] } = useGoalGroups();
  const { data: pipelines = [] } = usePipelines();

  const [name, setName] = useState('');
  const [scope, setScope] = useState<GoalScope>('company');
  const [groupId, setGroupId] = useState<string>('');
  const [pipelineId, setPipelineId] = useState<string>('');
  const [metric, setMetric] = useState<GoalMetric>('value');
  const [targetValue, setTargetValue] = useState<number | null>(null);
  const [periodStart, setPeriodStart] = useState<Date>(startOfMonth(new Date()));
  const [periodEnd, setPeriodEnd] = useState<Date>(endOfMonth(new Date()));
  const [groupsOpen, setGroupsOpen] = useState(false);

  // Hidrata edição
  useEffect(() => {
    if (goal) {
      setName(goal.name);
      setScope(goal.scope);
      setGroupId(goal.group_id ?? '');
      setPipelineId(goal.pipeline_id ?? '');
      setMetric(goal.metric);
      setTargetValue(Number(goal.target_value));
      setPeriodStart(new Date(goal.period_start + 'T00:00:00'));
      setPeriodEnd(new Date(goal.period_end + 'T00:00:00'));
    } else if (open) {
      setName('');
      setScope('company');
      setGroupId('');
      setPipelineId('');
      setMetric('value');
      setTargetValue(null);
      setPeriodStart(startOfMonth(new Date()));
      setPeriodEnd(endOfMonth(new Date()));
    }
  }, [goal, open]);

  const periodDays = useMemo(() => Math.max(1, differenceInDays(periodEnd, periodStart) + 1), [periodStart, periodEnd]);

  const selectedGroup = groups.find((g) => g.id === groupId);
  const userIds = scope === 'group' && selectedGroup ? (selectedGroup.members ?? []).map((m) => m.user_id) : null;

  const canSubmit =
    name.trim().length > 0 &&
    (targetValue ?? 0) > 0 &&
    periodEnd >= periodStart &&
    (scope !== 'group' || groupId) &&
    (scope !== 'pipeline' || pipelineId);

  const handleSubmit = async () => {
    if (!canSubmit) return;
    await upsert.mutateAsync({
      id: goal?.id,
      name: name.trim(),
      scope,
      group_id: scope === 'group' ? groupId : null,
      pipeline_id: scope === 'pipeline' ? pipelineId : null,
      metric,
      target_value: targetValue ?? 0,
      period_start: format(periodStart, 'yyyy-MM-dd'),
      period_end: format(periodEnd, 'yyyy-MM-dd'),
    });
    onOpenChange(false);
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Target className="w-5 h-5 text-primary" />
              {goal ? 'Editar meta de equipe' : 'Nova meta de equipe'}
            </DialogTitle>
            <DialogDescription>
              Defina escopo, métrica, período e use a sugestão inteligente para o valor-alvo.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-5">
            <div className="space-y-2">
              <Label>Nome da meta</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex: Vendas SP - Janeiro" />
            </div>

            <div className="space-y-2">
              <Label>Escopo</Label>
              <RadioGroup
                value={scope}
                onValueChange={(v) => setScope(v as GoalScope)}
                className="grid grid-cols-3 gap-2"
              >
                {SCOPE_OPTIONS.map((opt) => {
                  const Icon = opt.icon;
                  return (
                    <label
                      key={opt.value}
                      className={cn(
                        'flex flex-col gap-1 p-3 rounded-lg border cursor-pointer transition-colors',
                        scope === opt.value
                          ? 'border-primary bg-primary/5'
                          : 'border-border/60 hover:bg-secondary/30',
                      )}
                    >
                      <div className="flex items-center justify-between">
                        <Icon className="w-4 h-4 text-primary" />
                        <RadioGroupItem value={opt.value} className="sr-only" />
                        {scope === opt.value && <span className="w-2 h-2 rounded-full bg-primary" />}
                      </div>
                      <p className="text-sm font-medium">{opt.label}</p>
                      <p className="text-[10px] text-muted-foreground leading-tight">{opt.description}</p>
                    </label>
                  );
                })}
              </RadioGroup>
            </div>

            {scope === 'group' && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label>Grupo</Label>
                  <Button size="sm" variant="ghost" onClick={() => setGroupsOpen(true)} className="h-7 gap-1 text-xs">
                    <Settings2 className="w-3 h-3" /> Gerenciar grupos
                  </Button>
                </div>
                <Select value={groupId} onValueChange={setGroupId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione um grupo" />
                  </SelectTrigger>
                  <SelectContent>
                    {groups.length === 0 ? (
                      <div className="px-2 py-1.5 text-xs text-muted-foreground">
                        Nenhum grupo criado. Use "Gerenciar grupos".
                      </div>
                    ) : (
                      groups.map((g) => (
                        <SelectItem key={g.id} value={g.id}>
                          <span className="flex items-center gap-2">
                            <span className="w-2 h-2 rounded-full" style={{ backgroundColor: g.color }} />
                            {g.name} <span className="text-muted-foreground text-xs">({g.members?.length ?? 0})</span>
                          </span>
                        </SelectItem>
                      ))
                    )}
                  </SelectContent>
                </Select>
              </div>
            )}

            {scope === 'pipeline' && (
              <div className="space-y-2">
                <Label>Funil</Label>
                <Select value={pipelineId} onValueChange={setPipelineId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione um funil" />
                  </SelectTrigger>
                  <SelectContent>
                    {pipelines.map((p: any) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className="space-y-2">
              <Label>Métrica</Label>
              <Select value={metric} onValueChange={(v) => setMetric(v as GoalMetric)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.values(METRIC_CONFIG).map((cfg) => {
                    const Icon = cfg.icon;
                    return (
                      <SelectItem key={cfg.key} value={cfg.key}>
                        <span className="flex items-center gap-2">
                          <Icon className="w-3.5 h-3.5" />
                          <span className="font-medium">{cfg.label}</span>
                        </span>
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
              <p className="text-[11px] text-muted-foreground">{METRIC_CONFIG[metric].description}</p>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Início</Label>
                <DatePicker value={periodStart} onChange={(d) => d && setPeriodStart(d)} />
              </div>
              <div className="space-y-2">
                <Label>Fim</Label>
                <DatePicker value={periodEnd} onChange={(d) => d && setPeriodEnd(d)} />
              </div>
            </div>

            <SmartTargetSuggestion
              metric={metric}
              scope={scope}
              userIds={userIds}
              pipelineId={pipelineId || null}
              periodDays={periodDays}
              onPick={(v) => setTargetValue(v)}
            />

            <div className="space-y-2">
              <Label>Valor-alvo</Label>
              {METRIC_CONFIG[metric].unit === 'currency' ? (
                <CurrencyInput value={targetValue} onValueChange={setTargetValue} />
              ) : (
                <Input
                  type="number"
                  step={METRIC_CONFIG[metric].unit === 'percentage' ? '0.1' : '1'}
                  value={targetValue ?? ''}
                  onChange={(e) => setTargetValue(e.target.value === '' ? null : Number(e.target.value))}
                  placeholder="0"
                />
              )}
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                Cancelar
              </Button>
              <Button onClick={handleSubmit} disabled={!canSubmit || upsert.isPending}>
                {upsert.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                {goal ? 'Salvar alterações' : 'Criar meta'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <GoalGroupsManager open={groupsOpen} onOpenChange={setGroupsOpen} />
    </>
  );
}
