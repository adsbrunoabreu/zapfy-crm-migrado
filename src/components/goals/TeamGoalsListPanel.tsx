import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Building2, Calendar, MoreHorizontal, Pencil, Plus, Target, Trash2, Users, Workflow } from 'lucide-react';
import { format, parseISO, isPast, isWithinInterval } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import type { TeamGoal } from '@/hooks/useTeamGoals';
import { METRIC_CONFIG, computeProgressPct, formatMetricValue } from '@/lib/goals/metrics';

const SCOPE_META = {
  company: { label: 'Empresa', icon: Building2, className: 'bg-primary/15 text-primary border-primary/30' },
  group: { label: 'Grupo', icon: Users, className: 'bg-violet/15 text-violet border-violet/30' },
  pipeline: { label: 'Funil', icon: Workflow, className: 'bg-cyan/15 text-cyan border-cyan/30' },
} as const;

function getStatus(goal: TeamGoal, pct: number): 'active' | 'completed' | 'inactive' {
  const now = new Date();
  const start = parseISO(goal.period_start);
  const end = parseISO(goal.period_end);
  if (pct >= 100) return 'completed';
  if (isWithinInterval(now, { start, end })) return 'active';
  if (isPast(end)) return 'completed';
  return 'inactive';
}

const STATUS_BADGE = {
  active: { label: 'Ativa', className: 'bg-emerald/20 text-emerald border-emerald/30' },
  inactive: { label: 'Inativa', className: 'bg-muted text-muted-foreground border-border' },
  completed: { label: 'Concluída', className: 'bg-cyan/20 text-cyan border-cyan/30' },
} as const;

interface Props {
  goals: TeamGoal[];
  progressMap: Record<string, { currentValue: number; percentage: number }>;
  onCreate: () => void;
  onEdit: (g: TeamGoal) => void;
  onDelete: (g: TeamGoal) => void;
  canManage: boolean;
}

export function TeamGoalsListPanel({ goals, progressMap, onCreate, onEdit, onDelete, canManage }: Props) {
  return (
    <Card className="glass-card flex flex-col h-full">
      <header className="flex items-center justify-between px-4 py-3 border-b border-border/40">
        <div className="flex items-center gap-2">
          <Target className="w-4 h-4 text-primary" />
          <h2 className="font-semibold text-sm">Metas de equipe</h2>
          <Badge variant="outline" className="ml-1 text-[10px]">
            {goals.length}
          </Badge>
        </div>
        {canManage && (
          <Button size="sm" variant="ghost" onClick={onCreate} className="h-7 gap-1.5">
            <Plus className="w-3.5 h-3.5" /> Nova
          </Button>
        )}
      </header>

      <div className="flex-1 overflow-auto divide-y divide-border/40">
        {goals.length === 0 ? (
          <div className="flex flex-col items-center justify-center text-center py-16 px-4">
            <Target className="w-10 h-10 text-muted-foreground/40 mb-3" />
            <p className="text-sm font-medium mb-1">Nenhuma meta de equipe</p>
            <p className="text-xs text-muted-foreground">
              Crie metas por empresa, squad ou funil para acompanhar a performance coletiva.
            </p>
          </div>
        ) : (
          goals.map((goal) => {
            const mcfg = METRIC_CONFIG[goal.metric];
            const MetricIcon = mcfg.icon;
            const p = progressMap[goal.id] ?? { percentage: 0, currentValue: 0 };
            const pct = computeProgressPct(p.currentValue, goal.target_value, goal.metric);
            const status = getStatus(goal, pct);
            const sCfg = STATUS_BADGE[status];
            const scope = SCOPE_META[goal.scope];
            const ScopeIcon = scope.icon;
            const scopeLabel =
              goal.scope === 'company'
                ? 'Empresa toda'
                : goal.scope === 'group'
                ? goal.group?.name ?? 'Grupo'
                : goal.pipeline?.name ?? 'Funil';

            return (
              <div key={goal.id} className="px-4 py-3 hover:bg-secondary/30 transition-colors">
                <div className="flex items-start gap-3">
                  <div
                    className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0"
                    style={
                      goal.scope === 'group' && goal.group
                        ? { backgroundColor: `${goal.group.color}20`, color: goal.group.color }
                        : undefined
                    }
                  >
                    <ScopeIcon className="w-4 h-4" />
                  </div>

                  <div className="flex-1 min-w-0 space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="font-medium text-sm truncate">{goal.name}</p>
                        <p className="text-[11px] text-muted-foreground truncate">{scopeLabel}</p>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <Badge variant="outline" className={`${sCfg.className} text-[10px] px-1.5 py-0`}>
                          {sCfg.label}
                        </Badge>
                        {canManage && (
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon" className="h-7 w-7">
                                <MoreHorizontal className="w-3.5 h-3.5" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem onClick={() => onEdit(goal)}>
                                <Pencil className="w-3.5 h-3.5 mr-2" /> Editar
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                onClick={() => onDelete(goal)}
                                className="text-destructive"
                              >
                                <Trash2 className="w-3.5 h-3.5 mr-2" /> Excluir
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        )}
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground">
                      <Badge variant="outline" className={`${mcfg.className} text-[10px] px-1.5 py-0`}>
                        <MetricIcon className="w-3 h-3 mr-1" />
                        {mcfg.label}
                      </Badge>
                      <span className="truncate">
                        Meta:{' '}
                        <span className="text-foreground font-medium">
                          {formatMetricValue(goal.target_value, goal.metric)}
                        </span>
                      </span>
                    </div>

                    <div>
                      <Progress value={Math.min(pct, 100)} className="h-1.5" />
                      <div className="flex items-center justify-between mt-1 text-[10px] text-muted-foreground">
                        <span>
                          {formatMetricValue(p.currentValue, goal.metric)} /{' '}
                          {formatMetricValue(goal.target_value, goal.metric)}
                        </span>
                        <span className="font-medium">{pct}%</span>
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
                      <Calendar className="w-3 h-3" />
                      {format(parseISO(goal.period_start), 'dd/MM', { locale: ptBR })} {' — '}
                      {format(parseISO(goal.period_end), 'dd/MM/yyyy', { locale: ptBR })}
                    </div>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </Card>
  );
}
