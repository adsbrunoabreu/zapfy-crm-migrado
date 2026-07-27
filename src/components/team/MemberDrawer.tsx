import { useEffect, useMemo, useState } from 'react';
import { format, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  ChevronDown,
  Target,
  Users,
  TrendingUp,
  MessageSquare,
  DollarSign,
  Pencil,
  Archive,
  Plus,
  Loader2,
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { getRole, getMemberStatus } from './teamConstants';
import { useMemberActivity } from '@/hooks/useMemberActivity';
import { useUserGoals, useDeleteGoal, type UserGoal } from '@/hooks/useUserGoals';
import { useGoalProgress } from '@/hooks/useGoalProgress';
import { useUpdateMemberProfile } from '@/hooks/useUpdateMemberProfile';
import { useUpdateMemberEmail } from '@/hooks/useMemberCrm';
import { useUpdateMemberRole } from '@/hooks/useUpdateMemberRole';
import { useToggleUserActive } from '@/hooks/useToggleUserActive';
import { useInstanceAgents, useToggleInstanceAgent } from '@/hooks/useInstanceAgents';
import { SetGoalDialog } from '@/components/team/SetGoalDialog';
import { EditGoalDialog } from '@/components/team/EditGoalDialog';

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  member: any | null;
  isSelf: boolean;
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

const statusBadgeClass: Record<string, string> = {
  new: 'bg-blue-500/15 text-blue-400 border-blue-500/30',
  contacted: 'bg-cyan-500/15 text-cyan-400 border-cyan-500/30',
  qualified: 'bg-violet-500/15 text-violet-400 border-violet-500/30',
  proposal: 'bg-amber/15 text-amber border-amber/30',
  negotiation: 'bg-orange-500/15 text-orange-400 border-orange-500/30',
  won: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
  lost: 'bg-destructive/15 text-destructive border-destructive/30',
};

const goalTypeMeta: Record<string, { label: string; emoji: string }> = {
  leads: { label: 'Leads', emoji: '🎯' },
  value: { label: 'Valor', emoji: '💰' },
  conversions: { label: 'Conversões', emoji: '📈' },
  conversion: { label: 'Conversão', emoji: '📈' },
};

const fmtBRL = (v: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v);

export function MemberDrawer({ open, onOpenChange, member, isSelf }: Props) {
  const navigate = useNavigate();
  const { profile } = useAuth();
  const companyId = profile?.company_id;
  const isAdmin = profile?.role === 'admin' || profile?.role === 'master';

  const { data: activity, isLoading: loadingActivity } = useMemberActivity(
    member?.id ?? null,
  );
  const { data: allGoals = [] } = useUserGoals();
  const memberGoals = useMemo(
    () => allGoals.filter((g) => g.user_id === member?.id),
    [allGoals, member?.id],
  );
  const { data: progressMap = {} } = useGoalProgress(memberGoals);
  const deleteGoal = useDeleteGoal();

  const updateProfile = useUpdateMemberProfile();
  const updateEmail = useUpdateMemberEmail();
  const updateRole = useUpdateMemberRole();
  const toggleActive = useToggleUserActive();

  const [goalDialog, setGoalDialog] = useState(false);
  const [editingGoal, setEditingGoal] = useState<UserGoal | null>(null);
  const [infoOpen, setInfoOpen] = useState(false);
  const [channelsOpen, setChannelsOpen] = useState(false);

  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [roleValue, setRoleValue] = useState<'admin' | 'gestor' | 'financeiro' | 'agente'>('agente');

  useEffect(() => {
    if (!member) return;
    setFullName(member.name || '');
    setPhone(member.phone || '');
    setEmail(member.email || '');
    const r = member.role as string;
    const normalized = r === 'company_admin' ? 'admin'
      : r === 'user' ? 'agente'
      : (r === 'admin' || r === 'gestor' || r === 'financeiro' || r === 'agente') ? r
      : 'agente';
    setRoleValue(normalized as 'admin' | 'gestor' | 'financeiro' | 'agente');
  }, [member?.id]);

  const { data: instances = [] } = useQuery({
    queryKey: ['drawer-channels', companyId],
    enabled: !!companyId && open,
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('whatsapp_instances')
        .select('id, instance_name, phone_number, provider')
        .eq('company_id', companyId!)
        .eq('is_active', true)
        .order('instance_name')
        .limit(200);
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: agentLinks = [] } = useInstanceAgents();
  const toggleChannel = useToggleInstanceAgent();
  const linkedSet = useMemo(() => {
    const set = new Set<string>();
    agentLinks.forEach((l) => {
      if (l.user_id === member?.id) set.add(l.instance_id);
    });
    return set;
  }, [agentLinks, member?.id]);

  if (!member) return null;

  const role = getRole(member.role);
  const RoleIcon = role.icon;
  const status = getMemberStatus(member);
  const isActive = member.isActive !== false;
  const canEditEmail = isAdmin && !isSelf;
  const canChangeRole = isAdmin && !isSelf && member.role !== 'master';
  const canToggleActive = isAdmin && !isSelf && member.role !== 'master';

  const profileDirty =
    fullName !== (member.name || '') || phone !== (member.phone || '');
  const emailDirty =
    canEditEmail &&
    email.trim().toLowerCase() !== (member.email || '').toLowerCase() &&
    /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email.trim());
  const anyDirty = profileDirty || emailDirty;
  const savingInfo = updateProfile.isPending || updateEmail.isPending;

  const saveInfo = () => {
    if (profileDirty) {
      updateProfile.mutate({
        userId: member.id,
        full_name: fullName.trim() || null,
        phone: phone.trim() || null,
      });
    }
    if (emailDirty) {
      updateEmail.mutate({
        memberId: member.id,
        email: email.trim().toLowerCase(),
      });
    }
  };

  // Active goal: first one whose period contains today; fallback: first
  const today = new Date().toISOString().slice(0, 10);
  const activeGoal =
    memberGoals.find(
      (g) => g.period_start <= today && g.period_end >= today,
    ) ?? memberGoals[0];
  const activeProgress = activeGoal ? progressMap[activeGoal.id] : null;
  const goalMeta = activeGoal
    ? goalTypeMeta[activeGoal.goal_type] ?? {
        label: activeGoal.goal_type,
        emoji: '🎯',
      }
    : null;
  const goalCurrent = activeProgress?.currentValue ?? 0;
  const goalPct = activeProgress?.percentage ?? 0;

  const stats = {
    leads: activity?.leadsCount ?? 0,
    conversions: activity?.conversionsCount ?? 0,
    messages: activity?.messagesCount ?? 0,
    value: activity?.totalValue ?? 0,
  };

  const leadsByStatus = activity?.leadsByStatus ?? {};

  const handleViewLeads = (status?: string) => {
    const params = new URLSearchParams({ assigned_to: member.id });
    if (status) params.set('status', status);
    navigate(`/leads?${params.toString()}`);
    onOpenChange(false);
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="w-full sm:max-w-xl h-[100dvh] overflow-hidden p-0 flex flex-col"
      >
        {/* HEADER */}
        <SheetHeader className="px-5 pt-5 pb-4 border-b border-border shrink-0">
          <div className="flex items-center gap-3">
            <div className="relative shrink-0">
              <div className="w-11 h-11 rounded-full bg-primary/15 flex items-center justify-center overflow-hidden">
                {member.avatarUrl ? (
                  <img
                    src={member.avatarUrl}
                    alt=""
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <span className="text-sm font-semibold text-primary">
                    {(member.name || member.email)?.[0]?.toUpperCase() || '?'}
                  </span>
                )}
              </div>
              <span
                className={`absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-background ${status.color}`}
              />
            </div>

            <div className="min-w-0 flex-1">
              <SheetTitle className="text-base truncate">
                {member.name || member.email}
              </SheetTitle>
              <div className="flex flex-wrap gap-1.5 mt-1">
                <Badge
                  variant="outline"
                  className={`${role.className} text-[10px] px-1.5 py-0 h-5`}
                >
                  <RoleIcon className="w-3 h-3 mr-1" />
                  {role.label}
                </Badge>
                <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-5">
                  <span className={`w-1.5 h-1.5 rounded-full mr-1 ${status.color}`} />
                  {status.label}
                </Badge>
              </div>
            </div>
          </div>
        </SheetHeader>

        {/* BODY */}
        <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain">
          <div className="px-5 py-5 space-y-6">
          {/* SECTION 1: META ATIVA */}
          {loadingActivity && !activeGoal ? (
            <div className="rounded-xl border border-border bg-card/40 p-6 flex items-center justify-center">
              <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
            </div>
          ) : activeGoal && goalMeta ? (
            <section
              className="rounded-xl border-2 p-5 space-y-3"
              style={{
                borderColor: 'hsl(var(--amber) / 0.5)',
                backgroundColor: 'hsl(var(--amber) / 0.08)',
              }}
            >
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-base sm:text-lg font-semibold flex items-center gap-2">
                  <span aria-hidden>{goalMeta.emoji}</span>
                  {goalMeta.label}
                </h3>
                <span className="text-xs font-medium text-amber">
                  {goalPct}% concluído
                </span>
              </div>

              <p className="text-xs text-muted-foreground">
                {format(parseISO(activeGoal.period_start), "MMM yyyy", { locale: ptBR })}
                {' · '}
                {format(parseISO(activeGoal.period_start), 'dd MMM', { locale: ptBR })}
                {' — '}
                {format(parseISO(activeGoal.period_end), 'dd MMM yyyy', { locale: ptBR })}
              </p>

              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">Progresso</span>
                  <span className="font-semibold text-amber">
                    {activeGoal.goal_type === 'value'
                      ? `${fmtBRL(goalCurrent)} / ${fmtBRL(activeGoal.target_value)}`
                      : `${goalCurrent} / ${activeGoal.target_value}`}
                  </span>
                </div>
                <div
                  className="h-2 rounded-full overflow-hidden"
                  style={{ backgroundColor: 'hsl(var(--amber) / 0.18)' }}
                >
                  <div
                    className="h-full rounded-full transition-[width] duration-500"
                    style={{
                      width: `${Math.min(Math.max(goalPct, 0), 100)}%`,
                      backgroundColor: 'hsl(var(--amber))',
                    }}
                  />
                </div>
              </div>

              <div className="flex gap-2 pt-1">
                <Button
                  size="sm"
                  variant="outline"
                  className="flex-1"
                  onClick={() => setEditingGoal(activeGoal)}
                >
                  <Pencil className="w-3.5 h-3.5 mr-1.5" />
                  Editar
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="flex-1"
                  onClick={() => deleteGoal.mutate(activeGoal.id)}
                  disabled={deleteGoal.isPending}
                >
                  <Archive className="w-3.5 h-3.5 mr-1.5" />
                  Arquivar
                </Button>
              </div>
            </section>
          ) : (
            <section className="rounded-xl border border-dashed border-border p-6 text-center space-y-3">
              <Target className="w-8 h-8 mx-auto text-muted-foreground/60" />
              <div>
                <p className="text-sm font-medium">Nenhuma meta ativa</p>
                <p className="text-xs text-muted-foreground">
                  Defina uma meta para acompanhar a performance.
                </p>
              </div>
              <Button size="sm" variant="glow" onClick={() => setGoalDialog(true)}>
                <Plus className="w-3.5 h-3.5 mr-1.5" />
                Definir meta
              </Button>
            </section>
          )}

          {/* SECTION 2: SNAPSHOT CARDS */}
          <section className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <StatCard
              icon={<Users className="w-3.5 h-3.5" />}
              label="Leads"
              value={stats.leads}
            />
            <StatCard
              icon={<TrendingUp className="w-3.5 h-3.5" />}
              label="Conversões"
              value={stats.conversions}
            />
            <StatCard
              icon={<MessageSquare className="w-3.5 h-3.5" />}
              label="Mensagens"
              value={stats.messages}
            />
            <StatCard
              icon={<DollarSign className="w-3.5 h-3.5" />}
              label="Valor"
              value={fmtBRL(stats.value)}
            />
          </section>

          {/* SECTION 3: LEADS POR STATUS */}
          <section className="space-y-3">
            <h4 className="text-sm font-semibold">Leads por status</h4>

            {Object.keys(leadsByStatus).length === 0 ? (
              <div className="rounded-md border border-border bg-card/40 p-4 text-center text-xs text-muted-foreground">
                Nenhum lead atribuído ainda.
              </div>
            ) : (
              <>
                <div className="rounded-md border border-border overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-muted/40 hover:bg-muted/40">
                        <TableHead className="h-9 text-[11px] uppercase tracking-wider">
                          Status
                        </TableHead>
                        <TableHead className="h-9 text-[11px] uppercase tracking-wider text-right">
                          Qtd
                        </TableHead>
                        <TableHead className="h-9 w-16" />
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {Object.entries(leadsByStatus).map(([s, count]) => (
                        <TableRow key={s}>
                          <TableCell className="py-2">
                            <Badge
                              variant="outline"
                              className={`${statusBadgeClass[s] ?? ''} text-[10px] px-1.5 py-0 h-5`}
                            >
                              {statusLabels[s] || s}
                            </Badge>
                          </TableCell>
                          <TableCell className="py-2 text-right font-semibold tabular-nums">
                            {count as number}
                          </TableCell>
                          <TableCell className="py-2 text-right">
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-7 px-2 text-xs"
                              onClick={() => handleViewLeads(s)}
                            >
                              Ver
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    className="flex-1"
                    onClick={() => handleViewLeads()}
                  >
                    Ver todos
                  </Button>
                </div>
              </>
            )}
          </section>

          {/* SECTION 4: INFORMAÇÕES DO USUÁRIO */}
          <Collapsible open={infoOpen} onOpenChange={setInfoOpen}>
            <CollapsibleTrigger asChild>
              <button
                type="button"
                className="w-full flex items-center justify-between rounded-md border border-border bg-card/40 px-3 py-2.5 hover:bg-card/60 transition-colors"
                aria-expanded={infoOpen}
              >
                <span className="text-sm font-medium">Informações do usuário</span>
                <ChevronDown
                  className={`w-4 h-4 text-muted-foreground transition-transform ${infoOpen ? 'rotate-180' : ''}`}
                />
              </button>
            </CollapsibleTrigger>
            <CollapsibleContent className="overflow-hidden data-[state=open]:animate-accordion-down data-[state=closed]:animate-accordion-up">
              <div className="px-3 pt-3 space-y-3 pb-3">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label className="text-xs">Nome completo</Label>
                    <Input
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Telefone</Label>
                    <Input
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      placeholder="+55 11 99999-9999"
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs">E-mail</Label>
                  <Input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    disabled={!canEditEmail}
                  />
                  {!canEditEmail && (
                    <p className="text-[11px] text-muted-foreground">
                      Apenas administradores podem alterar o e-mail.
                    </p>
                  )}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label className="text-xs">Função</Label>
                    {canChangeRole ? (
                      <Select
                        value={roleValue}
                        onValueChange={(v) => {
                          const next = v as 'admin' | 'gestor' | 'financeiro' | 'agente';
                          setRoleValue(next);
                          updateRole.mutate({ memberId: member.id, newRole: next });
                        }}
                        disabled={updateRole.isPending}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="agente">Agente</SelectItem>
                          <SelectItem value="gestor">Gestor</SelectItem>
                          <SelectItem value="financeiro">Financeiro</SelectItem>
                          <SelectItem value="admin">Admin</SelectItem>
                        </SelectContent>
                      </Select>
                    ) : (
                      <Input value={role.label} disabled />
                    )}
                  </div>

                  <div className="space-y-1.5">
                    <Label className="text-xs">Status do acesso</Label>
                    <div className="flex items-center justify-between rounded-md border border-border bg-card/40 px-3 h-10">
                      <span
                        className={`text-sm font-medium ${isActive ? 'text-emerald-400' : 'text-destructive'}`}
                      >
                        {isActive ? 'Ativo' : 'Desativado'}
                      </span>
                      <Switch
                        checked={isActive}
                        disabled={!canToggleActive || toggleActive.isPending}
                        onCheckedChange={(v) =>
                          toggleActive.mutate({ userId: member.id, isActive: v })
                        }
                        className="data-[state=unchecked]:bg-muted border border-border"
                      />
                    </div>
                  </div>
                </div>

                <div className="flex justify-end pt-1">
                  <Button
                    size="sm"
                    variant="glow"
                    onClick={saveInfo}
                    disabled={!anyDirty || savingInfo}
                  >
                    {savingInfo && <Loader2 className="w-3.5 h-3.5 mr-2 animate-spin" />}
                    Salvar alterações
                  </Button>
                </div>
              </div>
            </CollapsibleContent>
          </Collapsible>

          {/* SECTION 5: CANAIS */}
          <Collapsible open={channelsOpen} onOpenChange={setChannelsOpen}>
            <CollapsibleTrigger asChild>
              <button
                type="button"
                className="w-full flex items-center justify-between rounded-md border border-border bg-card/40 px-3 py-2.5 hover:bg-card/60 transition-colors"
                aria-expanded={channelsOpen}
              >
                <span className="text-sm font-medium">
                  Canais
                  <span className="ml-2 text-xs text-muted-foreground">
                    ({instances.length})
                  </span>
                </span>
                <ChevronDown
                  className={`w-4 h-4 text-muted-foreground transition-transform ${channelsOpen ? 'rotate-180' : ''}`}
                />
              </button>
            </CollapsibleTrigger>
            <CollapsibleContent className="overflow-hidden data-[state=open]:animate-accordion-down data-[state=closed]:animate-accordion-up">
              <div className="px-3 pt-3 pb-2">
                {instances.length === 0 ? (
                  <p className="text-xs text-muted-foreground py-2">
                    Nenhum canal ativo.
                  </p>
                ) : (
                  <>
                    <p className="text-[11px] text-muted-foreground mb-2">
                      Canais sem vínculos ficam abertos a todos os usuários.
                    </p>
                    {instances.map((inst: any, i: number) => {
                      const linked = linkedSet.has(inst.id);
                      return (
                        <div
                          key={inst.id}
                          className={`flex items-center justify-between gap-3 py-2 ${i < instances.length - 1 ? 'border-b border-border' : ''}`}
                        >
                          <div className="min-w-0">
                            <p className="text-sm truncate">{inst.instance_name}</p>
                            <p className="text-[11px] text-muted-foreground truncate">
                              {inst.phone_number || inst.provider}
                              {' · '}
                              {linked ? 'vinculado' : 'aberto a todos'}
                            </p>
                          </div>
                          <Switch
                            checked={linked}
                            disabled={!isAdmin || toggleChannel.isPending}
                            onCheckedChange={(v) =>
                              toggleChannel.mutate({
                                instance_id: inst.id,
                                user_id: member.id,
                                enabled: v,
                              })
                            }
                            className="data-[state=unchecked]:bg-muted border border-border shrink-0"
                          />
                        </div>
                      );
                    })}
                  </>
                )}
              </div>
            </CollapsibleContent>
          </Collapsible>
          </div>
        </div>
      </SheetContent>

      <SetGoalDialog
        open={goalDialog}
        onOpenChange={setGoalDialog}
        member={{ id: member.id, name: member.name, email: member.email }}
      />
      {editingGoal && (
        <EditGoalDialog
          open={!!editingGoal}
          onOpenChange={(o) => !o && setEditingGoal(null)}
          goal={editingGoal}
        />
      )}
    </Sheet>
  );
}

function StatCard({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: number | string;
}) {
  return (
    <div className="group rounded-lg border border-border bg-card/40 p-3 transition-all hover:border-primary/50 hover:bg-card/60">
      <div className="flex items-center gap-1.5 text-muted-foreground mb-1">
        {icon}
        <span className="text-[10px] uppercase tracking-wider font-medium">
          {label}
        </span>
      </div>
      <p className="text-lg sm:text-xl font-bold tabular-nums truncate">{value}</p>
    </div>
  );
}
