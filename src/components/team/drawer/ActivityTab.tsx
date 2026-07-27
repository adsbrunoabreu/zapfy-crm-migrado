import { Loader2, Users, MessageSquare, TrendingUp, DollarSign, Target } from 'lucide-react';
import { Progress } from '@/components/ui/progress';
import { useMemberActivity } from '@/hooks/useMemberActivity';

interface Props {
  member: any;
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
  conversions: 'Conversões',
};

const fmtBRL = (v: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v);

export function ActivityTab({ member }: Props) {
  const { data: activity, isLoading } = useMemberActivity(member?.id || null);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-10">
        <Loader2 className="w-6 h-6 animate-spin text-primary" />
      </div>
    );
  }

  if (!activity) {
    return (
      <div className="text-center py-10 text-sm text-muted-foreground">
        Nenhuma atividade encontrada
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2">
        <Stat icon={<Users className="w-3.5 h-3.5" />} label="Leads" value={activity.leadsCount} />
        <Stat
          icon={<MessageSquare className="w-3.5 h-3.5" />}
          label="Mensagens"
          value={activity.messagesCount}
        />
        <Stat
          icon={<TrendingUp className="w-3.5 h-3.5" />}
          label="Conversões"
          value={activity.conversionsCount}
        />
        <Stat
          icon={<DollarSign className="w-3.5 h-3.5" />}
          label="Valor"
          value={fmtBRL(activity.totalValue)}
        />
      </div>

      {Object.keys(activity.leadsByStatus).length > 0 && (
        <div>
          <h4 className="text-xs font-medium mb-2 text-muted-foreground uppercase tracking-wide">Leads por Status</h4>
          <div className="space-y-1">
            {Object.entries(activity.leadsByStatus).map(([s, c]) => (
              <div key={s} className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">{statusLabels[s] || s}</span>
                <span className="font-medium">{c}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {activity.goals.length > 0 && (
        <div>
          <h4 className="text-xs font-medium mb-2 flex items-center gap-2 text-muted-foreground uppercase tracking-wide">
            <Target className="w-3.5 h-3.5" />
            Metas Ativas
          </h4>
          <div className="space-y-2">
            {activity.goals.map((g) => {
              const pct = Math.min((g.currentValue / g.targetValue) * 100, 100);
              const valStr =
                g.goalType === 'value'
                  ? `${fmtBRL(g.currentValue)} / ${fmtBRL(g.targetValue)}`
                  : `${g.currentValue} / ${g.targetValue}`;
              return (
                <div key={g.id} className="space-y-1">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">
                      {goalTypeLabels[g.goalType] || g.goalType}
                    </span>
                    <span className="font-medium">{valStr}</span>
                  </div>
                  <Progress value={pct} className="h-1.5" />
                  <p className="text-[11px] text-muted-foreground text-right">
                    {pct.toFixed(0)}% concluído
                  </p>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function Stat({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: number | string;
}) {
  return (
    <div className="p-2.5 rounded-md bg-secondary/50 border border-border/50">
      <div className="flex items-center gap-1.5 text-muted-foreground mb-0.5">
        {icon}
        <span className="text-[11px]">{label}</span>
      </div>
      <p className="text-base font-bold">{value}</p>
    </div>
  );
}
