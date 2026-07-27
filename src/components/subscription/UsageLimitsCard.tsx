import { Card } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { useUsageLimits } from '@/hooks/useUsageLimits';
import { SubscriptionPlan } from '@/hooks/useSubscriptionPlans';
import { Users, Database, MessageSquare, Gauge, KanbanSquare } from 'lucide-react';

interface Props {
  companyId?: string;
  plan?: SubscriptionPlan | null;
}

function Row({ icon: Icon, label, used, limit }: {
  icon: React.ElementType; label: string; used: number; limit: number | null;
}) {
  const isUnlimited = limit == null;
  const pct = isUnlimited ? 0 : Math.min(100, (used / Math.max(1, limit)) * 100);
  const danger = pct >= 90;
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-sm">
        <div className="flex items-center gap-2">
          <Icon className="w-4 h-4 text-muted-foreground" />
          <span>{label}</span>
        </div>
        <span className={danger ? 'text-rose font-medium tabular-nums' : 'text-muted-foreground tabular-nums'}>
          {used.toLocaleString('pt-BR')} {isUnlimited ? '· ilimitado' : `/ ${limit?.toLocaleString('pt-BR')}`}
        </span>
      </div>
      {!isUnlimited && (
        <Progress value={pct} className={danger ? '[&>div]:bg-rose' : ''} />
      )}
    </div>
  );
}

export function UsageLimitsCard({ companyId, plan }: Props) {
  const { data, isLoading } = useUsageLimits(companyId);

  return (
    <Card className="glass-card p-6">
      <div className="flex items-center gap-2 text-muted-foreground text-xs uppercase tracking-wider mb-4">
        <Gauge className="w-3.5 h-3.5" />
        Uso vs. limites do plano
      </div>
      {isLoading || !data ? (
        <div className="space-y-3 animate-pulse">
          <div className="h-4 bg-muted rounded" />
          <div className="h-4 bg-muted rounded" />
          <div className="h-4 bg-muted rounded" />
        </div>
      ) : (
        <div className="space-y-4">
          <Row icon={Users} label="Usuários" used={data.users} limit={plan?.max_users ?? null} />
          <Row icon={Database} label="Leads" used={data.leads} limit={plan?.max_leads ?? null} />
          <Row icon={MessageSquare} label="Instâncias WhatsApp" used={data.whatsapp_instances} limit={plan?.max_whatsapp_instances ?? null} />
          <Row icon={KanbanSquare} label="Pipelines" used={data.pipelines} limit={plan?.max_pipelines ?? null} />
        </div>
      )}
    </Card>
  );
}
