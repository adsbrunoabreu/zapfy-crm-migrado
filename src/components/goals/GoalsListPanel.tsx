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
import {
  Calendar,
  DollarSign,
  MoreHorizontal,
  Pencil,
  Plus,
  Target,
  TrendingUp,
  Trash2,
  Users,
} from 'lucide-react';
import { format, parseISO, isPast, isWithinInterval } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import type { UserGoal } from '@/hooks/useUserGoals';

const typeConfig: Record<string, { label: string; icon: React.ElementType; className: string }> = {
  leads: { label: 'Leads', icon: Users, className: 'bg-primary/20 text-primary border-primary/30' },
  value: { label: 'Valor', icon: DollarSign, className: 'bg-emerald/20 text-emerald border-emerald/30' },
  conversions: { label: 'Conversões', icon: TrendingUp, className: 'bg-amber/20 text-amber border-amber/30' },
};

const statusConfig: Record<string, { label: string; className: string }> = {
  active: { label: 'Ativa', className: 'bg-emerald/20 text-emerald border-emerald/30' },
  inactive: { label: 'Inativa', className: 'bg-muted text-muted-foreground border-border' },
  completed: { label: 'Concluída', className: 'bg-cyan/20 text-cyan border-cyan/30' },
};

export function getGoalStatus(goal: UserGoal, pct: number): 'active' | 'inactive' | 'completed' {
  const now = new Date();
  const start = parseISO(goal.period_start);
  const end = parseISO(goal.period_end);
  if (pct >= 100) return 'completed';
  if (isWithinInterval(now, { start, end })) return 'active';
  if (isPast(end)) return 'completed';
  return 'inactive';
}

function formatValue(goal: UserGoal): string {
  if (goal.goal_type === 'value') {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(goal.target_value);
  }
  const unit = goal.goal_type === 'leads' ? 'leads' : 'conversões';
  return `${goal.target_value} ${unit}`;
}

interface Props {
  goals: UserGoal[];
  progressMap: Record<string, { percentage: number; currentValue: number }>;
  onCreate: () => void;
  onEdit: (g: UserGoal) => void;
  onDelete: (g: UserGoal) => void;
  canManage: boolean;
}

export function GoalsListPanel({ goals, progressMap, onCreate, onEdit, onDelete, canManage }: Props) {
  return (
    <Card className="glass-card flex flex-col h-full">
      <header className="flex items-center justify-between px-4 py-3 border-b border-border/40">
        <div className="flex items-center gap-2">
          <Target className="w-4 h-4 text-primary" />
          <h2 className="font-semibold text-sm">Metas da equipe</h2>
          <Badge variant="outline" className="ml-1 text-[10px]">{goals.length}</Badge>
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
            <p className="text-sm font-medium mb-1">Nenhuma meta no filtro atual</p>
            <p className="text-xs text-muted-foreground">
              Ajuste os filtros ou crie uma nova meta para a equipe.
            </p>
          </div>
        ) : (
          goals.map((goal) => {
            const cfg = typeConfig[goal.goal_type] || typeConfig.leads;
            const Icon = cfg.icon;
            const p = progressMap[goal.id] ?? { percentage: 0, currentValue: 0 };
            const status = getGoalStatus(goal, p.percentage);
            const sCfg = statusConfig[status];
            const userInitial = (goal.user?.full_name?.[0] || goal.user?.email?.[0] || '?').toUpperCase();

            return (
              <div key={goal.id} className="px-4 py-3 hover:bg-secondary/30 transition-colors">
                <div className="flex items-start gap-3">
                  <div className="w-9 h-9 rounded-full bg-primary/15 flex items-center justify-center shrink-0">
                    <span className="font-semibold text-sm text-primary">{userInitial}</span>
                  </div>
                  <div className="flex-1 min-w-0 space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="font-medium text-sm truncate">{goal.user?.full_name || 'Usuário'}</p>
                        <p className="text-[11px] text-muted-foreground truncate">{goal.user?.email}</p>
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
                                <Pencil className="w-3.5 h-3.5 mr-2" />
                                Editar
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => onDelete(goal)} className="text-destructive">
                                <Trash2 className="w-3.5 h-3.5 mr-2" />
                                Excluir
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                      <Badge variant="outline" className={`${cfg.className} text-[10px] px-1.5 py-0`}>
                        <Icon className="w-3 h-3 mr-1" />
                        {cfg.label}
                      </Badge>
                      <span className="truncate">Meta: <span className="text-foreground font-medium">{formatValue(goal)}</span></span>
                    </div>

                    <div>
                      <Progress value={p.percentage} className="h-1.5" />
                      <div className="flex items-center justify-between mt-1 text-[10px] text-muted-foreground">
                        <span>{p.currentValue} / {goal.target_value}</span>
                        <span>{p.percentage}%</span>
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
                      <Calendar className="w-3 h-3" />
                      {format(parseISO(goal.period_start), 'dd/MM', { locale: ptBR })}
                      {' — '}
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
