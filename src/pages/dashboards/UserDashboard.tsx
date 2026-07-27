import { PageShell } from '@/components/layout/PageShell';
import { useEffect, useMemo } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { usePipelines } from '@/hooks/usePipelines';
import { useMyDashboardData, type DashboardFilters } from '@/hooks/useMyDashboardData';
import { useMyGoals } from '@/hooks/useUserGoals';
import { usePersistedState } from '@/hooks/usePersistedState';
import { DashboardSkeleton } from '@/components/skeletons/PageSkeletons';
import { DashboardFiltersBar } from '@/components/my-dashboard/DashboardFiltersBar';
import { StatCards } from '@/components/my-dashboard/StatCards';
import { LeadsEvolutionChart } from '@/components/my-dashboard/LeadsEvolutionChart';
import { ConversionFunnel } from '@/components/my-dashboard/ConversionFunnel';
import { RecentLeadsList } from '@/components/my-dashboard/RecentLeadsList';
import { PerformanceSummary } from '@/components/my-dashboard/PerformanceSummary';
import { WonLostKpiRow } from '@/components/dashboard/WonLostKpiRow';
import { LossReasonsCard } from '@/components/dashboard/LossReasonsCard';
import { toast } from 'sonner';
import { useReportsRealtime } from '@/hooks/useReportsRealtime';

import { format, isWithinInterval, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Users, DollarSign, TrendingUp, CheckCircle2, Award } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { formatBRL } from '@/lib/format';

const GOAL_TYPE_LABELS = {
  leads: { label: 'Leads', icon: Users },
  value: { label: 'Valor', icon: DollarSign },
  conversions: { label: 'Conversões', icon: TrendingUp },
} as const;

export default function UserDashboard() {
  const { profile } = useAuth();
  useReportsRealtime(profile?.company_id ?? undefined);
  const { data: myGoals = [] } = useMyGoals();
  const { data: pipelines = [] } = usePipelines();

  const [filters, setFilters] = usePersistedState<DashboardFilters>('userDashboard.filters', { period: '30d' });
  const { data: stats, isLoading, isFetching, error } = useMyDashboardData(filters);

  useEffect(() => {
    if (error) toast.error('Erro ao carregar seu dashboard', { description: (error as Error).message });
  }, [error]);

  // Conversion rate based on closings axis (won / closed)
  const conversionRate = stats?.closings?.winRateClosed
    ? stats.closings.winRateClosed.toFixed(1)
    : '0';

  const totalNonLost = stats ? stats.total - stats.lostCount : 0;
  const inProgress = Math.max(0, totalNonLost - (stats?.wonCount || 0));

  const activeGoals = useMemo(() => {
    const now = new Date();
    return myGoals.filter((goal) => {
      try {
        return isWithinInterval(now, {
          start: parseISO(goal.period_start),
          end: parseISO(goal.period_end),
        });
      } catch {
        return false;
      }
    });
  }, [myGoals]);

  if (isLoading && !stats) return <DashboardSkeleton />;

  return (
    <PageShell
      title="Meu Dashboard"
      subtitle={`Olá, ${profile?.full_name?.split(' ')[0] || 'Usuário'}! Seus leads e métricas pessoais.${isFetching && !isLoading ? ' · atualizando…' : ''}`}
      actions={<DashboardFiltersBar filters={filters} onFiltersChange={setFilters} pipelines={pipelines} />}
    >

      <StatCards
        total={stats?.total || 0}
        totalValue={stats?.totalValue || 0}
        conversionRate={conversionRate}
        pendingActivities={stats?.pendingActivities || 0}
        prevTotal={stats?.prevTotal || 0}
        prevTotalValue={stats?.prevTotalValue || 0}
        prevWonCount={stats?.prevWonCount || 0}
      />

      {stats?.closings && <WonLostKpiRow closings={stats.closings} />}

      {myGoals.length > 0 && (
        <Card className="glass-card">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Award className="w-5 h-5 text-primary" />
              Minhas Metas
            </CardTitle>
          </CardHeader>
          <CardContent>
            {activeGoals.length === 0 ? (
              <p className="text-center text-muted-foreground py-4">Nenhuma meta ativa no período atual.</p>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {activeGoals.map((goal) => {
                  let currentValue = 0;
                  if (goal.goal_type === 'leads') currentValue = stats?.total || 0;
                  else if (goal.goal_type === 'value') currentValue = stats?.totalValue || 0;
                  else if (goal.goal_type === 'conversions') currentValue = stats?.wonCount || 0;

                  const target = goal.target_value || 0;
                  const progress = target > 0 ? Math.min((currentValue / target) * 100, 100) : 0;
                  const isCompleted = target > 0 && currentValue >= target;
                  const config = GOAL_TYPE_LABELS[goal.goal_type as keyof typeof GOAL_TYPE_LABELS];
                  if (!config) return null;
                  const Icon = config.icon;

                  return (
                    <div
                      key={goal.id}
                      className={`p-4 rounded-lg border ${isCompleted ? 'bg-[hsl(var(--emerald))]/10 border-[hsl(var(--emerald))]/30' : 'bg-secondary/30 border-border/50'}`}
                    >
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-2">
                          <Icon className={`w-4 h-4 ${isCompleted ? 'text-[hsl(var(--emerald))]' : 'text-primary'}`} />
                          <span className="font-medium">{config.label}</span>
                        </div>
                        {isCompleted && (
                          <Badge variant="outline" className="bg-[hsl(var(--emerald))]/20 text-[hsl(var(--emerald))] border-[hsl(var(--emerald))]/30">
                            <CheckCircle2 className="w-3 h-3 mr-1" />
                            Atingida
                          </Badge>
                        )}
                      </div>
                      <div className="space-y-2">
                        <div className="flex justify-between text-sm">
                          <span className="text-muted-foreground">Progresso</span>
                          <span className={isCompleted ? 'text-[hsl(var(--emerald))] font-medium' : 'font-medium'}>
                            {goal.goal_type === 'value'
                              ? `${formatBRL(currentValue)} / ${formatBRL(target)}`
                              : `${currentValue} / ${target}`}
                          </span>
                        </div>
                        <Progress value={progress} className={`h-2 ${isCompleted ? '[&>div]:bg-[hsl(var(--emerald))]' : ''}`} />
                        <p className="text-xs text-muted-foreground">
                          {format(parseISO(goal.period_start), 'dd/MM', { locale: ptBR })} -{' '}
                          {format(parseISO(goal.period_end), 'dd/MM/yyyy', { locale: ptBR })}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <LeadsEvolutionChart data={stats?.byMonth || []} />
        <ConversionFunnel byStatus={stats?.byStatus || {}} total={stats?.total || 0} />
      </div>

      {stats?.closings && (stats.lossReasons.length > 0 || stats.closings.lostCount > 0) && (
        <LossReasonsCard
          reasons={stats.lossReasons}
          totalLost={stats.closings.lostCount}
          totalLostValue={stats.closings.lostRevenue}
        />
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <RecentLeadsList leads={stats?.recentLeads || []} />
        <PerformanceSummary
          wonCount={stats?.wonCount || 0}
          inProgress={inProgress}
          lostCount={stats?.lostCount || 0}
          prevWonCount={stats?.prevWonCount || 0}
          prevTotal={stats?.prevTotal || 0}
          total={stats?.total || 0}
          totalValue={stats?.totalValue || 0}
          prevTotalValue={stats?.prevTotalValue || 0}
        />
      </div>
    </PageShell>
  );
}
