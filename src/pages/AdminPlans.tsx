import { PageShell } from '@/components/layout/PageShell';
import { useState, useEffect, useRef } from 'react';
import { Plus, Package, CheckCircle2, XCircle, Pencil, Trash2, Loader2, Users, Tag, Copy, Star } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Input } from '@/components/ui/input';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { SortableTableHead } from '@/components/ui/sortable-table-head';
import { useSortableData } from '@/hooks/useSortableData';
import { useMemo } from 'react';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { useToast } from '@/hooks/use-toast';
import {
  useSubscriptionPlans, useDeletePlan, useTogglePlanActive, useUpdatePlan, useDuplicatePlan,
  type SubscriptionPlan,
} from '@/hooks/useSubscriptionPlans';
import { useAllSubscriptions } from '@/hooks/useAllSubscriptions';
import { PlanDrawer } from '@/components/admin/PlanDrawer';

const formatBRL = (v: number) =>
  v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 0 });

// Inline editable price cell — click to edit, Enter to save, Esc to cancel
function PriceCell({
  value, onSave, accent,
}: { value: number; onSave: (v: number) => Promise<void>; accent?: boolean }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(String(value));
  const [saving, setSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { setDraft(String(value)); }, [value]);
  useEffect(() => { if (editing) inputRef.current?.select(); }, [editing]);

  const commit = async () => {
    const num = Number(draft.replace(',', '.'));
    if (Number.isNaN(num) || num < 0) { setDraft(String(value)); setEditing(false); return; }
    if (num === value) { setEditing(false); return; }
    setSaving(true);
    try { await onSave(num); } finally { setSaving(false); setEditing(false); }
  };

  if (editing) {
    return (
      <Input
        ref={inputRef}
        type="number"
        step="1"
        min={0}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') commit();
          if (e.key === 'Escape') { setDraft(String(value)); setEditing(false); }
        }}
        disabled={saving}
        className="h-8 w-24"
      />
    );
  }

  return (
    <button
      onClick={() => setEditing(true)}
      className={`font-medium text-left hover:underline decoration-dotted underline-offset-4 ${accent ? 'text-emerald' : ''}`}
      title="Clique para editar"
    >
      {formatBRL(value)}
    </button>
  );
}

export default function AdminPlans() {
  const { toast } = useToast();
  const { data: plans = [], isLoading } = useSubscriptionPlans();
  const { data: subs = [] } = useAllSubscriptions();
  const del = useDeletePlan();
  const toggle = useTogglePlanActive();
  const update = useUpdatePlan();
  const duplicate = useDuplicatePlan();

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editing, setEditing] = useState<SubscriptionPlan | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<SubscriptionPlan | null>(null);

  const subsByPlan = subs.reduce<Record<string, number>>((acc, s) => {
    if (s.plan_id) acc[s.plan_id] = (acc[s.plan_id] || 0) + 1;
    return acc;
  }, {});

  const handleEdit = (plan: SubscriptionPlan) => { setEditing(plan); setDrawerOpen(true); };
  const handleNew = () => { setEditing(null); setDrawerOpen(true); };

  const handleDuplicate = async (plan: SubscriptionPlan) => {
    try {
      await duplicate.mutateAsync(plan);
      toast({ title: 'Plano duplicado', description: 'Criado como inativo. Edite e ative quando quiser.' });
    } catch (e: any) {
      toast({ title: 'Erro', description: e.message, variant: 'destructive' });
    }
  };

  const handleDelete = async () => {
    if (!confirmDelete) return;
    if ((subsByPlan[confirmDelete.id] || 0) > 0) {
      toast({
        title: 'Não foi possível excluir',
        description: 'Existem assinaturas vinculadas a este plano. Desative-o em vez de excluir.',
        variant: 'destructive',
      });
      setConfirmDelete(null);
      return;
    }
    try {
      await del.mutateAsync(confirmDelete.id);
      toast({ title: 'Plano excluído' });
    } catch (err: any) {
      toast({ title: 'Erro', description: err.message, variant: 'destructive' });
    } finally {
      setConfirmDelete(null);
    }
  };

  const totalActive = plans.filter((p) => p.is_active).length;

  type PlanSortKey = 'name' | 'monthly' | 'yearly' | 'usage' | 'active';
  const planAccessors = useMemo(() => ({
    name: (p: SubscriptionPlan) => p.name?.toLowerCase() ?? '',
    monthly: (p: SubscriptionPlan) => p.monthly_price,
    yearly: (p: SubscriptionPlan) => p.yearly_price,
    usage: (p: SubscriptionPlan) => subsByPlan[p.id] || 0,
    active: (p: SubscriptionPlan) => (p.is_active ? 1 : 0),
  }), [subsByPlan]);
  const { sorted: sortedPlans, sort: planSort, toggle: togglePlanSort } =
    useSortableData<SubscriptionPlan, PlanSortKey>(plans, planAccessors, { key: 'name', direction: 'asc' });

  if (isLoading) {
    return <div className="flex items-center justify-center h-[50vh]"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>;
  }

  return (
    <TooltipProvider delayDuration={200}>
      <PageShell
        title="Planos de Assinatura"
        subtitle="Catálogo de produtos vendidos para empresas"
        actions={
          <Button variant="glow" onClick={handleNew}>
            <Plus className="w-4 h-4 mr-2" /> Novo plano
          </Button>
        }
      >

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card className="stat-card">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-primary/20 flex items-center justify-center"><Package className="w-6 h-6 text-primary" /></div>
              <div><p className="text-2xl font-semibold">{plans.length}</p><p className="text-sm text-muted-foreground">Total de planos</p></div>
            </div>
          </Card>
          <Card className="stat-card">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-emerald/20 flex items-center justify-center"><CheckCircle2 className="w-6 h-6 text-emerald" /></div>
              <div><p className="text-2xl font-semibold">{totalActive}</p><p className="text-sm text-muted-foreground">Ativos</p></div>
            </div>
          </Card>
          <Card className="stat-card">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-cyan/20 flex items-center justify-center"><Users className="w-6 h-6 text-cyan" /></div>
              <div><p className="text-2xl font-semibold">{subs.filter((s) => s.plan_id).length}</p><p className="text-sm text-muted-foreground">Assinaturas vinculadas</p></div>
            </div>
          </Card>
        </div>

        <Card className="glass-card overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="border-b border-border hover:bg-transparent">
                <SortableTableHead label="Plano" sortKey="name" active={planSort.key === 'name'} direction={planSort.direction} onSort={(k) => togglePlanSort(k as PlanSortKey)} />
                <SortableTableHead label="Mensal" sortKey="monthly" active={planSort.key === 'monthly'} direction={planSort.direction} onSort={(k) => togglePlanSort(k as PlanSortKey)} />
                <SortableTableHead label="Anual" sortKey="yearly" active={planSort.key === 'yearly'} direction={planSort.direction} onSort={(k) => togglePlanSort(k as PlanSortKey)} />
                <TableHead className="text-xs font-medium text-muted-foreground normal-case">Limites</TableHead>
                <SortableTableHead label="Empresas" sortKey="usage" active={planSort.key === 'usage'} direction={planSort.direction} onSort={(k) => togglePlanSort(k as PlanSortKey)} />
                <SortableTableHead label="Ativo" sortKey="active" active={planSort.key === 'active'} direction={planSort.direction} onSort={(k) => togglePlanSort(k as PlanSortKey)} />
                <TableHead className="w-[160px] text-xs font-medium text-muted-foreground normal-case text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody className="divide-y divide-border">
              {sortedPlans.length === 0 ? (
                <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">Nenhum plano cadastrado.</TableCell></TableRow>
              ) : sortedPlans.map((plan) => {
                const usage = subsByPlan[plan.id] || 0;
                return (
                  <TableRow key={plan.id} className="border-0 hover:bg-muted/40 transition-colors">
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-lg bg-primary/20 flex items-center justify-center"><Tag className="w-5 h-5 text-primary" /></div>
                        <div>
                          <p className="font-medium flex items-center gap-1.5">
                            {plan.name}
                            {plan.is_featured && (
                              <span title="Destacado na landing">
                                <Star className="w-3.5 h-3.5 fill-primary text-primary" />
                              </span>
                            )}
                          </p>
                          {plan.description && <p className="text-xs text-muted-foreground line-clamp-1">{plan.description}</p>}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <PriceCell value={plan.monthly_price} accent
                        onSave={(v) => update.mutateAsync({ id: plan.id, monthly_price: v })} />
                    </TableCell>
                    <TableCell>
                      <PriceCell value={plan.yearly_price}
                        onSave={(v) => update.mutateAsync({ id: plan.id, yearly_price: v })} />
                    </TableCell>
                    <TableCell>
                      <div className="text-xs text-muted-foreground space-y-0.5">
                        <div>Usuários: {plan.max_users ?? '∞'}</div>
                        <div>Leads: {plan.max_leads?.toLocaleString() ?? '∞'}</div>
                        <div>WhatsApp: {plan.max_whatsapp_instances ?? '∞'}</div>
                      </div>
                    </TableCell>
                    <TableCell>
                      {usage > 0 ? (
                        <Badge variant="outline" className="bg-cyan/10 text-cyan border-cyan/30">{usage}</Badge>
                      ) : (
                        <span className="text-xs text-muted-foreground">0</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <div>
                            <Switch
                              checked={plan.is_active}
                              onCheckedChange={(v) => toggle.mutate({ id: plan.id, is_active: v })}
                            />
                          </div>
                        </TooltipTrigger>
                        <TooltipContent>{plan.is_active ? 'Desativar plano' : 'Ativar plano'}</TooltipContent>
                      </Tooltip>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center justify-end gap-1">
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => handleEdit(plan)}>
                              <Pencil className="w-4 h-4" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>Editar</TooltipContent>
                        </Tooltip>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => handleDuplicate(plan)} disabled={duplicate.isPending}>
                              <Copy className="w-4 h-4" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>Duplicar</TooltipContent>
                        </Tooltip>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive hover:bg-destructive/10" onClick={() => setConfirmDelete(plan)}>
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>Excluir</TooltipContent>
                        </Tooltip>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </Card>

        <PlanDrawer open={drawerOpen} onOpenChange={setDrawerOpen} plan={editing} />

        <AlertDialog open={!!confirmDelete} onOpenChange={(o) => !o && setConfirmDelete(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Excluir plano "{confirmDelete?.name}"?</AlertDialogTitle>
              <AlertDialogDescription>Esta ação é permanente. Planos com assinaturas vinculadas não podem ser excluídos.</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancelar</AlertDialogCancel>
              <AlertDialogAction onClick={handleDelete} className="bg-destructive hover:bg-destructive/90">Excluir</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </PageShell>
    </TooltipProvider>
  );
}
