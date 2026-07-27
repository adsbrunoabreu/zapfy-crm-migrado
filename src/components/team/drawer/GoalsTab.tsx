import { useMemo, useState } from 'react';
import { format, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Plus, Target, Trash2, Pencil, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { useUserGoals, useDeleteGoal, type UserGoal } from '@/hooks/useUserGoals';
import { useGoalProgress } from '@/hooks/useGoalProgress';
import { SetGoalDialog } from '@/components/team/SetGoalDialog';
import { EditGoalDialog } from '@/components/team/EditGoalDialog';

interface Props {
  member: any;
}

const typeLabel: Record<string, string> = {
  leads: 'Leads',
  value: 'Valor (R$)',
  conversions: 'Conversões',
};

export function GoalsTab({ member }: Props) {
  const { data: allGoals = [], isLoading } = useUserGoals();
  const goals = useMemo(
    () => allGoals.filter((g) => g.user_id === member.id),
    [allGoals, member.id],
  );
  const { data: progressMap = {} } = useGoalProgress(goals);
  const del = useDeleteGoal();

  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState<UserGoal | null>(null);

  const formatValue = (g: UserGoal, val: number) =>
    g.goal_type === 'value'
      ? new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val)
      : String(val);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground">
          {goals.length} meta(s) cadastrada(s)
        </p>
        <Button size="sm" variant="glow" onClick={() => setCreateOpen(true)}>
          <Plus className="w-4 h-4 mr-1" />
          Nova meta
        </Button>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
        </div>
      ) : goals.length === 0 ? (
        <div className="text-center py-8 text-sm text-muted-foreground">
          <Target className="w-7 h-7 mx-auto mb-2 opacity-50" />
          Nenhuma meta para este membro.
        </div>
      ) : (
        <div className="space-y-2">
          {goals.map((g) => {
            const progress = progressMap[g.id];
            const pct = progress?.percentage ?? 0;
            return (
              <div
                key={g.id}
                className="rounded-md border border-border bg-card/40 p-3 space-y-2"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                        {typeLabel[g.goal_type] || g.goal_type}
                      </Badge>
                      <span className="text-[11px] text-muted-foreground">
                        {format(parseISO(g.period_start), 'dd MMM', { locale: ptBR })}{' '}
                        — {format(parseISO(g.period_end), 'dd MMM yyyy', { locale: ptBR })}
                      </span>
                    </div>
                    <p className="text-sm font-medium">
                      {formatValue(g, progress?.currentValue ?? 0)}{' '}
                      <span className="text-muted-foreground">/</span>{' '}
                      {formatValue(g, g.target_value)}
                    </p>
                  </div>
                  <div className="flex gap-1 shrink-0">
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-7 w-7"
                      onClick={() => setEditing(g)}
                    >
                      <Pencil className="w-3.5 h-3.5" />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-7 w-7 text-destructive hover:text-destructive"
                      onClick={() => del.mutate(g.id)}
                      disabled={del.isPending}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                </div>
                <div className="space-y-1">
                  <Progress value={pct} className="h-1.5" />
                  <p className="text-[11px] text-muted-foreground text-right">
                    {pct}% concluído
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <SetGoalDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        member={{ id: member.id, name: member.name, email: member.email }}
      />
      {editing && (
        <EditGoalDialog
          open={!!editing}
          onOpenChange={(o) => !o && setEditing(null)}
          goal={editing}
        />
      )}
    </div>
  );
}
