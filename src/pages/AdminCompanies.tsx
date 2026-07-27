import { PageShell } from '@/components/layout/PageShell';
import { useMemo, useState } from 'react';
import { SortableTableHead } from '@/components/ui/sortable-table-head';
import { useSortableData } from '@/hooks/useSortableData';
import { useAuth } from '@/contexts/AuthContext';
import { Navigate } from 'react-router-dom';
import { 
  Plus, 
  Search, 
  MoreHorizontal, 
  Building2,
  Users,
  Calendar,
  CheckCircle2,
  AlertCircle,
  Pause,
  Loader2,
  Stethoscope,
} from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { useCompanies, useCreateCompany, useUpdateCompany } from '@/hooks/useCompanies';
import { useSubscriptions } from '@/hooks/useSubscriptions';
import { CompanyDetailsDrawer } from '@/components/admin/CompanyDetailsDrawer';
import { CompanyStatusChangeDialog } from '@/components/admin/CompanyStatusChangeDialog';
import { CompanyCreateWizard } from '@/components/admin/CompanyCreateWizard';
import { CompanyDeleteDialog } from '@/components/admin/CompanyDeleteDialog';
import { PendingUsersTab } from '@/components/admin/PendingUsersTab';
import { usePendingUsers } from '@/hooks/usePendingUsers';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Trash2 } from 'lucide-react';

type SelectedCompany = {
  id: string;
  name: string;
  plan_status: 'active' | 'trial' | 'suspended' | 'cancelled';
  usersCount: number;
  leadsCount: number;
  created_at: string;
};

const statusConfig: Record<string, { label: string; icon: React.ElementType; className: string }> = {
  active: { 
    label: 'Ativo', 
    icon: CheckCircle2, 
    className: 'bg-emerald/20 text-emerald border-emerald/30' 
  },
  trial: { 
    label: 'Trial', 
    icon: AlertCircle, 
    className: 'bg-amber/20 text-amber border-amber/30' 
  },
  suspended: { 
    label: 'Suspenso', 
    icon: Pause, 
    className: 'bg-rose/20 text-rose border-rose/30' 
  },
  cancelled: { 
    label: 'Cancelado', 
    icon: Pause, 
    className: 'bg-muted text-muted-foreground border-border' 
  },
};

export default function AdminCompanies() {
  const { isMaster, loading: authLoading } = useAuth();
  const { toast } = useToast();
  const { data: companies = [], isLoading } = useCompanies();
  const createCompany = useCreateCompany();
  const updateCompany = useUpdateCompany();
  const qc = useQueryClient();

  const setVertical = async (companyId: string, vertical: 'standard' | 'medical') => {
    try {
      const { error } = await (supabase as any).rpc('set_company_vertical', {
        p_company_id: companyId,
        p_vertical: vertical,
      });
      if (error) throw error;
      await qc.invalidateQueries({ queryKey: ['companies'] });
      toast({
        title: vertical === 'medical' ? 'Vertical médica ativada' : 'Vertical revertida para padrão',
      });
    } catch (e: any) {
      toast({ title: 'Erro', description: e?.message ?? 'Falha ao alterar vertical', variant: 'destructive' });
    }
  };

  const [searchQuery, setSearchQuery] = useState('');
  const [wizardOpen, setWizardOpen] = useState(false);
  const [selectedCompany, setSelectedCompany] = useState<SelectedCompany | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null);
  const [statusChange, setStatusChange] = useState<{
    open: boolean;
    company: { id: string; name: string; plan_status: SelectedCompany['plan_status'] } | null;
    target: 'active' | 'trial' | 'suspended' | 'cancelled';
  }>({ open: false, company: null, target: 'active' });
  const { data: subscriptions = [] } = useSubscriptions();
  const { data: pendingUsers = [] } = usePendingUsers();
  const pendingCount = pendingUsers.length;

  // Map company_id -> subscription for quick lookup
  const subsByCompany = new Map(subscriptions.map((s) => [s.company_id, s]));
  const monthlyValue = (s: typeof subscriptions[number]) =>
    s.billing_cycle === 'yearly' ? Number(s.monthly_price) / 12 : Number(s.monthly_price);
  const totalMrr = subscriptions
    .filter((s) => s.status === 'active')
    .reduce((sum, s) => sum + monthlyValue(s), 0);
  const formatBRL = (v: number) =>
    v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 0 });

  if (!authLoading && !isMaster) {
    return <Navigate to="/dashboard" replace />;
  }

  const filteredCompanies = companies.filter((company) =>
    company.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  type CoSortKey = 'name' | 'status' | 'users' | 'leads' | 'created';
  const coAccessors = useMemo(() => ({
    name: (c: any) => (c.name || '').toLowerCase(),
    status: (c: any) => c.plan_status,
    users: (c: any) => c.usersCount,
    leads: (c: any) => c.leadsCount,
    created: (c: any) => new Date(c.created_at),
  }), []);
  const { sorted: sortedCompanies, sort: coSort, toggle: toggleCoSort } =
    useSortableData<any, CoSortKey>(filteredCompanies, coAccessors, { key: 'name', direction: 'asc' });

  const formatDate = (date: string) => {
    return new Date(date).toLocaleDateString('pt-BR', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });
  };

  const totalUsers = companies.reduce((sum, c) => sum + c.usersCount, 0);
  const totalLeads = companies.reduce((sum, c) => sum + c.leadsCount, 0);
  const activeCompanies = companies.filter((c) => c.plan_status === 'active').length;

  // create/update handled by CompanyCreateWizard and CompanyDetailsDrawer


  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-[50vh]">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <PageShell
      title="Empresas"
      subtitle="Gerencie todas as empresas da plataforma"
      actions={
        <Button variant="glow" onClick={() => setWizardOpen(true)}>
          <Plus className="w-4 h-4 mr-2" />
          Nova Empresa
        </Button>
      }
    >

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
        <Card className="stat-card">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-primary/20 flex items-center justify-center">
              <Building2 className="w-6 h-6 text-primary" />
            </div>
            <div>
              <p className="text-2xl font-semibold">{companies.length}</p>
              <p className="text-sm text-muted-foreground">Empresas</p>
            </div>
          </div>
        </Card>
        <Card className="stat-card">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-emerald/20 flex items-center justify-center">
              <CheckCircle2 className="w-6 h-6 text-emerald" />
            </div>
            <div>
              <p className="text-2xl font-semibold">{activeCompanies}</p>
              <p className="text-sm text-muted-foreground">Ativas</p>
            </div>
          </div>
        </Card>
        <Card className="stat-card">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-emerald/20 flex items-center justify-center">
              <Calendar className="w-6 h-6 text-emerald" />
            </div>
            <div>
              <p className="text-2xl font-semibold text-foreground">{formatBRL(totalMrr)}</p>
              <p className="text-sm text-muted-foreground">MRR</p>
            </div>
          </div>
        </Card>
        <Card className="stat-card">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-violet/20 flex items-center justify-center">
              <Users className="w-6 h-6 text-violet" />
            </div>
            <div>
              <p className="text-2xl font-semibold">{totalUsers}</p>
              <p className="text-sm text-muted-foreground">Usuários</p>
            </div>
          </div>
        </Card>
        <Card className="stat-card">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-cyan/20 flex items-center justify-center">
              <Users className="w-6 h-6 text-cyan" />
            </div>
            <div>
              <p className="text-2xl font-semibold">{totalLeads.toLocaleString()}</p>
              <p className="text-sm text-muted-foreground">Leads</p>
            </div>
          </div>
        </Card>
      </div>

      <Tabs defaultValue="companies" className="space-y-4">
        <TabsList>
          <TabsTrigger value="companies">Empresas</TabsTrigger>
          <TabsTrigger value="pending">
            Pendentes
            {pendingCount > 0 && (
              <span className="ml-2 inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full bg-amber/20 text-amber text-xs font-semibold">
                {pendingCount}
              </span>
            )}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="companies" className="space-y-4">
          {/* Search */}
          <Card className="glass-card p-4">
            <div className="relative max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Buscar empresa..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10 bg-secondary/50 border-border/50"
              />
            </div>
          </Card>

          {/* Table */}
          <Card className="glass-card overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow className="border-b border-border hover:bg-transparent">
                  <SortableTableHead label="Empresa" sortKey="name" active={coSort.key === 'name'} direction={coSort.direction} onSort={(k) => toggleCoSort(k as CoSortKey)} />
                  <SortableTableHead label="Status" sortKey="status" active={coSort.key === 'status'} direction={coSort.direction} onSort={(k) => toggleCoSort(k as CoSortKey)} />
                  <TableHead className="text-xs font-medium text-muted-foreground normal-case">Vertical</TableHead>
                  <TableHead className="text-xs font-medium text-muted-foreground normal-case">Plano / MRR</TableHead>
                  <SortableTableHead label="Usuários" sortKey="users" active={coSort.key === 'users'} direction={coSort.direction} onSort={(k) => toggleCoSort(k as CoSortKey)} />
                  <SortableTableHead label="Leads" sortKey="leads" active={coSort.key === 'leads'} direction={coSort.direction} onSort={(k) => toggleCoSort(k as CoSortKey)} />
                  <SortableTableHead label="Criado em" sortKey="created" active={coSort.key === 'created'} direction={coSort.direction} onSort={(k) => toggleCoSort(k as CoSortKey)} />
                  <TableHead className="w-[50px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody className="divide-y divide-border">
                {sortedCompanies.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                      {searchQuery ? 'Nenhuma empresa encontrada.' : 'Nenhuma empresa cadastrada.'}
                    </TableCell>
                  </TableRow>
                ) : (
                  sortedCompanies.map((company, index) => {
                    const status = statusConfig[company.plan_status] || statusConfig.cancelled;
                    const StatusIcon = status.icon;
                    const sub = subsByCompany.get(company.id);
                    const openDetails = () =>
                      setSelectedCompany({
                        id: company.id,
                        name: company.name,
                        plan_status: company.plan_status as SelectedCompany['plan_status'],
                        usersCount: company.usersCount,
                        leadsCount: company.leadsCount,
                        created_at: company.created_at,
                      });

                    return (
                      <TableRow
                        key={company.id}
                        onClick={openDetails}
                        className="border-0 hover:bg-muted/40 cursor-pointer transition-colors"
                        style={{ animationDelay: `${index * 50}ms` }}
                      >
                        <TableCell>
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-lg bg-primary/20 flex items-center justify-center">
                              <Building2 className="w-5 h-5 text-primary" />
                            </div>
                            <span className="font-medium">{company.name}</span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className={status.className}>
                            <StatusIcon className="w-3.5 h-3.5 mr-1" />
                            {status.label}
                          </Badge>
                        </TableCell>
                        <TableCell onClick={(e) => e.stopPropagation()}>
                          <Select
                            value={((company as any).crm_vertical as string) ?? 'standard'}
                            onValueChange={(v) => setVertical(company.id, v as 'standard' | 'medical')}
                          >
                            <SelectTrigger className="h-8 w-[130px] text-xs">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="standard">Padrão</SelectItem>
                              <SelectItem value="medical">
                                <span className="inline-flex items-center gap-1.5">
                                  <Stethoscope className="w-3.5 h-3.5" /> Médica
                                </span>
                              </SelectItem>
                            </SelectContent>
                          </Select>
                        </TableCell>
                        <TableCell>
                          {sub ? (
                            <div>
                              <p className="font-medium text-sm">{sub.plan_name}</p>
                              <p className="text-xs text-emerald">
                                {formatBRL(monthlyValue(sub))}
                                <span className="text-muted-foreground">/mês</span>
                              </p>
                            </div>
                          ) : (
                            <button
                              className="text-xs text-muted-foreground hover:text-primary underline-offset-2 hover:underline"
                              onClick={(e) => {
                                e.stopPropagation();
                                openDetails();
                              }}
                            >
                              Sem plano
                            </button>
                          )}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <Users className="w-4 h-4 text-muted-foreground" />
                            <span>{company.usersCount}</span>
                          </div>
                        </TableCell>
                        <TableCell>{company.leadsCount.toLocaleString()}</TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2 text-muted-foreground text-sm">
                            <Calendar className="w-3.5 h-3.5" />
                            <span>{formatDate(company.created_at)}</span>
                          </div>
                        </TableCell>
                        <TableCell onClick={(e) => e.stopPropagation()}>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon" className="h-8 w-8">
                                <MoreHorizontal className="w-4 h-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem onClick={openDetails}>
                                Abrir detalhes
                              </DropdownMenuItem>
                              {company.plan_status === 'suspended' || company.plan_status === 'cancelled' ? (
                                <DropdownMenuItem
                                  onClick={() =>
                                    setStatusChange({
                                      open: true,
                                      company: {
                                        id: company.id,
                                        name: company.name,
                                        plan_status: company.plan_status as SelectedCompany['plan_status'],
                                      },
                                      target: 'active',
                                    })
                                  }
                                >
                                  Reativar
                                </DropdownMenuItem>
                              ) : (
                                <DropdownMenuItem
                                  className="text-destructive"
                                  onClick={() =>
                                    setStatusChange({
                                      open: true,
                                      company: {
                                        id: company.id,
                                        name: company.name,
                                        plan_status: company.plan_status as SelectedCompany['plan_status'],
                                      },
                                      target: 'suspended',
                                    })
                                  }
                                >
                                  Suspender
                                </DropdownMenuItem>
                              )}
                              <DropdownMenuItem
                                className="text-destructive"
                                onClick={() => setDeleteTarget({ id: company.id, name: company.name })}
                              >
                                <Trash2 className="w-4 h-4 mr-2" />
                                Excluir
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </Card>
        </TabsContent>

        <TabsContent value="pending">
          <PendingUsersTab />
        </TabsContent>
      </Tabs>

      <CompanyDetailsDrawer
        open={!!selectedCompany}
        onOpenChange={(o) => !o && setSelectedCompany(null)}
        companyId={selectedCompany?.id || null}
        companyName={selectedCompany?.name || ''}
        companyStatus={selectedCompany?.plan_status}
        usersCount={selectedCompany?.usersCount}
        leadsCount={selectedCompany?.leadsCount}
        createdAt={selectedCompany?.created_at}
      />

      <CompanyStatusChangeDialog
        open={statusChange.open}
        onOpenChange={(o) => setStatusChange((s) => ({ ...s, open: o }))}
        companyId={statusChange.company?.id ?? null}
        companyName={statusChange.company?.name ?? ''}
        currentStatus={statusChange.company?.plan_status}
        targetStatus={statusChange.target}
      />

      <CompanyCreateWizard open={wizardOpen} onOpenChange={setWizardOpen} />

      <CompanyDeleteDialog
        open={!!deleteTarget}
        onOpenChange={(o) => !o && setDeleteTarget(null)}
        companyId={deleteTarget?.id ?? null}
        companyName={deleteTarget?.name ?? ''}
      />
    </PageShell>
  );
}
