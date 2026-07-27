import { PageShell } from '@/components/layout/PageShell';
import { useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { Navigate } from 'react-router-dom';
import {
  Target,
  Loader2,
  TrendingUp,
  Users,
  Plus,
  CheckCircle2,
  Sparkles,
  ChevronDown,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { FilterBar } from '@/components/filters/FilterBar';
import { FilterSelect } from '@/components/filters/FilterSelect';
import { Card } from '@/components/ui/card';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { useUserGoals, useDeleteGoal, UserGoal } from '@/hooks/useUserGoals';
import { useGoalProgress } from '@/hooks/useGoalProgress';
import { useTeamGoals, useDeleteTeamGoal, useTeamGoalProgress, type TeamGoal } from '@/hooks/useTeamGoals';
import { EditGoalDialog } from '@/components/team/EditGoalDialog';
import { CreateGoalFromGoalsDialog } from '@/components/goals/CreateGoalFromGoalsDialog';
import { CreateTeamGoalDialog } from '@/components/goals/CreateTeamGoalDialog';
import { CreateMissionDialog } from '@/components/goals/missions/CreateMissionDialog';
import { GoalsListPanel, getGoalStatus } from '@/components/goals/GoalsListPanel';
import { TeamGoalsListPanel } from '@/components/goals/TeamGoalsListPanel';
import { RankingsPanel } from '@/components/goals/rankings/RankingsPanel';
import { MissionsPanel } from '@/components/goals/missions/MissionsPanel';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Users as UsersIcon, User as UserIcon } from 'lucide-react';
import {
  useGoalsPageFilters,
  PERIOD_OPTIONS,
  METRIC_OPTIONS,
  STATUS_OPTIONS,
  type PeriodKey,
  type GoalsMetric,
  type GoalsStatusFilter,
} from '@/hooks/useGoalsPageFilters';
import { parseISO, isWithinInterval } from 'date-fns';

// Mapeia a métrica do filtro global para o `goal_type` da tabela user_goals.
function metricToGoalType(m: GoalsMetric): UserGoal['goal_type'] | null {
  if (m === 'value') return 'value';
  if (m === 'leads') return 'leads';
  if (m === 'conversions') return 'conversions';
  return null; // 'responses' não tem equivalente em metas tradicionais
}

export default function Goals() {
  const { isCompanyAdmin, loading: authLoading } = useAuth();

  const filters = useGoalsPageFilters();
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [createGoalOpen, setCreateGoalOpen] = useState(false);
  const [createTeamGoalOpen, setCreateTeamGoalOpen] = useState(false);
  const [createMissionOpen, setCreateMissionOpen] = useState(false);
  const [selectedGoal, setSelectedGoal] = useState<UserGoal | null>(null);
  const [editingTeamGoal, setEditingTeamGoal] = useState<TeamGoal | null>(null);
  const [deletingTeamGoal, setDeletingTeamGoal] = useState<TeamGoal | null>(null);
  const [goalsTab, setGoalsTab] = useState<'individual' | 'team'>('individual');

  const { data: goals = [], isLoading } = useUserGoals();
  const { data: progressMap = {} } = useGoalProgress(goals);
  const { data: teamGoals = [] } = useTeamGoals();
  const { data: teamProgressMap = {} } = useTeamGoalProgress(teamGoals);
  const deleteGoal = useDeleteGoal();
  const deleteTeamGoal = useDeleteTeamGoal();

  if (!authLoading && !isCompanyAdmin) {
    return <Navigate to="/dashboard" replace />;
  }

  // Filtragem das metas conforme filtros globais.
  const goalTypeFromMetric = metricToGoalType(filters.metric);
  const filteredGoals = goals.filter((goal) => {
    const userName = goal.user?.full_name || goal.user?.email || '';
    if (filters.search && !userName.toLowerCase().includes(filters.search.toLowerCase())) return false;
    if (goalTypeFromMetric && goal.goal_type !== goalTypeFromMetric) return false;
    if (filters.status !== 'all') {
      const pct = progressMap[goal.id]?.percentage ?? 0;
      if (getGoalStatus(goal, pct) !== filters.status) return false;
    }
    // Período: considera meta cujo intervalo intersecta o período selecionado
    const periodStart = parseISO(filters.range.start);
    const periodEnd = parseISO(filters.range.end);
    const goalStart = parseISO(goal.period_start);
    const goalEnd = parseISO(goal.period_end);
    const intersects = !(goalEnd < periodStart || goalStart > periodEnd);
    if (!intersects) return false;
    return true;
  });

  const handleEdit = (goal: UserGoal) => {
    setSelectedGoal(goal);
    setEditDialogOpen(true);
  };

  const handleDeleteClick = (goal: UserGoal) => {
    setSelectedGoal(goal);
    setDeleteDialogOpen(true);
  };

  const handleDeleteConfirm = async () => {
    if (selectedGoal) {
      await deleteGoal.mutateAsync(selectedGoal.id);
      setDeleteDialogOpen(false);
      setSelectedGoal(null);
    }
  };

  const activeGoals = goals.filter((g) => getGoalStatus(g, progressMap[g.id]?.percentage ?? 0) === 'active');
  const completedGoals = goals.filter((g) => getGoalStatus(g, progressMap[g.id]?.percentage ?? 0) === 'completed');

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-[50vh]">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  const headerActions = (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="glow" className="gap-2">
          <Plus className="w-4 h-4" />
          Novo
          <ChevronDown className="w-3.5 h-3.5" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem
          onSelect={(e) => {
            e.preventDefault();
            setGoalsTab('individual');
            setTimeout(() => setCreateGoalOpen(true), 0);
          }}
        >
          <UserIcon className="w-4 h-4 mr-2" /> Meta individual
        </DropdownMenuItem>
        <DropdownMenuItem
          onSelect={(e) => {
            e.preventDefault();
            setGoalsTab('team');
            setEditingTeamGoal(null);
            setTimeout(() => setCreateTeamGoalOpen(true), 0);
          }}
        >
          <UsersIcon className="w-4 h-4 mr-2" /> Meta de equipe
        </DropdownMenuItem>
        <DropdownMenuItem
          onSelect={(e) => {
            e.preventDefault();
            setTimeout(() => setCreateMissionOpen(true), 0);
          }}
        >
          <Sparkles className="w-4 h-4 mr-2" /> Nova missão
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );

  const filterBar = (
    <FilterBar
      searchValue={filters.search}
      onSearchChange={filters.setSearch}
      searchPlaceholder="Buscar por agente..."
    >
      <FilterSelect
        value={filters.period}
        onValueChange={(v) => filters.setPeriod(v as PeriodKey)}
        options={PERIOD_OPTIONS.map((o) => ({ value: o.value, label: o.label }))}
        placeholder="Período"
        width="w-[170px]"
      />
      <FilterSelect
        value={filters.metric}
        onValueChange={(v) => filters.setMetric(v as GoalsMetric)}
        options={METRIC_OPTIONS.map((o) => ({ value: o.value, label: o.label }))}
        placeholder="Métrica"
        width="w-[170px]"
      />
      <FilterSelect
        value={filters.status}
        onValueChange={(v) => filters.setStatus(v as GoalsStatusFilter)}
        options={STATUS_OPTIONS.map((o) => ({ value: o.value, label: o.label }))}
        placeholder="Status"
        width="w-[160px]"
      />
    </FilterBar>
  );

  return (
    <PageShell
      title="Metas, Missões e Rankings"
      subtitle="Acompanhe metas, lance desafios e celebre os destaques da equipe"
      actions={headerActions}
      filters={filterBar}
    >
      <div className="space-y-6 p-6 lg:p-8">
        {/* Stats */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <Card className="stat-card">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-primary/20 flex items-center justify-center">
                <Target className="w-6 h-6 text-primary" />
              </div>
              <div>
                <p className="text-2xl font-semibold">{goals.length}</p>
                <p className="text-sm text-muted-foreground">Total de metas</p>
              </div>
            </div>
          </Card>
          <Card className="stat-card">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-cyan/20 flex items-center justify-center">
                <TrendingUp className="w-6 h-6 text-cyan" />
              </div>
              <div>
                <p className="text-2xl font-semibold">{activeGoals.length}</p>
                <p className="text-sm text-muted-foreground">Metas ativas</p>
              </div>
            </div>
          </Card>
          <Card className="stat-card">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-amber/20 flex items-center justify-center">
                <Users className="w-6 h-6 text-amber" />
              </div>
              <div>
                <p className="text-2xl font-semibold">{new Set(goals.map((g) => g.user_id)).size}</p>
                <p className="text-sm text-muted-foreground">Agentes com meta</p>
              </div>
            </div>
          </Card>
          <Card className="stat-card">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-emerald/20 flex items-center justify-center">
                <CheckCircle2 className="w-6 h-6 text-emerald" />
              </div>
              <div>
                <p className="text-2xl font-semibold">{completedGoals.length}</p>
                <p className="text-sm text-muted-foreground">Metas concluídas</p>
              </div>
            </div>
          </Card>
        </div>

        {/* Grid 2 colunas: Metas (com tabs) | Rankings */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 min-h-[500px]">
          <Tabs value={goalsTab} onValueChange={(v) => setGoalsTab(v as 'individual' | 'team')} className="flex flex-col h-full">
            <TabsList className="self-start">
              <TabsTrigger value="individual" className="gap-1.5">
                <UserIcon className="w-3.5 h-3.5" /> Individuais
                <span className="ml-1 text-[10px] text-muted-foreground">{goals.length}</span>
              </TabsTrigger>
              <TabsTrigger value="team" className="gap-1.5">
                <UsersIcon className="w-3.5 h-3.5" /> Equipe
                <span className="ml-1 text-[10px] text-muted-foreground">{teamGoals.length}</span>
              </TabsTrigger>
            </TabsList>
            <TabsContent value="individual" className="flex-1 mt-2">
              <GoalsListPanel
                goals={filteredGoals}
                progressMap={progressMap}
                onCreate={() => setCreateGoalOpen(true)}
                onEdit={handleEdit}
                onDelete={handleDeleteClick}
                canManage={isCompanyAdmin}
              />
            </TabsContent>
            <TabsContent value="team" className="flex-1 mt-2">
              <TeamGoalsListPanel
                goals={teamGoals}
                progressMap={teamProgressMap}
                onCreate={() => { setEditingTeamGoal(null); setCreateTeamGoalOpen(true); }}
                onEdit={(g) => { setEditingTeamGoal(g); setCreateTeamGoalOpen(true); }}
                onDelete={(g) => setDeletingTeamGoal(g)}
                canManage={isCompanyAdmin}
              />
            </TabsContent>
          </Tabs>
          <RankingsPanel
            start={filters.range.start}
            end={filters.range.end}
            metric={filters.metric}
            search={filters.search}
          />
        </div>

        {/* Missões em largura cheia */}
        <MissionsPanel
          start={filters.range.start}
          end={filters.range.end}
          metric={filters.metric}
          status={filters.status}
          search={filters.search}
          canManage={isCompanyAdmin}
        />
      </div>

      {/* Dialogs */}
      <CreateGoalFromGoalsDialog open={createGoalOpen} onOpenChange={setCreateGoalOpen} />
      <CreateTeamGoalDialog
        open={createTeamGoalOpen}
        onOpenChange={(o) => { setCreateTeamGoalOpen(o); if (!o) setEditingTeamGoal(null); }}
        goal={editingTeamGoal}
      />
      <CreateMissionDialog open={createMissionOpen} onOpenChange={setCreateMissionOpen} />

      {selectedGoal && (
        <EditGoalDialog open={editDialogOpen} onOpenChange={setEditDialogOpen} goal={selectedGoal} />
      )}

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir meta</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir esta meta? Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteConfirm}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!deletingTeamGoal} onOpenChange={(o) => !o && setDeletingTeamGoal(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir meta de equipe</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir "{deletingTeamGoal?.name}"? Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={async () => {
                if (deletingTeamGoal) {
                  await deleteTeamGoal.mutateAsync(deletingTeamGoal.id);
                  setDeletingTeamGoal(null);
                }
              }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

    </PageShell>
  );
}
