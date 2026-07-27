import { PageShell } from '@/components/layout/PageShell';
import { useMemo, useState } from 'react';
import { Search, Users, Shield, UserCheck, Pencil, Loader2, Building2, Crown, Plus, Trash2, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { SortableTableHead } from '@/components/ui/sortable-table-head';
import { useSortableData } from '@/hooks/useSortableData';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { useAllUsers, useUpdateUser, useSoftDeleteUser, type AdminUser } from '@/hooks/useAllUsers';
import { useToast } from '@/hooks/use-toast';
import { UserEditDrawer } from '@/components/admin/UserEditDrawer';
import { UserCreateDrawer } from '@/components/admin/UserCreateDrawer';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

const roleMap: Record<string, { label: string; cls: string; icon: React.ElementType }> = {
  master: { label: 'Master Admin', cls: 'bg-violet/20 text-violet border-violet/30', icon: Crown },
  admin: { label: 'Admin', cls: 'bg-primary/20 text-primary border-primary/30', icon: Shield },
  financeiro: { label: 'Financeiro', cls: 'bg-amber/20 text-amber border-amber/30', icon: Shield },
  gestor: { label: 'Gestor', cls: 'bg-cyan/20 text-cyan border-cyan/30', icon: Shield },
  agente: { label: 'Agente', cls: 'bg-muted text-muted-foreground border-border', icon: Users },
  // Legacy fallback (data renamed in DB, but safe defaults)
  company_admin: { label: 'Admin', cls: 'bg-primary/20 text-primary border-primary/30', icon: Shield },
  user: { label: 'Agente', cls: 'bg-muted text-muted-foreground border-border', icon: Users },
};

type AdminRole = 'master' | 'admin' | 'financeiro' | 'gestor' | 'agente';

export default function AdminUsers() {
  const { toast } = useToast();
  const { data: users = [], isLoading } = useAllUsers();
  const update = useUpdateUser();
  const softDelete = useSoftDeleteUser();

  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [editing, setEditing] = useState<AdminUser | null>(null);
  const [creating, setCreating] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<AdminUser | null>(null);
  const [confirmMaster, setConfirmMaster] = useState<{ user: AdminUser; nextRole: 'master' } | null>(null);

  const filtered = useMemo(() => {
    return users.filter((u) => {
      if (roleFilter !== 'all' && u.role !== roleFilter) return false;
      if (statusFilter === 'active' && !u.is_active) return false;
      if (statusFilter === 'inactive' && u.is_active) return false;
      if (search) {
        const s = search.toLowerCase();
        if (!`${u.full_name || ''} ${u.email} ${u.company_name || ''}`.toLowerCase().includes(s)) return false;
      }
      return true;
    });
  }, [users, search, roleFilter, statusFilter]);

  const totalActive = users.filter((u) => u.is_active).length;
  const totalMasters = users.filter((u) => u.role === 'master').length;
  const totalAdmins = users.filter((u) => u.role === 'admin').length;

  type SortKey = 'name' | 'company' | 'role' | 'active' | 'last_seen';
  const accessors = useMemo(() => ({
    name: (u: AdminUser) => (u.full_name || u.email || '').toLowerCase(),
    company: (u: AdminUser) => (u.company_name || '').toLowerCase(),
    role: (u: AdminUser) => u.role,
    active: (u: AdminUser) => (u.is_active ? 1 : 0),
    last_seen: (u: AdminUser) => (u.last_seen ? new Date(u.last_seen) : null),
  }), []);
  const { sorted, sort, toggle } = useSortableData<AdminUser, SortKey>(filtered, accessors, { key: 'name', direction: 'asc' });

  const handleToggleActive = (u: AdminUser, nextValue: boolean) => {
    update.mutate(
      { id: u.id, is_active: nextValue },
      {
        onSuccess: () => toast({ title: nextValue ? 'Usuário reativado' : 'Usuário desativado' }),
        onError: (e: any) => toast({ title: 'Erro', description: e.message, variant: 'destructive' }),
      }
    );
  };

  const applyRoleChange = (u: AdminUser, nextRole: AdminRole) => {
    update.mutate(
      { id: u.id, role: nextRole },
      {
        onSuccess: () => toast({ title: `Papel alterado para ${roleMap[nextRole].label}` }),
        onError: (e: any) => toast({ title: 'Erro', description: e.message, variant: 'destructive' }),
      }
    );
  };

  const handleRoleChange = (u: AdminUser, nextRole: AdminRole) => {
    if (nextRole === u.role) return;
    if (nextRole === 'master') {
      setConfirmMaster({ user: u, nextRole });
      return;
    }
    applyRoleChange(u, nextRole);
  };

  const handleDelete = async () => {
    if (!confirmDelete) return;
    try {
      await softDelete.mutateAsync(confirmDelete.id);
      toast({ title: 'Usuário excluído', description: `${confirmDelete.full_name || confirmDelete.email} foi removido permanentemente.` });
    } catch (e: any) {
      toast({ title: 'Erro', description: e.message, variant: 'destructive' });
    } finally {
      setConfirmDelete(null);
    }
  };

  if (isLoading) {
    return <div className="flex items-center justify-center h-[50vh]"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>;
  }

  return (
    <TooltipProvider delayDuration={200}>
      <PageShell
        title="Usuários"
        subtitle="Todos os usuários da plataforma"
        actions={
          <Button variant="glow" onClick={() => setCreating(true)}>
            <Plus className="w-4 h-4 mr-2" /> Novo usuário
          </Button>
        }
      >

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card className="stat-card">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-primary/20 flex items-center justify-center"><Users className="w-6 h-6 text-primary" /></div>
              <div><p className="text-2xl font-semibold">{users.length}</p><p className="text-sm text-muted-foreground">Total</p></div>
            </div>
          </Card>
          <Card className="stat-card">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-emerald/20 flex items-center justify-center"><UserCheck className="w-6 h-6 text-emerald" /></div>
              <div><p className="text-2xl font-semibold">{totalActive}</p><p className="text-sm text-muted-foreground">Ativos</p></div>
            </div>
          </Card>
          <Card className="stat-card">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-violet/20 flex items-center justify-center"><Crown className="w-6 h-6 text-violet" /></div>
              <div><p className="text-2xl font-semibold">{totalMasters}</p><p className="text-sm text-muted-foreground">Masters</p></div>
            </div>
          </Card>
          <Card className="stat-card">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-cyan/20 flex items-center justify-center"><Shield className="w-6 h-6 text-cyan" /></div>
              <div><p className="text-2xl font-semibold">{totalAdmins}</p><p className="text-sm text-muted-foreground">Admins</p></div>
            </div>
          </Card>
        </div>

        <Card className="glass-card p-4">
          <div className="flex flex-col md:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input placeholder="Buscar por nome, email ou empresa..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-10 bg-secondary/50 border-border/50" />
            </div>
            <Select value={roleFilter} onValueChange={setRoleFilter}>
              <SelectTrigger className="w-full md:w-44"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os papéis</SelectItem>
                <SelectItem value="master">Master Admin</SelectItem>
                <SelectItem value="admin">Admin</SelectItem>
                <SelectItem value="financeiro">Financeiro</SelectItem>
                <SelectItem value="gestor">Gestor</SelectItem>
                <SelectItem value="agente">Agente</SelectItem>
              </SelectContent>
            </Select>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-full md:w-44"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os status</SelectItem>
                <SelectItem value="active">Ativos</SelectItem>
                <SelectItem value="inactive">Inativos</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </Card>

        <Card className="glass-card overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="border-b border-border hover:bg-transparent">
                <SortableTableHead label="Usuário" sortKey="name" active={sort.key === 'name'} direction={sort.direction} onSort={(k) => toggle(k as SortKey)} />
                <SortableTableHead label="Empresa" sortKey="company" active={sort.key === 'company'} direction={sort.direction} onSort={(k) => toggle(k as SortKey)} />
                <SortableTableHead label="Papel" sortKey="role" active={sort.key === 'role'} direction={sort.direction} onSort={(k) => toggle(k as SortKey)} />
                <SortableTableHead label="Ativo" sortKey="active" active={sort.key === 'active'} direction={sort.direction} onSort={(k) => toggle(k as SortKey)} />
                <SortableTableHead label="Último acesso" sortKey="last_seen" active={sort.key === 'last_seen'} direction={sort.direction} onSort={(k) => toggle(k as SortKey)} />
                <TableHead className="w-[100px] text-xs font-medium text-muted-foreground normal-case text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody className="divide-y divide-border">
              {sorted.length === 0 ? (
                <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">Nenhum usuário encontrado.</TableCell></TableRow>
              ) : sorted.map((u) => {
                const r = roleMap[u.role] || roleMap.user;
                const RoleIcon = r.icon;
                return (
                  <TableRow key={u.id} className="border-0 hover:bg-muted/40 transition-colors">
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <Avatar className="w-9 h-9">
                          <AvatarImage src={u.avatar_url || undefined} />
                          <AvatarFallback>{(u.full_name || u.email).charAt(0).toUpperCase()}</AvatarFallback>
                        </Avatar>
                        <div>
                          <p className="font-medium">{u.full_name || '—'}</p>
                          <p className="text-xs text-muted-foreground">{u.email}</p>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      {u.company_name ? (
                        <div className="flex items-center gap-2 text-sm"><Building2 className="w-3.5 h-3.5 text-muted-foreground" />{u.company_name}</div>
                      ) : <span className="text-xs text-muted-foreground">—</span>}
                    </TableCell>
                    <TableCell>
                      <Select
                        value={u.role}
                        onValueChange={(v) => handleRoleChange(u, v as any)}
                      >
                        <SelectTrigger className="h-8 w-[140px] border-border/40 bg-transparent">
                          <SelectValue>
                            <span className="inline-flex items-center gap-1.5">
                              <RoleIcon className="w-3.5 h-3.5" />
                              {r.label}
                            </span>
                          </SelectValue>
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="agente">Agente</SelectItem>
                          <SelectItem value="gestor">Gestor</SelectItem>
                          <SelectItem value="financeiro">Financeiro</SelectItem>
                          <SelectItem value="admin">Admin</SelectItem>
                          <SelectItem value="master">Master Admin</SelectItem>
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <div>
                            <Switch
                              checked={u.is_active}
                              onCheckedChange={(v) => handleToggleActive(u, v)}
                            />
                          </div>
                        </TooltipTrigger>
                        <TooltipContent>{u.is_active ? 'Desativar acesso' : 'Reativar acesso'}</TooltipContent>
                      </Tooltip>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {u.last_seen ? format(new Date(u.last_seen), "dd/MM/yyyy HH:mm", { locale: ptBR }) : '—'}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center justify-end gap-1">
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setEditing(u)}>
                              <Pencil className="w-4 h-4" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>Editar</TooltipContent>
                        </Tooltip>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-destructive hover:text-destructive hover:bg-destructive/10"
                              onClick={() => setConfirmDelete(u)}
                            >
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>Remover acesso</TooltipContent>
                        </Tooltip>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </Card>

        <UserEditDrawer open={!!editing} onOpenChange={(o) => !o && setEditing(null)} user={editing} />
        <UserCreateDrawer open={creating} onOpenChange={setCreating} />

        <AlertDialog open={!!confirmDelete} onOpenChange={(o) => !o && setConfirmDelete(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Excluir definitivamente "{confirmDelete?.full_name || confirmDelete?.email}"?</AlertDialogTitle>
              <AlertDialogDescription>
                Esta ação é irreversível. O login, perfil e todos os papéis do usuário serão removidos. Para apenas suspender o acesso, use o botão de ativação ao lado.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancelar</AlertDialogCancel>
              <AlertDialogAction onClick={handleDelete} className="bg-destructive hover:bg-destructive/90">
                Excluir
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        <AlertDialog open={!!confirmMaster} onOpenChange={(o) => !o && setConfirmMaster(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle className="flex items-center gap-2">
                <AlertTriangle className="w-5 h-5 text-[hsl(var(--amber))]" />
                Promover a Master?
              </AlertDialogTitle>
              <AlertDialogDescription>
                Masters têm acesso total à plataforma, incluindo todas as empresas e configurações de sistema.
                Tem certeza que deseja promover <strong>{confirmMaster?.user.full_name || confirmMaster?.user.email}</strong>?
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancelar</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => {
                  if (confirmMaster) applyRoleChange(confirmMaster.user, confirmMaster.nextRole);
                  setConfirmMaster(null);
                }}
              >
                Promover a Master
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </PageShell>
    </TooltipProvider>
  );
}
