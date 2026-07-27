import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Crown,
  Gift,
  MoreHorizontal,
  Pencil,
  Rocket,
  Star,
  Trash2,
  Trophy,
  Users,
} from 'lucide-react';
import { format, parseISO, differenceInDays } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import type { TeamMission } from '@/hooks/useTeamMissions';
import { METRIC_OPTIONS } from '@/hooks/useGoalsPageFilters';

const REWARD_ICON: Record<string, React.ElementType> = {
  trophy: Trophy,
  star: Star,
  gift: Gift,
  crown: Crown,
  rocket: Rocket,
};

function formatMetricValue(v: number, metric: TeamMission['metric']): string {
  if (metric === 'value') {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v);
  }
  return new Intl.NumberFormat('pt-BR').format(v);
}

interface Props {
  mission: TeamMission;
  current: number;
  pct: number;
  assigneeName: string | null;
  canManage: boolean;
  onEdit: () => void;
  onDelete: () => void;
}

export function MissionCard({ mission, current, pct, assigneeName, canManage, onEdit, onDelete }: Props) {
  const Icon = REWARD_ICON[mission.reward_icon || 'trophy'] || Trophy;
  const metricLabel = METRIC_OPTIONS.find((m) => m.value === mission.metric)?.label ?? mission.metric;
  const daysLeft = differenceInDays(parseISO(mission.period_end), new Date());
  const completed = pct >= 100;
  const expired = daysLeft < 0 && !completed;

  return (
    <Card className="glass-card p-4 flex flex-col gap-3 relative">
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-xl bg-amber/15 text-amber flex items-center justify-center shrink-0">
          <Icon className="w-5 h-5" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <h3 className="font-semibold text-sm leading-snug">{mission.title}</h3>
            {canManage && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" className="h-7 w-7 -mt-1 -mr-1">
                    <MoreHorizontal className="w-3.5 h-3.5" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={onEdit}>
                    <Pencil className="w-3.5 h-3.5 mr-2" /> Editar
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={onDelete} className="text-destructive">
                    <Trash2 className="w-3.5 h-3.5 mr-2" /> Excluir
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>
          {mission.description && (
            <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{mission.description}</p>
          )}

          <div className="flex flex-wrap items-center gap-1.5 mt-2">
            <Badge variant="outline" className="text-[10px] px-1.5 py-0">{metricLabel}</Badge>
            <Badge variant="outline" className="text-[10px] px-1.5 py-0 gap-1">
              <Users className="w-2.5 h-2.5" />
              {assigneeName || 'Equipe toda'}
            </Badge>
            {mission.reward_label && (
              <Badge variant="outline" className="text-[10px] px-1.5 py-0 bg-amber/10 text-amber border-amber/30">
                {mission.reward_label}
              </Badge>
            )}
            {completed && (
              <Badge variant="outline" className="text-[10px] px-1.5 py-0 bg-emerald/15 text-emerald border-emerald/30">
                Concluída
              </Badge>
            )}
            {expired && !completed && (
              <Badge variant="outline" className="text-[10px] px-1.5 py-0 bg-destructive/15 text-destructive border-destructive/30">
                Expirada
              </Badge>
            )}
          </div>
        </div>
      </div>

      <div>
        <Progress value={pct} className="h-1.5" />
        <div className="flex items-center justify-between mt-1 text-[11px] text-muted-foreground">
          <span>
            {formatMetricValue(current, mission.metric)} / {formatMetricValue(mission.target_value, mission.metric)}
          </span>
          <span>{Math.round(pct)}%</span>
        </div>
      </div>

      <div className="flex items-center justify-between text-[10px] text-muted-foreground">
        <span>
          {format(parseISO(mission.period_start), 'dd/MM', { locale: ptBR })} —{' '}
          {format(parseISO(mission.period_end), 'dd/MM/yyyy', { locale: ptBR })}
        </span>
        <span className={daysLeft < 3 && !completed ? 'text-amber font-medium' : ''}>
          {completed
            ? '✓ Atingida'
            : daysLeft < 0
              ? `Encerrada há ${Math.abs(daysLeft)}d`
              : daysLeft === 0
                ? 'Termina hoje'
                : `${daysLeft}d restantes`}
        </span>
      </div>
    </Card>
  );
}
