import { PageShell } from '@/components/layout/PageShell';
import { useMemo, useState, useEffect } from 'react';
import { FilterBar } from '@/components/filters/FilterBar';
import { FilterSelect } from '@/components/filters/FilterSelect';
import { useAuth } from '@/contexts/AuthContext';
import { Navigate } from 'react-router-dom';
import { Plus, Loader2, UserPlus, LayoutGrid, List } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useTeamMembers } from '@/hooks/useTeamMembers';
import { useTeamInvites, useCancelInvite } from '@/hooks/useTeamInvites';
import { CreateMemberDialog } from '@/components/team/CreateMemberDialog';
import { TeamStatsCards } from '@/components/team/TeamStatsCards';
import { PendingInvitesList } from '@/components/team/PendingInvitesList';
import { MembersTable } from '@/components/team/MembersTable';
import { MemberCard } from '@/components/team/MemberCard';
import { MemberDrawer } from '@/components/team/MemberDrawer';
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
import { TeamSkeleton } from '@/components/skeletons/PageSkeletons';
import { usePlanLimitGuard } from '@/hooks/usePlanLimitGuard';
import { PlanLimitBanner } from '@/components/billing/PlanLimitBanner';
import { PlanLimitDialog } from '@/components/billing/PlanLimitDialog';
import { Lock } from 'lucide-react';

type ViewMode = 'grid' | 'table';
const VIEW_STORAGE_KEY = 'team:viewMode';

export default function Team() {
  const { isCompanyAdmin, loading: authLoading, profile: authProfile } = useAuth();
  const [searchQuery, setSearchQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [viewMode, setViewMode] = useState<ViewMode>(() => {
    if (typeof window === 'undefined') return 'table';
    return (localStorage.getItem(VIEW_STORAGE_KEY) as ViewMode) || 'table';
  });

  const [inviteDialogOpen, setInviteDialogOpen] = useState(false);
  const [planLimitDialogOpen, setPlanLimitDialogOpen] = useState(false);
  const planGuard = usePlanLimitGuard();
  const tryOpenInvite = () => {
    if (!planGuard.canAddUser) {
      setPlanLimitDialogOpen(true);
      return;
    }
    setInviteDialogOpen(true);
  };
  const [drawerMember, setDrawerMember] = useState<any | null>(null);
  const [cancelInviteId, setCancelInviteId] = useState<string | null>(null);

  const { data: teamMembers = [], isLoading } = useTeamMembers();
  const { data: pendingInvites = [] } = useTeamInvites();
  const { mutate: cancelInvite, isPending: isCancelling } = useCancelInvite();

  useEffect(() => {
    localStorage.setItem(VIEW_STORAGE_KEY, viewMode);
  }, [viewMode]);

  const filteredMembers = useMemo(() => {
    const q = searchQuery.toLowerCase();
    return teamMembers.filter((m) => {
      const matchesSearch =
        !q || m.name.toLowerCase().includes(q) || m.email.toLowerCase().includes(q);
      const matchesRole = roleFilter === 'all' || m.role === roleFilter;
      let matchesStatus = true;
      if (statusFilter === 'active') matchesStatus = m.isActive !== false;
      else if (statusFilter === 'inactive') matchesStatus = m.isActive === false;
      else if (statusFilter === 'online') matchesStatus = m.status === 'online';
      else if (statusFilter === 'offline') matchesStatus = m.status === 'offline';
      return matchesSearch && matchesRole && matchesStatus;
    });
  }, [teamMembers, searchQuery, roleFilter, statusFilter]);

  const stats = useMemo(() => {
    const admins = teamMembers.filter(
      (m) => m.role === 'company_admin' || m.role === 'master',
    ).length;
    const active = teamMembers.filter((m) => m.isActive !== false).length;
    return { total: teamMembers.length, admins, active, pending: pendingInvites.length };
  }, [teamMembers, pendingInvites.length]);

  const handleManage = (m: any) => {
    // Encontra membro completo na lista para passar ao drawer
    const full = teamMembers.find((tm) => tm.id === m.id) || m;
    setDrawerMember(full);
  };

  const handleCancelInvite = () => {
    if (!cancelInviteId) return;
    cancelInvite(cancelInviteId, { onSuccess: () => setCancelInviteId(null) });
  };

  if (!authLoading && !isCompanyAdmin) {
    return <Navigate to="/dashboard" replace />;
  }

  if (isLoading && !teamMembers.length) {
    return <TeamSkeleton />;
  }

  const hasFilters = searchQuery || roleFilter !== 'all' || statusFilter !== 'all';

  return (
    <PageShell
      title="Minha Equipe"
      subtitle="Gerencie membros, funções, canais e metas da sua organização"
      actions={
        <Button
          variant="glow"
          onClick={tryOpenInvite}
          title={planGuard.userBlockedReason ?? undefined}
        >
          {planGuard.canAddUser ? <Plus className="w-4 h-4 mr-2" /> : <Lock className="w-4 h-4 mr-2" />}
          Adicionar Membro
        </Button>
      }
    >
      <TeamStatsCards
        total={stats.total}
        admins={stats.admins}
        pending={stats.pending}
        active={stats.active}
      />

      {!planGuard.canAddUser && planGuard.userBlockedReason && (
        <PlanLimitBanner message={planGuard.userBlockedReason} />
      )}

      <PendingInvitesList invites={pendingInvites} onCancel={setCancelInviteId} />

      <FilterBar
        searchValue={searchQuery}
        onSearchChange={setSearchQuery}
        searchPlaceholder="Buscar por nome ou email..."
      >
        <FilterSelect
          value={roleFilter}
          onValueChange={setRoleFilter}
          options={[
            { value: 'all', label: 'Todas as funções' },
            { value: 'master', label: 'Master' },
            { value: 'company_admin', label: 'Administrador' },
            { value: 'user', label: 'Usuário' },
          ]}
          placeholder="Função"
        />
        <FilterSelect
          value={statusFilter}
          onValueChange={setStatusFilter}
          options={[
            { value: 'all', label: 'Todos os status' },
            { value: 'active', label: 'Ativos' },
            { value: 'inactive', label: 'Desativados' },
            { value: 'online', label: 'Online agora' },
            { value: 'offline', label: 'Offline' },
          ]}
          placeholder="Status"
        />
        <Tabs value={viewMode} onValueChange={(v) => setViewMode(v as ViewMode)}>
          <TabsList>
            <TabsTrigger value="table" aria-label="Tabela">
              <List className="w-4 h-4" />
            </TabsTrigger>
            <TabsTrigger value="grid" aria-label="Grade">
              <LayoutGrid className="w-4 h-4" />
            </TabsTrigger>
          </TabsList>
        </Tabs>
      </FilterBar>

      {filteredMembers.length === 0 ? (
        <Card className="glass-card">
          <div className="flex flex-col items-center justify-center py-20 text-center px-4">
            <div className="w-20 h-20 rounded-full bg-muted/50 flex items-center justify-center mb-6">
              <UserPlus className="w-10 h-10 text-muted-foreground/50" />
            </div>
            <h3 className="font-display text-xl font-semibold mb-2">
              Nenhum membro encontrado
            </h3>
            <p className="text-muted-foreground text-sm max-w-md mb-6">
              {hasFilters
                ? 'Nenhum membro corresponde aos filtros aplicados. Tente ajustar a busca.'
                : 'Sua equipe ainda não tem membros. Comece convidando alguém!'}
            </p>
            {!hasFilters && (
              <Button variant="glow" onClick={tryOpenInvite}>
                {planGuard.canAddUser ? <Plus className="w-4 h-4 mr-2" /> : <Lock className="w-4 h-4 mr-2" />}
                Convidar Primeiro Membro
              </Button>
            )}
          </div>
        </Card>
      ) : viewMode === 'table' ? (
        <>
          <div className="hidden lg:block">
            <MembersTable
              members={filteredMembers}
              currentUserId={authProfile?.id}
              onManage={handleManage}
            />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 lg:hidden">
            {filteredMembers.map((member) => (
              <MemberCard
                key={member.id}
                member={member}
                isSelf={member.id === authProfile?.id}
                onManage={handleManage}
              />
            ))}
          </div>
        </>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {filteredMembers.map((member) => (
            <MemberCard
              key={member.id}
              member={member}
              isSelf={member.id === authProfile?.id}
              onManage={handleManage}
            />
          ))}
        </div>
      )}

      <MemberDrawer
        open={!!drawerMember}
        onOpenChange={(o) => !o && setDrawerMember(null)}
        member={drawerMember}
        isSelf={drawerMember?.id === authProfile?.id}
      />

      <CreateMemberDialog open={inviteDialogOpen} onOpenChange={setInviteDialogOpen} />

      <PlanLimitDialog
        open={planLimitDialogOpen}
        onOpenChange={setPlanLimitDialogOpen}
        resource="users"
        message={planGuard.userBlockedReason ?? undefined}
      />

      <AlertDialog open={!!cancelInviteId} onOpenChange={() => setCancelInviteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancelar convite?</AlertDialogTitle>
            <AlertDialogDescription>
              O convite será cancelado e o email não poderá mais ser usado para entrar na equipe.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Voltar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleCancelInvite}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={isCancelling}
            >
              {isCancelling ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Cancelar Convite'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </PageShell>
  );
}
