import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Sheet, SheetContent } from '@/components/ui/sheet';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  CompanyProfileForm,
  EMPTY_COMPANY_PROFILE,
  companyToProfileValues,
  profileValuesToUpdate,
  type CompanyProfileValues,
} from './CompanyProfileForm';
import { CompanyDeleteDialog } from './CompanyDeleteDialog';
import { CompanyStatusChangeDialog } from './CompanyStatusChangeDialog';
import { useToast } from '@/hooks/use-toast';
import {
  useCompanySubscription,
  useUpsertSubscription,
} from '@/hooks/useSubscriptions';
import { useSubscriptionPlans } from '@/hooks/useSubscriptionPlans';
import { useUpdateCompany } from '@/hooks/useCompanies';
import { useAllUsers, useUpdateUser } from '@/hooks/useAllUsers';
import { addMonths, addYears } from 'date-fns';
import type { PlanStatus, SubStatus, AppRole } from './company-details/types';
import { DrawerHeader } from './company-details/DrawerHeader';
import { OverviewTab } from './company-details/OverviewTab';
import { PlanTab } from './company-details/PlanTab';
import { AddonsTab } from './company-details/AddonsTab';
import { AppearanceTab } from './company-details/AppearanceTab';
import { UsersTab } from './company-details/UsersTab';
import { ActionsTab } from './company-details/ActionsTab';
import { useCompanyAddons } from './company-details/useCompanyAddons';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  companyId: string | null;
  companyName: string;
  companyStatus?: PlanStatus;
  usersCount?: number;
  leadsCount?: number;
  createdAt?: string;
}

export function CompanyDetailsDrawer({
  open,
  onOpenChange,
  companyId,
  companyName,
  companyStatus,
  usersCount = 0,
  leadsCount = 0,
  createdAt,
}: Props) {
  const { toast } = useToast();
  const updateCompany = useUpdateCompany();
  const { data: subscription, isLoading: subLoading } = useCompanySubscription(
    companyId || undefined
  );
  const { data: plans = [] } = useSubscriptionPlans();
  const { data: allUsers = [] } = useAllUsers();
  const upsertSub = useUpsertSubscription();
  const updateUser = useUpdateUser();

  const addons = useCompanyAddons({ companyId, open });

  const [profile, setProfile] = useState<CompanyProfileValues>(EMPTY_COMPANY_PROFILE);
  const [savingProfile, setSavingProfile] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [statusDialog, setStatusDialog] = useState<{ open: boolean; target: PlanStatus }>({
    open: false,
    target: 'active',
  });

  // Full company record (cadastro)
  const { data: fullCompany } = useQuery({
    queryKey: ['company-full', companyId],
    queryFn: async () => {
      if (!companyId) return null;
      const { data } = await supabase.from('companies').select('*').eq('id', companyId).maybeSingle();
      return data;
    },
    enabled: !!companyId && open,
  });

  useEffect(() => {
    if (fullCompany) setProfile(companyToProfileValues(fullCompany));
  }, [fullCompany]);

  // Subscription form state
  const [planId, setPlanId] = useState<string | null>(null);
  const [planName, setPlanName] = useState('Starter');
  const [monthlyPrice, setMonthlyPrice] = useState('97');
  const [billingCycle, setBillingCycle] = useState<'monthly' | 'yearly'>('monthly');
  const [subStatus, setSubStatus] = useState<SubStatus>('trialing');

  useEffect(() => {
    if (subscription) {
      setPlanId((subscription as any).plan_id ?? null);
      setPlanName(subscription.plan_name);
      setMonthlyPrice(String(subscription.monthly_price));
      setBillingCycle(subscription.billing_cycle);
      setSubStatus(subscription.status);
    } else {
      setPlanId(null);
      setPlanName('Starter');
      setMonthlyPrice('97');
      setBillingCycle('monthly');
      setSubStatus('trialing');
    }
  }, [subscription, companyId]);

  const companyUsers = useMemo(
    () => allUsers.filter((u) => u.company_id === companyId),
    [allUsers, companyId]
  );

  const effectiveMrr = useMemo(() => {
    const v = parseFloat(monthlyPrice.replace(',', '.') || '0');
    return billingCycle === 'yearly' ? v / 12 : v;
  }, [monthlyPrice, billingCycle]);

  // ─── Handlers ────────────────────────────────────────
  const handleSaveProfile = async () => {
    if (!companyId) return;
    setSavingProfile(true);
    try {
      const payload = profileValuesToUpdate(profile);
      await updateCompany.mutateAsync({ id: companyId, ...payload } as any);
      toast({ title: 'Dados atualizados' });
    } catch (err: any) {
      toast({ title: 'Erro ao salvar', description: err.message, variant: 'destructive' });
    } finally {
      setSavingProfile(false);
    }
  };

  const handleStatusChange = (next: PlanStatus) => {
    if (!companyId || next === companyStatus) return;
    setStatusDialog({ open: true, target: next });
  };

  const applyPlan = (id: string) => {
    if (id === '__custom__') {
      setPlanId(null);
      return;
    }
    const p = plans.find((pl) => pl.id === id);
    if (!p) return;
    setPlanId(p.id);
    setPlanName(p.name);
    setMonthlyPrice(String(billingCycle === 'yearly' ? p.yearly_price : p.monthly_price));
  };

  const handleSaveSubscription = async () => {
    if (!companyId) return;
    const price = parseFloat(monthlyPrice.replace(',', '.'));
    if (isNaN(price) || price < 0) {
      toast({ title: 'Valor inválido', variant: 'destructive' });
      return;
    }
    const now = new Date();
    const periodEnd = billingCycle === 'yearly' ? addYears(now, 1) : addMonths(now, 1);

    try {
      await upsertSub.mutateAsync({
        id: subscription?.id,
        company_id: companyId,
        plan_id: planId ?? undefined,
        plan_name: planName,
        monthly_price: price,
        billing_cycle: billingCycle,
        status: subStatus,
        ...(subscription
          ? {}
          : {
              started_at: now.toISOString(),
              current_period_start: now.toISOString(),
              current_period_end: periodEnd.toISOString(),
            }),
        ...(subStatus === 'canceled' && !subscription?.canceled_at
          ? { canceled_at: now.toISOString() }
          : {}),
      } as any);
      toast({ title: 'Assinatura salva' });
    } catch (err: any) {
      toast({ title: 'Erro', description: err.message, variant: 'destructive' });
    }
  };

  const handleRenewPeriod = async () => {
    if (!subscription) return;
    const now = new Date();
    const end = billingCycle === 'yearly' ? addYears(now, 1) : addMonths(now, 1);
    try {
      await upsertSub.mutateAsync({
        id: subscription.id,
        company_id: subscription.company_id,
        status: 'active',
        current_period_start: now.toISOString(),
        current_period_end: end.toISOString(),
        canceled_at: null as any,
      });
      toast({ title: 'Período renovado' });
    } catch (err: any) {
      toast({ title: 'Erro', description: err.message, variant: 'destructive' });
    }
  };

  const handleCancelSubscription = async () => {
    if (!subscription) return;
    try {
      await upsertSub.mutateAsync({
        id: subscription.id,
        company_id: subscription.company_id,
        status: 'canceled',
        canceled_at: new Date().toISOString(),
      });
      toast({ title: 'Assinatura cancelada' });
    } catch (err: any) {
      toast({ title: 'Erro', description: err.message, variant: 'destructive' });
    }
  };

  const handleRoleChange = async (userId: string, role: AppRole) => {
    try {
      await updateUser.mutateAsync({ id: userId, role });
      toast({ title: 'Função atualizada' });
    } catch (err: any) {
      toast({ title: 'Erro', description: err.message, variant: 'destructive' });
    }
  };

  const handleToggleActive = async (userId: string, is_active: boolean) => {
    try {
      await updateUser.mutateAsync({ id: userId, is_active });
      toast({ title: is_active ? 'Usuário ativado' : 'Usuário desativado' });
    } catch (err: any) {
      toast({ title: 'Erro', description: err.message, variant: 'destructive' });
    }
  };

  const handleRemoveUser = async (userId: string) => {
    try {
      await updateUser.mutateAsync({ id: userId, company_id: null });
      toast({ title: 'Usuário removido da empresa' });
    } catch (err: any) {
      toast({ title: 'Erro', description: err.message, variant: 'destructive' });
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-xl h-[100dvh] overflow-hidden p-0 flex flex-col">
        <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain">
          <div className="p-6 flex flex-col gap-4">
            <DrawerHeader
              companyName={companyName}
              companyStatus={companyStatus}
              createdAt={createdAt}
            />

            <Tabs defaultValue="overview" className="mt-6">
              <TabsList className="grid grid-cols-6 w-full">
                <TabsTrigger value="overview">Visão geral</TabsTrigger>
                <TabsTrigger value="plan">Plano</TabsTrigger>
                <TabsTrigger value="addons">Add-ons</TabsTrigger>
                <TabsTrigger value="appearance">Aparência</TabsTrigger>
                <TabsTrigger value="users">Usuários</TabsTrigger>
                <TabsTrigger value="actions">Ações</TabsTrigger>
              </TabsList>

              <TabsContent value="overview" className="space-y-4 mt-4">
                <OverviewTab
                  companyId={companyId}
                  profile={profile}
                  onProfileChange={setProfile}
                  savingProfile={savingProfile}
                  onSaveProfile={handleSaveProfile}
                  companyUsersCount={companyUsers.length}
                  usersCount={usersCount}
                  leadsCount={leadsCount}
                  subscription={subscription}
                  effectiveMrr={effectiveMrr}
                  companyStatus={companyStatus}
                  onStatusChange={handleStatusChange}
                />
              </TabsContent>

              <TabsContent value="plan" className="space-y-4 mt-4">
                <PlanTab
                  subLoading={subLoading}
                  subscription={subscription}
                  plans={plans as any}
                  planId={planId}
                  planName={planName}
                  monthlyPrice={monthlyPrice}
                  billingCycle={billingCycle}
                  subStatus={subStatus}
                  effectiveMrr={effectiveMrr}
                  upsertPending={upsertSub.isPending}
                  onApplyPlan={applyPlan}
                  onPlanNameChange={setPlanName}
                  onPriceChange={setMonthlyPrice}
                  onCycleChange={setBillingCycle}
                  onSubStatusChange={setSubStatus}
                  onSave={handleSaveSubscription}
                />
              </TabsContent>

              <TabsContent value="addons" className="space-y-3 mt-4">
                <AddonsTab addons={addons} companyUpdatePending={updateCompany.isPending} />
              </TabsContent>

              <TabsContent value="appearance" className="space-y-3 mt-4">
                <AppearanceTab companyId={companyId} />
              </TabsContent>

              <TabsContent value="users" className="space-y-3 mt-4">
                <UsersTab
                  users={companyUsers as any}
                  onRoleChange={handleRoleChange}
                  onToggleActive={handleToggleActive}
                  onRemoveUser={handleRemoveUser}
                />
              </TabsContent>

              <TabsContent value="actions" className="space-y-3 mt-4">
                <ActionsTab
                  companyId={companyId}
                  companyName={companyName}
                  companyStatus={companyStatus}
                  companyUpdatePending={updateCompany.isPending}
                  subscription={subscription}
                  upsertPending={upsertSub.isPending}
                  onStatusChange={handleStatusChange}
                  onRenew={handleRenewPeriod}
                  onCancel={handleCancelSubscription}
                  onRequestDelete={() => setDeleteOpen(true)}
                />
              </TabsContent>
            </Tabs>
          </div>
        </div>
      </SheetContent>

      <CompanyStatusChangeDialog
        open={statusDialog.open}
        onOpenChange={(o) => setStatusDialog((s) => ({ ...s, open: o }))}
        companyId={companyId}
        companyName={companyName}
        currentStatus={companyStatus}
        targetStatus={statusDialog.target}
      />

      <CompanyDeleteDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        companyId={companyId}
        companyName={companyName}
        onDeleted={() => onOpenChange(false)}
      />
    </Sheet>
  );
}
