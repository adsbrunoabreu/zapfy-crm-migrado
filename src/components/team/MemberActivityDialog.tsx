import { useNavigate } from 'react-router-dom';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Loader2, Users, MessageSquare, TrendingUp, DollarSign, Target } from 'lucide-react';
import { useMemberActivity } from '@/hooks/useMemberActivity';

interface MemberActivityDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  member: { id: string; name: string; email: string } | null;
}

const statusLabels: Record<string, string> = {
  new: 'Novo',
  contacted: 'Contactado',
  qualified: 'Qualificado',
  proposal: 'Proposta',
  negotiation: 'Negociação',
  won: 'Fechado',
  lost: 'Perdido',
};

const goalTypeLabels: Record<string, string> = {
  leads: 'Meta de Leads',
  value: 'Meta de Valor',
  conversion: 'Taxa de Conversão',
};

export function MemberActivityDialog({ open, onOpenChange, member }: MemberActivityDialogProps) {
  const navigate = useNavigate();
  const { data: activity, isLoading } = useMemberActivity(member?.id || null);

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL',
    }).format(value);
  };

  const formatGoalValue = (goal: { goalType: string; currentValue: number; targetValue: number }) => {
    if (goal.goalType === 'value') {
      return `${formatCurrency(goal.currentValue)} / ${formatCurrency(goal.targetValue)}`;
    }
    if (goal.goalType === 'conversion') {
      return `${goal.currentValue.toFixed(1)}% / ${goal.targetValue}%`;
    }
    return `${goal.currentValue} / ${goal.targetValue}`;
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center">
              <span className="font-medium text-primary">
                {member?.name?.[0]?.toUpperCase() || '?'}
              </span>
            </div>
            <div>
              <p>Atividade de {member?.name}</p>
              <p className="text-sm font-normal text-muted-foreground">{member?.email}</p>
            </div>
          </DialogTitle>
        </DialogHeader>

        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
          </div>
        ) : activity ? (
          <div className="space-y-6">
            {/* Stats Cards */}
            <div className="grid grid-cols-2 gap-3">
              <div className="p-4 rounded-lg bg-secondary/50 border border-border/50">
                <div className="flex items-center gap-2 text-muted-foreground mb-1">
                  <Users className="w-4 h-4" />
                  <span className="text-xs">Leads</span>
                </div>
                <p className="text-2xl font-bold">{activity.leadsCount}</p>
              </div>
              <div className="p-4 rounded-lg bg-secondary/50 border border-border/50">
                <div className="flex items-center gap-2 text-muted-foreground mb-1">
                  <MessageSquare className="w-4 h-4" />
                  <span className="text-xs">Mensagens</span>
                </div>
                <p className="text-2xl font-bold">{activity.messagesCount}</p>
              </div>
              <div className="p-4 rounded-lg bg-secondary/50 border border-border/50">
                <div className="flex items-center gap-2 text-muted-foreground mb-1">
                  <TrendingUp className="w-4 h-4" />
                  <span className="text-xs">Conversões</span>
                </div>
                <p className="text-2xl font-bold">{activity.conversionsCount}</p>
              </div>
              <div className="p-4 rounded-lg bg-secondary/50 border border-border/50">
                <div className="flex items-center gap-2 text-muted-foreground mb-1">
                  <DollarSign className="w-4 h-4" />
                  <span className="text-xs">Valor Total</span>
                </div>
                <p className="text-xl font-bold">{formatCurrency(activity.totalValue)}</p>
              </div>
            </div>

            {/* Leads by Status */}
            {Object.keys(activity.leadsByStatus).length > 0 && (
              <div>
                <h4 className="text-sm font-medium mb-3">Leads por Status</h4>
                <div className="space-y-2">
                  {Object.entries(activity.leadsByStatus).map(([status, count]) => (
                    <div key={status} className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">{statusLabels[status] || status}</span>
                      <span className="font-medium">{count}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Active Goals */}
            {activity.goals.length > 0 && (
              <div>
                <h4 className="text-sm font-medium mb-3 flex items-center gap-2">
                  <Target className="w-4 h-4" />
                  Metas Ativas
                </h4>
                <div className="space-y-3">
                  {activity.goals.map((goal) => {
                    const progress = Math.min((goal.currentValue / goal.targetValue) * 100, 100);
                    return (
                      <div key={goal.id} className="space-y-1">
                        <div className="flex items-center justify-between text-sm">
                          <span className="text-muted-foreground">
                            {goalTypeLabels[goal.goalType] || goal.goalType}
                          </span>
                          <span className="font-medium">{formatGoalValue(goal)}</span>
                        </div>
                        <Progress value={progress} className="h-2" />
                        <p className="text-xs text-muted-foreground text-right">
                          {progress.toFixed(0)}% concluído
                        </p>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Actions */}
            <div className="flex gap-2 pt-2">
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => onOpenChange(false)}
              >
                Fechar
              </Button>
            </div>
          </div>
        ) : (
          <div className="text-center py-8 text-muted-foreground">
            Nenhuma atividade encontrada
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
