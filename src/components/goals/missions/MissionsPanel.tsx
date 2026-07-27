import { useState, useMemo } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Loader2, Plus, Sparkles } from 'lucide-react';
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
import {
  useTeamMissions,
  useDeleteTeamMission,
  missionProgress,
  type TeamMission,
} from '@/hooks/useTeamMissions';
import { useRankings } from '@/hooks/useRankings';
import { useTeamMembers } from '@/hooks/useTeamMembers';
import { MissionCard } from './MissionCard';
import { CreateMissionDialog } from './CreateMissionDialog';
import { isWithinInterval, parseISO, isPast } from 'date-fns';
import type { GoalsStatusFilter, GoalsMetric } from '@/hooks/useGoalsPageFilters';

interface Props {
  start: string;
  end: string;
  metric: GoalsMetric;
  status: GoalsStatusFilter;
  search: string;
  canManage: boolean;
}

export function MissionsPanel({ start, end, metric, status, search, canManage }: Props) {
  const { data: missions = [], isLoading } = useTeamMissions();
  const { data: rankings = [] } = useRankings(start, end);
  const { data: members = [] } = useTeamMembers();
  const deleteMission = useDeleteTeamMission();

  const [editOpen, setEditOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<TeamMission | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<TeamMission | null>(null);
  const [createOpen, setCreateOpen] = useState(false);

  const memberMap = useMemo(() => {
    const m = new Map<string, string>();
    members.forEach((u) => m.set(u.id, u.name || u.email));
    return m;
  }, [members]);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return missions.filter((m) => {
      if (metric && m.metric !== metric) {
        return false;
      }
      const assigneeName = m.assigned_to ? memberMap.get(m.assigned_to) ?? '' : 'Equipe';
      if (term && !m.title.toLowerCase().includes(term) && !assigneeName.toLowerCase().includes(term)) {
        return false;
      }
      if (status !== 'all') {
        const { pct } = missionProgress(m, rankings);
        const inPeriod = isWithinInterval(new Date(), {
          start: parseISO(m.period_start),
          end: parseISO(m.period_end),
        });
        const computed = pct >= 100 ? 'completed' : inPeriod ? 'active' : isPast(parseISO(m.period_end)) ? 'completed' : 'inactive';
        if (computed !== status) return false;
      }
      return true;
    });
  }, [missions, metric, status, search, memberMap, rankings]);

  const handleEdit = (m: TeamMission) => {
    setEditTarget(m);
    setEditOpen(true);
  };

  return (
    <Card className="glass-card flex flex-col">
      <header className="flex items-center justify-between px-4 py-3 border-b border-border/40">
        <div className="flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-amber" />
          <h2 className="font-semibold text-sm">Missões</h2>
          <Badge variant="outline" className="ml-1 text-[10px]">{filtered.length}</Badge>
        </div>
        {canManage && (
          <Button size="sm" variant="ghost" onClick={() => setCreateOpen(true)} className="h-7 gap-1.5">
            <Plus className="w-3.5 h-3.5" /> Nova missão
          </Button>
        )}
      </header>

      <div className="p-4">
        {isLoading ? (
          <div className="flex items-center justify-center py-10">
            <Loader2 className="w-6 h-6 animate-spin text-primary" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center text-center py-10">
            <Sparkles className="w-10 h-10 text-muted-foreground/40 mb-3" />
            <p className="text-sm font-medium mb-1">Nenhuma missão no filtro atual</p>
            <p className="text-xs text-muted-foreground mb-3">
              Crie desafios temporários com recompensas para engajar o time.
            </p>
            {canManage && (
              <Button variant="glow" size="sm" onClick={() => setCreateOpen(true)}>
                <Plus className="w-3.5 h-3.5 mr-1.5" /> Criar primeira missão
              </Button>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
            {filtered.map((m) => {
              const { current, pct } = missionProgress(m, rankings);
              const assigneeName = m.assigned_to ? memberMap.get(m.assigned_to) ?? 'Usuário' : null;
              return (
                <MissionCard
                  key={m.id}
                  mission={m}
                  current={current}
                  pct={pct}
                  assigneeName={assigneeName}
                  canManage={canManage}
                  onEdit={() => handleEdit(m)}
                  onDelete={() => setDeleteTarget(m)}
                />
              );
            })}
          </div>
        )}
      </div>

      <CreateMissionDialog open={createOpen} onOpenChange={setCreateOpen} />
      <CreateMissionDialog
        open={editOpen}
        onOpenChange={(v) => {
          setEditOpen(v);
          if (!v) setEditTarget(null);
        }}
        mission={editTarget}
      />

      <AlertDialog open={!!deleteTarget} onOpenChange={(v) => !v && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir missão</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir esta missão? Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={async () => {
                if (deleteTarget) {
                  await deleteMission.mutateAsync(deleteTarget.id);
                  setDeleteTarget(null);
                }
              }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}
