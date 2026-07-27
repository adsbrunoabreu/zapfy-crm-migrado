import { useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHeader, TableRow } from '@/components/ui/table';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { ScrollArea } from '@/components/ui/scroll-area';

import { useToast } from '@/hooks/use-toast';
import { useSortableData } from '@/hooks/useSortableData';
import { SortableTableHead } from '@/components/ui/sortable-table-head';
import { Link } from 'react-router-dom';
import {
  RefreshCw, Search, CheckCircle2, Clock, XCircle, Calendar, MessageSquare,
  Pause, RotateCcw, Loader2, Mail, Phone, Building2, User,
} from 'lucide-react';
import { formatDistanceToNow, format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

type LeadStatus = 'all' | 'qualified' | 'pending' | 'not_qualified' | 'converted';
type Period = 'today' | '7d' | '30d';

interface AiStateRow {
  id: string;
  conversation_id: string;
  status: string;
  manual_status: string | null;
  collected_data: Record<string, any>;
  turn_count: number;
  last_run_at: string | null;
  pending_since: string | null;
  paused_until: string | null;
  handoff_reason: string | null;
  created_at: string;
  updated_at: string;
  conversation?: { id: string; contact_name: string | null; phone: string; instance_name: string; last_message_at: string | null; lead_id: string | null; } | null;
  appointment?: { id: string; start_at: string; status: string; } | null;
}

const PERIOD_DAYS: Record<Period, number | null> = { today: 1, '7d': 7, '30d': 30 };

function effectiveStatus(row: AiStateRow): 'qualified' | 'pending' | 'not_qualified' | 'converted' {
  if (row.manual_status) return row.manual_status as any;
  if (row.status === 'handoff' || row.status === 'qualified') return 'qualified';
  if (row.status === 'abandoned' || row.status === 'closed') return 'not_qualified';
  return 'pending';
}

const STATUS_BADGE: Record<string, { label: string; cls: string; Icon: any }> = {
  qualified: { label: 'Qualificado', cls: 'bg-emerald/10 text-emerald border-emerald/20', Icon: CheckCircle2 },
  pending: { label: 'Aguardando', cls: 'bg-amber/10 text-amber border-amber/20', Icon: Clock },
  not_qualified: { label: 'Não qualificado', cls: 'bg-rose/10 text-rose border-rose/20', Icon: XCircle },
  converted: { label: 'Convertido', cls: 'bg-cyan/10 text-cyan border-cyan/20', Icon: CheckCircle2 },
};

export default function QualifiedLeadsPanel() {
  const { profile } = useAuth();
  const companyId = profile?.company_id;
  const qc = useQueryClient();
  const { toast } = useToast();

  const [statusFilter, setStatusFilter] = useState<LeadStatus>('all');
  const [period, setPeriod] = useState<Period>('30d');
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const sinceISO = useMemo(() => {
    const days = PERIOD_DAYS[period];
    if (!days) return null;
    const d = new Date(); d.setDate(d.getDate() - days); return d.toISOString();
  }, [period]);

  const { data, isLoading, isFetching, refetch } = useQuery({
    queryKey: ['qualified-leads', companyId, sinceISO],
    enabled: !!companyId,
    staleTime: 1000 * 60 * 2,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('conversation_ai_state')
        .select('id, conversation_id, status, manual_status, collected_data, turn_count, last_run_at, pending_since, paused_until, handoff_reason, created_at, updated_at, conversations!inner(id, contact_name, phone, instance_name, last_message_at, lead_id)')
        .eq('company_id', companyId!)
        .gte('updated_at', sinceISO ?? '1970-01-01')
        .order('updated_at', { ascending: false })
        .limit(500);
      if (error) throw error;
      const rows = (data ?? []).map((r: any) => ({ ...r, conversation: r.conversations })) as AiStateRow[];
      const leadIds = Array.from(new Set(rows.map((r) => r.conversation?.lead_id).filter(Boolean))) as string[];
      const apptMap = new Map<string, AiStateRow['appointment']>();
      if (leadIds.length) {
        const { data: appts } = await supabase
          .from('appointments').select('id, lead_id, start_at, status')
          .eq('company_id', companyId!).in('lead_id', leadIds)
          .order('start_at', { ascending: false }).limit(1000);
        for (const a of (appts ?? [])) {
          if (a.lead_id && !apptMap.has(a.lead_id)) apptMap.set(a.lead_id, a as any);
        }
      }
      for (const r of rows) {
        const lid = r.conversation?.lead_id;
        if (lid) r.appointment = apptMap.get(lid) ?? null;
      }
      return rows;
    },
  });

  const filtered = useMemo(() => {
    let list = data ?? [];
    if (statusFilter !== 'all') list = list.filter((r) => effectiveStatus(r) === statusFilter);
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter((r) => {
        const cd = r.collected_data || {};
        return [r.conversation?.contact_name, r.conversation?.phone, cd.nome, cd.empresa, cd.email, cd.telefone, cd.pain_point]
          .some((v) => v && String(v).toLowerCase().includes(q));
      });
    }
    return list;
  }, [data, statusFilter, search]);

  type SortKey = 'lead' | 'company' | 'pain' | 'appointment' | 'status' | 'updated';
  const accessors = useMemo(() => ({
    lead: (r: AiStateRow) => (r.conversation?.contact_name || r.collected_data?.nome || r.conversation?.phone || '').toLowerCase(),
    company: (r: AiStateRow) => String(r.collected_data?.empresa || '').toLowerCase(),
    pain: (r: AiStateRow) => String(r.collected_data?.pain_point || r.collected_data?.necessidade || '').toLowerCase(),
    appointment: (r: AiStateRow) => r.appointment?.start_at ? new Date(r.appointment.start_at) : null,
    status: (r: AiStateRow) => effectiveStatus(r),
    updated: (r: AiStateRow) => new Date(r.updated_at),
  }), []);
  const { sorted, sort, toggle } = useSortableData<AiStateRow, SortKey>(filtered, accessors, { key: 'updated', direction: 'desc' });

  const stats = useMemo(() => {
    const all = data ?? [];
    const week = new Date(); week.setDate(week.getDate() - 7);
    const recent = all.filter((r) => new Date(r.updated_at) >= week);
    const qualified = recent.filter((r) => effectiveStatus(r) === 'qualified').length;
    const apptList = recent.filter((r) => r.appointment);
    const confirmed = apptList.filter((r) => r.appointment?.status === 'confirmed' || r.appointment?.status === 'completed').length;
    const total = recent.length;
    return {
      total, qualified,
      qualifiedPct: total ? Math.round((qualified / total) * 100) : 0,
      appointments: apptList.length, confirmed,
      conversion: total ? Math.round((confirmed / total) * 100) : 0,
      openConversations: all.filter((r) => effectiveStatus(r) === 'pending').length,
    };
  }, [data]);

  const updateStatus = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string | null }) => {
      const { error } = await supabase.from('conversation_ai_state').update({
        manual_status: status,
        manual_status_set_at: status ? new Date().toISOString() : null,
        manual_status_set_by: status ? profile?.id ?? null : null,
      }).eq('id', id).eq('company_id', companyId!);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['qualified-leads'] }); toast({ title: 'Atualizado' }); },
    onError: (e: any) => toast({ title: 'Erro', description: e.message, variant: 'destructive' }),
  });

  const pauseAi = useMutation({
    mutationFn: async ({ id, hours }: { id: string; hours: number | null }) => {
      const until = hours ? new Date(Date.now() + hours * 3600_000).toISOString() : null;
      const { error } = await supabase.from('conversation_ai_state')
        .update({ paused_until: until }).eq('id', id).eq('company_id', companyId!);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['qualified-leads'] }); toast({ title: 'Pausa atualizada' }); },
    onError: (e: any) => toast({ title: 'Erro', description: e.message, variant: 'destructive' }),
  });

  const updateAppointment = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: 'cancelled' | 'completed' | 'confirmed' | 'in_progress' | 'no_show' | 'scheduled' }) => {
      const { error } = await supabase.from('appointments').update({ status })
        .eq('id', id).eq('company_id', companyId!);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['qualified-leads'] }); toast({ title: 'Agendamento atualizado' }); },
    onError: (e: any) => toast({ title: 'Erro', description: e.message, variant: 'destructive' }),
  });

  const selected = sorted.find((r) => r.id === selectedId) ?? null;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 flex-wrap">
        <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as LeadStatus)}>
          <SelectTrigger className="w-[180px] h-9"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos os status</SelectItem>
            <SelectItem value="qualified">Qualificado</SelectItem>
            <SelectItem value="pending">Aguardando</SelectItem>
            <SelectItem value="not_qualified">Não qualificado</SelectItem>
            <SelectItem value="converted">Convertido</SelectItem>
          </SelectContent>
        </Select>
        <Select value={period} onValueChange={(v) => setPeriod(v as Period)}>
          <SelectTrigger className="w-[140px] h-9"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="today">Hoje</SelectItem>
            <SelectItem value="7d">7 dias</SelectItem>
            <SelectItem value="30d">30 dias</SelectItem>
          </SelectContent>
        </Select>
        <div className="relative flex-1 min-w-[200px] max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por nome, empresa, telefone..." className="pl-9 h-9" />
        </div>
        <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching} className="ml-auto">
          <RefreshCw className={`h-4 w-4 mr-2 ${isFetching ? 'animate-spin' : ''}`} /> Atualizar
        </Button>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Kpi label="Leads Qualificados" value={stats.qualified} hint={`${stats.qualifiedPct}% do total`} Icon={CheckCircle2} />
        <Kpi label="Conversas Abertas" value={stats.openConversations} hint="aguardando resposta" Icon={MessageSquare} />
        <Kpi label="Agendamentos" value={stats.appointments} hint={`${stats.confirmed} confirmados`} Icon={Calendar} />
        <Kpi label="Taxa de conversão" value={`${stats.conversion}%`} hint={`${stats.total} leads / 7d`} Icon={CheckCircle2} />
      </div>

      <Card className="overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <SortableTableHead label="Lead" sortKey="lead" active={sort.key === 'lead'} direction={sort.direction} onSort={(k) => toggle(k as SortKey)} />
              <SortableTableHead label="Empresa" sortKey="company" active={sort.key === 'company'} direction={sort.direction} onSort={(k) => toggle(k as SortKey)} />
              <SortableTableHead label="Pain point" sortKey="pain" active={sort.key === 'pain'} direction={sort.direction} onSort={(k) => toggle(k as SortKey)} />
              <SortableTableHead label="Agendamento" sortKey="appointment" active={sort.key === 'appointment'} direction={sort.direction} onSort={(k) => toggle(k as SortKey)} />
              <SortableTableHead label="Status" sortKey="status" active={sort.key === 'status'} direction={sort.direction} onSort={(k) => toggle(k as SortKey)} />
              <SortableTableHead label="Atualizado" sortKey="updated" active={sort.key === 'updated'} direction={sort.direction} onSort={(k) => toggle(k as SortKey)} />
              <TableCell className="text-xs font-medium text-muted-foreground">Ações</TableCell>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow><TableCell colSpan={7} className="text-center py-12 text-muted-foreground">
                <Loader2 className="h-5 w-5 animate-spin inline mr-2" /> Carregando...
              </TableCell></TableRow>
            ) : sorted.length === 0 ? (
              <TableRow><TableCell colSpan={7} className="text-center py-12 text-muted-foreground">
                Nenhum lead encontrado para os filtros selecionados.
              </TableCell></TableRow>
            ) : (
              sorted.map((r) => {
                const cd = r.collected_data || {};
                const eff = effectiveStatus(r);
                const badge = STATUS_BADGE[eff];
                return (
                  <TableRow key={r.id} className="cursor-pointer" onClick={() => setSelectedId(r.id)}>
                    <TableCell className="font-medium">
                      {cd.nome || r.conversation?.contact_name || r.conversation?.phone || '—'}
                      <div className="text-xs text-muted-foreground">{r.conversation?.phone}</div>
                    </TableCell>
                    <TableCell className="text-sm">{cd.empresa || '—'}</TableCell>
                    <TableCell className="text-sm text-muted-foreground max-w-[260px] truncate">{cd.pain_point || cd.necessidade || '—'}</TableCell>
                    <TableCell className="text-sm">
                      {r.appointment ? format(new Date(r.appointment.start_at), "EEE HH'h'mm", { locale: ptBR }) : '—'}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className={badge.cls}>
                        <badge.Icon className="h-3 w-3 mr-1" />{badge.label}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {formatDistanceToNow(new Date(r.updated_at), { addSuffix: true, locale: ptBR })}
                    </TableCell>
                    <TableCell onClick={(e) => e.stopPropagation()}>
                      <div className="flex items-center gap-1">
                        <Button variant="ghost" size="sm" asChild>
                          <Link to={`/chat?conversation=${r.conversation_id}`}>
                            <MessageSquare className="h-3.5 w-3.5" />
                          </Link>
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => setSelectedId(r.id)}>Detalhes</Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </Card>

      <Sheet open={!!selected} onOpenChange={(o) => !o && setSelectedId(null)}>
        <SheetContent className="w-full sm:max-w-xl h-[100dvh] overflow-hidden p-0 flex flex-col">
          {selected && (
            <ScrollArea className="flex-1 min-h-0">
              <div className="p-6 space-y-6">
              <SheetHeader>
                <SheetTitle>{selected.collected_data?.nome || selected.conversation?.contact_name || 'Lead'}</SheetTitle>
                <SheetDescription>
                  Conversa atualizada {formatDistanceToNow(new Date(selected.updated_at), { addSuffix: true, locale: ptBR })}
                </SheetDescription>
              </SheetHeader>

              <Card className="p-4 space-y-2">
                <h3 className="text-xs font-medium text-muted-foreground uppercase">Lead</h3>
                <DetailRow Icon={User} label="Nome" value={selected.collected_data?.nome} />
                <DetailRow Icon={Building2} label="Empresa" value={selected.collected_data?.empresa} />
                <DetailRow Icon={Mail} label="Email" value={selected.collected_data?.email} />
                <DetailRow Icon={Phone} label="Telefone" value={selected.collected_data?.telefone || selected.conversation?.phone} />
                {selected.collected_data?.tamanho && <DetailRow label="Tamanho" value={selected.collected_data.tamanho} />}
                {selected.collected_data?.tech && <DetailRow label="Tecnologia" value={selected.collected_data.tech} />}
                {selected.collected_data?.orcamento && <DetailRow label="Orçamento" value={selected.collected_data.orcamento} />}
                {selected.collected_data?.urgencia && <DetailRow label="Urgência" value={selected.collected_data.urgencia} />}
                {selected.collected_data?.pain_point && (
                  <div className="pt-1">
                    <div className="text-xs text-muted-foreground mb-1">Pain point</div>
                    <p className="text-sm">{selected.collected_data.pain_point}</p>
                  </div>
                )}
              </Card>

              <Card className="p-4 space-y-3">
                <h3 className="text-xs font-medium text-muted-foreground uppercase">Agendamento</h3>
                {selected.appointment ? (
                  <>
                    <p className="text-sm">
                      <Calendar className="h-3.5 w-3.5 inline mr-2 text-muted-foreground" />
                      {format(new Date(selected.appointment.start_at), "EEEE, dd 'de' MMMM 'às' HH'h'mm", { locale: ptBR })}
                    </p>
                    <Badge variant="outline" className="capitalize">{selected.appointment.status}</Badge>
                    <div className="flex flex-wrap gap-2 pt-2">
                      <Button size="sm" onClick={() => updateAppointment.mutate({ id: selected.appointment!.id, status: 'confirmed' })}>Confirmar</Button>
                      <Button size="sm" variant="outline" asChild>
                        <Link to={`/schedules?appointment=${selected.appointment.id}`}>Reagendar</Link>
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => updateAppointment.mutate({ id: selected.appointment!.id, status: 'cancelled' })}>Cancelar</Button>
                    </div>
                  </>
                ) : (
                  <p className="text-sm text-muted-foreground">Nenhum agendamento criado para este lead.</p>
                )}
              </Card>

              <Card className="p-4 space-y-3">
                <h3 className="text-xs font-medium text-muted-foreground uppercase">Status</h3>
                <p className="text-xs text-muted-foreground">
                  {selected.manual_status
                    ? 'Status definido manualmente. Use "Limpar" para voltar ao automático.'
                    : 'Status automático segundo o agente IA. Você pode sobrescrever abaixo.'}
                </p>
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" variant="outline" onClick={() => updateStatus.mutate({ id: selected.id, status: 'converted' })}>
                    <CheckCircle2 className="h-3.5 w-3.5 mr-1.5" /> Venda confirmada
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => updateStatus.mutate({ id: selected.id, status: 'qualified' })}>Qualificado</Button>
                  <Button size="sm" variant="outline" onClick={() => updateStatus.mutate({ id: selected.id, status: 'not_qualified' })}>
                    <XCircle className="h-3.5 w-3.5 mr-1.5" /> Não qualificado
                  </Button>
                  {selected.manual_status && (
                    <Button size="sm" variant="ghost" onClick={() => updateStatus.mutate({ id: selected.id, status: null })}>
                      <RotateCcw className="h-3.5 w-3.5 mr-1.5" /> Limpar
                    </Button>
                  )}
                </div>
                <div className="flex flex-wrap gap-2 pt-2 border-t border-border/40">
                  <Button size="sm" variant="outline" onClick={() => pauseAi.mutate({ id: selected.id, hours: 24 })}>
                    <Pause className="h-3.5 w-3.5 mr-1.5" /> Pausar IA 24h
                  </Button>
                  {selected.paused_until && (
                    <Button size="sm" variant="ghost" onClick={() => pauseAi.mutate({ id: selected.id, hours: null })}>Retomar IA</Button>
                  )}
                  <Button size="sm" variant="outline" asChild>
                    <Link to={`/chat?conversation=${selected.conversation_id}`}>
                      <MessageSquare className="h-3.5 w-3.5 mr-1.5" /> Ver conversa
                    </Link>
                  </Button>
                </div>
              </Card>

              {selected.handoff_reason && (
                <Card className="p-4">
                  <h3 className="text-xs font-medium text-muted-foreground uppercase mb-2">Motivo do handoff</h3>
                  <p className="text-sm">{selected.handoff_reason}</p>
                </Card>
              )}
              </div>
            </ScrollArea>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}

function Kpi({ label, value, hint, Icon }: { label: string; value: number | string; hint?: string; Icon: any }) {
  return (
    <Card className="p-4">
      <div className="flex items-start justify-between">
        <div>
          <div className="text-xs text-muted-foreground">{label}</div>
          <div className="text-2xl font-semibold mt-1">{value}</div>
          {hint && <div className="text-xs text-muted-foreground mt-1">{hint}</div>}
        </div>
        <Icon className="h-4 w-4 text-muted-foreground" />
      </div>
    </Card>
  );
}

function DetailRow({ Icon, label, value }: { Icon?: any; label: string; value: any }) {
  if (!value) return null;
  return (
    <div className="flex items-start gap-2 text-sm">
      {Icon && <Icon className="h-3.5 w-3.5 text-muted-foreground mt-0.5" />}
      <span className="text-muted-foreground w-20 shrink-0">{label}:</span>
      <span className="text-foreground">{String(value)}</span>
    </div>
  );
}
