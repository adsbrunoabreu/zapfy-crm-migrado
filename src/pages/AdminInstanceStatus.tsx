import { PageShell } from '@/components/layout/PageShell';
import { useState, useMemo, useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { Activity, RefreshCw, Search, ArrowDownCircle, ArrowUpCircle, X, Building2, AlertTriangle, CheckCircle2, AlertCircle, Unlink } from 'lucide-react';
import { formatDistanceToNow, format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { KpiCard } from '@/components/ui/KpiCard';
import { Card } from '@/components/ui/card';
import { SortableTableHead } from '@/components/ui/sortable-table-head';
import { useSortableData } from '@/hooks/useSortableData';

interface Instance {
  instance_name: string;
  display_name: string;
  state: string;
  scope: 'system' | 'company' | 'orphan';
  company_id: string | null;
  company_name: string;
  phone: string | null;
  profile_name: string | null;
  down_since: string | null;
  last_seen_at: string | null;
}

interface EventRow {
  id: string;
  instance_name: string;
  scope: string;
  company_id: string | null;
  event_type: string;
  previous_state: string | null;
  new_state: string | null;
  down_since: string | null;
  duration_seconds: number | null;
  metadata: any;
  created_at: string;
}

const isConnected = (s: string) => s === 'open' || s === 'connected';

const StateCell = ({ state }: { state: string }) => {
  const connected = isConnected(state);
  return (
    <div className="flex items-center gap-2">
      <span
        className={cn(
          'h-1.5 w-1.5 rounded-full',
          connected ? 'bg-[hsl(var(--emerald))]' : 'bg-[hsl(var(--rose))]'
        )}
      />
      <span className="text-sm text-foreground">
        {connected ? 'Conectado' : 'Desconectado'}
      </span>
    </div>
  );
};

const ScopeBadge = ({ scope }: { scope: string }) => {
  const map: Record<string, { label: string; cls: string }> = {
    system: { label: 'Sistema', cls: 'bg-[hsl(var(--cyan)/0.10)] text-[hsl(var(--cyan))] border-[hsl(var(--cyan)/0.30)]' },
    company: { label: 'Empresa', cls: 'bg-[hsl(var(--cyan)/0.10)] text-[hsl(var(--cyan))] border-[hsl(var(--cyan)/0.30)]' },
    orphan: { label: 'Sem vínculo', cls: 'bg-gray-100 text-gray-600 border-gray-200' },
  };
  const m = map[scope] || map.orphan;
  return (
    <Badge variant="outline" className={cn('text-xs font-normal', m.cls)}>
      {m.label}
    </Badge>
  );
};

const formatDuration = (seconds: number | null) => {
  if (!seconds || seconds < 0) return '—';
  if (seconds < 60) return `${seconds}s`;
  const min = Math.floor(seconds / 60);
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${h}h ${m}min`;
};

type StateFilter = 'all' | 'connected' | 'disconnected' | 'orphan';
type InstSortKey = 'display_name' | 'scope' | 'company_name' | 'state' | 'phone' | 'down_since';
type EventSortKey = 'created_at' | 'instance_name' | 'event_type' | 'company' | 'duration_seconds';

export default function AdminInstanceStatus() {
  const [search, setSearch] = useState('');
  const [stateFilter, setStateFilter] = useState<StateFilter>('all');
  const [scopeFilter, setScopeFilter] = useState<string>('all');
  const queryClient = useQueryClient();

  // Realtime: invalida instâncias e eventos assim que houver mudança
  // em whatsapp_instances, instance_health ou instance_events.
  useEffect(() => {
    const channel = supabase
      .channel('admin-instance-status-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'whatsapp_instances' }, () => {
        queryClient.invalidateQueries({ queryKey: ['admin-instance-status'] });
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'instance_health' }, () => {
        queryClient.invalidateQueries({ queryKey: ['admin-instance-status'] });
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'instance_events' }, () => {
        queryClient.invalidateQueries({ queryKey: ['instance-events'] });
        queryClient.invalidateQueries({ queryKey: ['admin-instance-status'] });
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [queryClient]);

  const { data: instData, isLoading: loadingInst, refetch: refetchInst, isFetching } = useQuery({
    queryKey: ['admin-instance-status'],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke('list-all-instances');
      if (error) throw error;
      return (data?.instances || []) as Instance[];
    },
    refetchInterval: 30_000,
  });

  const { data: events, isLoading: loadingEvents, refetch: refetchEvents } = useQuery({
    queryKey: ['instance-events'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('instance_events')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(200);
      if (error) throw error;
      return (data || []) as EventRow[];
    },
    refetchInterval: 30_000,
  });

  // Erros recentes (24h) das integrações por instância
  const { data: integrationErrors } = useQuery({
    queryKey: ['admin-instance-integration-errors'],
    queryFn: async () => {
      const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      const { data, error } = await (supabase as any)
        .from('system_logs')
        .select('id, source, level, event, message, instance_name, company_id, created_at')
        .eq('level', 'error')
        .in('source', ['evolution-proxy', 'evolution-webhook', 'auto-reconnect', 'monitor-instance-health', 'dispatch_webhooks'])
        .gte('created_at', since)
        .order('created_at', { ascending: false })
        .limit(500);
      if (error) throw error;
      return (data || []) as Array<{
        id: string; source: string; level: string; event: string; message: string;
        instance_name: string | null; company_id: string | null; created_at: string;
      }>;
    },
    refetchInterval: 60_000,
  });

  const instances = instData || [];

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return instances.filter((i) => {
      if (q && !(
        i.instance_name.toLowerCase().includes(q) ||
        i.display_name.toLowerCase().includes(q) ||
        i.company_name.toLowerCase().includes(q)
      )) return false;
      if (stateFilter === 'connected' && !isConnected(i.state)) return false;
      if (stateFilter === 'disconnected' && isConnected(i.state)) return false;
      if (stateFilter === 'orphan' && i.scope !== 'orphan') return false;
      if (scopeFilter !== 'all' && i.scope !== scopeFilter) return false;
      return true;
    });
  }, [instances, search, stateFilter, scopeFilter]);

  const instAccessors = useMemo(() => ({
    display_name: (i: Instance) => i.display_name?.toLowerCase(),
    scope: (i: Instance) => i.scope,
    company_name: (i: Instance) => i.company_name?.toLowerCase(),
    state: (i: Instance) => (isConnected(i.state) ? 0 : 1),
    phone: (i: Instance) => i.phone || '',
    down_since: (i: Instance) => (i.down_since ? new Date(i.down_since) : null),
  }), []);
  const { sorted: sortedInstances, sort: instSort, toggle: toggleInst } =
    useSortableData<Instance, InstSortKey>(filtered, instAccessors, { key: 'down_since', direction: 'desc' });

  const total = instances.length;
  const connected = instances.filter((i) => isConnected(i.state)).length;
  const disconnected = total - connected;
  const orphans = instances.filter((i) => i.scope === 'orphan').length;

  const filteredEvents = events?.filter((e) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return e.instance_name.toLowerCase().includes(q);
  }) || [];

  const eventAccessors = useMemo(() => ({
    created_at: (e: EventRow) => new Date(e.created_at),
    instance_name: (e: EventRow) => e.instance_name?.toLowerCase(),
    event_type: (e: EventRow) => e.event_type,
    company: (e: EventRow) => (e.metadata?.company_name || '').toLowerCase(),
    duration_seconds: (e: EventRow) => e.duration_seconds ?? -1,
  }), []);
  const { sorted: sortedEvents, sort: evSort, toggle: toggleEv } =
    useSortableData<EventRow, EventSortKey>(filteredEvents, eventAccessors, { key: 'created_at', direction: 'desc' });

  // Agrupar instâncias por empresa + erros recentes por instância
  const errorsByInstance = useMemo(() => {
    const map = new Map<string, typeof integrationErrors>();
    (integrationErrors || []).forEach((e) => {
      const key = e.instance_name || '__unknown__';
      const arr = map.get(key) || [];
      arr.push(e);
      map.set(key, arr);
    });
    return map;
  }, [integrationErrors]);

  const groupedByCompany = useMemo(() => {
    const groups = new Map<string, { company_id: string | null; company_name: string; items: Instance[] }>();
    filtered.forEach((i) => {
      const key = i.company_id || `__${i.scope}__`;
      const g = groups.get(key) || { company_id: i.company_id, company_name: i.company_name, items: [] };
      g.items.push(i);
      groups.set(key, g);
    });
    return Array.from(groups.values()).sort((a, b) => a.company_name.localeCompare(b.company_name));
  }, [filtered]);

  const hasFilters = search || stateFilter !== 'all' || scopeFilter !== 'all';
  const clearFilters = () => {
    setSearch(''); setStateFilter('all'); setScopeFilter('all');
  };

  return (
    <PageShell
      title="Status das Instâncias"
      subtitle="Monitor em tempo real de todas as instâncias Evolution e histórico de quedas"
      actions={
        <Button
          variant="outline"
          size="sm"
          onClick={() => { refetchInst(); refetchEvents(); }}
          disabled={isFetching}
        >
          <RefreshCw className={cn('h-3.5 w-3.5 mr-2', isFetching && 'animate-spin')} />
          Atualizar
        </Button>
      }
    >

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {([
          { key: 'all' as StateFilter, label: 'Total', value: total, icon: Activity, tone: 'muted' as const },
          { key: 'connected' as StateFilter, label: 'Conectadas', value: connected, icon: CheckCircle2, tone: 'emerald' as const },
          { key: 'disconnected' as StateFilter, label: 'Desconectadas', value: disconnected, icon: AlertCircle, tone: disconnected ? ('rose' as const) : ('muted' as const) },
          { key: 'orphan' as StateFilter, label: 'Sem vínculo', value: orphans, icon: Unlink, tone: orphans ? ('amber' as const) : ('muted' as const) },
        ]).map((kpi) => (
          <KpiCard
            key={kpi.key}
            label={kpi.label}
            value={kpi.value}
            icon={kpi.icon}
            tone={kpi.tone}
            active={stateFilter === kpi.key}
            onClick={() => setStateFilter(kpi.key)}
          />
        ))}
      </div>

      {/* Barra de filtros */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[240px] max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            placeholder="Buscar por instância ou empresa..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 h-9 text-sm"
          />
        </div>
        <Select value={stateFilter} onValueChange={(v) => setStateFilter(v as StateFilter)}>
          <SelectTrigger className="w-[180px] h-9 text-sm"><SelectValue placeholder="Estado" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos os estados</SelectItem>
            <SelectItem value="connected">Conectadas</SelectItem>
            <SelectItem value="disconnected">Desconectadas</SelectItem>
            <SelectItem value="orphan">Sem vínculo</SelectItem>
          </SelectContent>
        </Select>
        <Select value={scopeFilter} onValueChange={setScopeFilter}>
          <SelectTrigger className="w-[170px] h-9 text-sm"><SelectValue placeholder="Escopo" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos os escopos</SelectItem>
            <SelectItem value="system">Sistema</SelectItem>
            <SelectItem value="company">Empresa</SelectItem>
            <SelectItem value="orphan">Sem vínculo</SelectItem>
          </SelectContent>
        </Select>
        {hasFilters && (
          <Button variant="ghost" size="sm" onClick={clearFilters}>
            <X className="h-4 w-4 mr-1" /> Limpar
          </Button>
        )}
      </div>

      <Tabs defaultValue="instances">
        <TabsList className="bg-transparent border-b border-border rounded-none p-0 h-auto w-full justify-start gap-6">
          <TabsTrigger
            value="instances"
            className="bg-transparent rounded-none border-b-2 border-transparent data-[state=active]:border-foreground data-[state=active]:text-foreground data-[state=active]:font-medium data-[state=active]:shadow-none text-muted-foreground px-0 pb-2 pt-0 hover:text-foreground transition-colors"
          >
            Instâncias <span className="text-xs text-muted-foreground ml-1">({filtered.length})</span>
          </TabsTrigger>
          <TabsTrigger
            value="by-company"
            className="bg-transparent rounded-none border-b-2 border-transparent data-[state=active]:border-foreground data-[state=active]:text-foreground data-[state=active]:font-medium data-[state=active]:shadow-none text-muted-foreground px-0 pb-2 pt-0 hover:text-foreground transition-colors"
          >
            Por empresa
          </TabsTrigger>
          <TabsTrigger
            value="events"
            className="bg-transparent rounded-none border-b-2 border-transparent data-[state=active]:border-foreground data-[state=active]:text-foreground data-[state=active]:font-medium data-[state=active]:shadow-none text-muted-foreground px-0 pb-2 pt-0 hover:text-foreground transition-colors"
          >
            Histórico de eventos <span className="text-xs text-muted-foreground ml-1">({filteredEvents.length})</span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="instances" className="mt-4">
          <Card className="glass-card overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow className="border-b border-border hover:bg-transparent">
                  <SortableTableHead label="Instância" sortKey="display_name" active={instSort.key === 'display_name'} direction={instSort.direction} onSort={(k) => toggleInst(k as InstSortKey)} />
                  <SortableTableHead label="Escopo" sortKey="scope" active={instSort.key === 'scope'} direction={instSort.direction} onSort={(k) => toggleInst(k as InstSortKey)} />
                  <SortableTableHead label="Empresa" sortKey="company_name" active={instSort.key === 'company_name'} direction={instSort.direction} onSort={(k) => toggleInst(k as InstSortKey)} />
                  <SortableTableHead label="Estado" sortKey="state" active={instSort.key === 'state'} direction={instSort.direction} onSort={(k) => toggleInst(k as InstSortKey)} />
                  <SortableTableHead label="Telefone" sortKey="phone" active={instSort.key === 'phone'} direction={instSort.direction} onSort={(k) => toggleInst(k as InstSortKey)} />
                  <SortableTableHead label="Offline há" sortKey="down_since" active={instSort.key === 'down_since'} direction={instSort.direction} onSort={(k) => toggleInst(k as InstSortKey)} />
                </TableRow>
              </TableHeader>
              <TableBody className="divide-y divide-border">
                {loadingInst ? (
                  <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-8">Carregando...</TableCell></TableRow>
                ) : sortedInstances.length === 0 ? (
                  <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-8">Nenhuma instância encontrada</TableCell></TableRow>
                ) : (
                  sortedInstances.map((i) => (
                    <TableRow key={i.instance_name} className="border-0 hover:bg-muted/40 transition-colors">
                      <TableCell className="font-medium text-foreground">{i.display_name}</TableCell>
                      <TableCell><ScopeBadge scope={i.scope} /></TableCell>
                      <TableCell className="text-sm text-muted-foreground">{i.company_name}</TableCell>
                      <TableCell><StateCell state={i.state} /></TableCell>
                      <TableCell className="text-sm text-muted-foreground font-mono">
                        {i.phone ? i.phone.split('@')[0] : '—'}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {i.down_since
                          ? formatDistanceToNow(new Date(i.down_since), { locale: ptBR, addSuffix: false })
                          : '—'}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </Card>
        </TabsContent>

        <TabsContent value="by-company" className="mt-4">
          <p className="text-xs text-muted-foreground mb-3">
            Instâncias agrupadas por empresa, com último heartbeat e erros das últimas 24h por integração.
          </p>
          {loadingInst ? (
            <div className="text-center text-muted-foreground py-8 text-sm">Carregando...</div>
          ) : groupedByCompany.length === 0 ? (
            <div className="text-center text-muted-foreground py-8 text-sm">Nenhum resultado</div>
          ) : (
            <Accordion type="multiple" className="space-y-2">
              {groupedByCompany.map((g) => {
                const downCount = g.items.filter((i) => !isConnected(i.state)).length;
                const errCount = g.items.reduce(
                  (acc, i) => acc + (errorsByInstance.get(i.instance_name)?.length || 0),
                  0,
                );
                const key = g.company_id || g.company_name;
                return (
                  <AccordionItem key={key} value={key} className="border border-border rounded-md bg-card px-3">
                    <AccordionTrigger className="hover:no-underline py-3">
                      <div className="flex items-center gap-3 flex-1 min-w-0">
                        <Building2 className="h-4 w-4 text-muted-foreground shrink-0" />
                        <span className="text-sm font-medium text-foreground truncate">{g.company_name}</span>
                        <Badge variant="outline" className="text-[10px] font-normal">
                          {g.items.length} {g.items.length === 1 ? 'instância' : 'instâncias'}
                        </Badge>
                        {downCount > 0 && (
                          <Badge variant="outline" className="text-[10px] font-normal bg-[hsl(var(--rose)/0.10)] text-[hsl(var(--rose))] border-[hsl(var(--rose)/0.30)]">
                            {downCount} offline
                          </Badge>
                        )}
                        {errCount > 0 && (
                          <Badge variant="outline" className="text-[10px] font-normal bg-[hsl(var(--amber)/0.10)] text-[hsl(var(--amber))] border-[hsl(var(--amber)/0.30)] gap-1">
                            <AlertTriangle className="h-3 w-3" />
                            {errCount} erro{errCount === 1 ? '' : 's'} 24h
                          </Badge>
                        )}
                      </div>
                    </AccordionTrigger>
                    <AccordionContent className="pb-3">
                      <div className="space-y-3">
                        {g.items.map((i) => {
                          const errs = errorsByInstance.get(i.instance_name) || [];
                          return (
                            <div key={i.instance_name} className="border border-border rounded-md p-3 bg-background/40">
                              <div className="flex items-center justify-between gap-2 flex-wrap">
                                <div className="min-w-0">
                                  <div className="text-sm font-medium text-foreground truncate">{i.display_name}</div>
                                  <div className="text-xs text-muted-foreground font-mono truncate">{i.instance_name}</div>
                                </div>
                                <StateCell state={i.state} />
                              </div>
                              <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mt-3 text-xs">
                                <div>
                                  <div className="text-muted-foreground">Telefone</div>
                                  <div className="text-foreground font-mono">{i.phone ? i.phone.split('@')[0] : '—'}</div>
                                </div>
                                <div>
                                  <div className="text-muted-foreground">Último heartbeat</div>
                                  <div className="text-foreground">
                                    {i.last_seen_at
                                      ? formatDistanceToNow(new Date(i.last_seen_at), { locale: ptBR, addSuffix: true })
                                      : '—'}
                                  </div>
                                </div>
                                <div>
                                  <div className="text-muted-foreground">Offline há</div>
                                  <div className="text-foreground">
                                    {i.down_since
                                      ? formatDistanceToNow(new Date(i.down_since), { locale: ptBR, addSuffix: false })
                                      : '—'}
                                  </div>
                                </div>
                              </div>
                              {errs.length > 0 && (
                                <div className="mt-3 border-t border-border pt-2">
                                  <div className="text-[11px] uppercase tracking-wider text-muted-foreground mb-1.5">
                                    Erros recentes ({errs.length})
                                  </div>
                                  <ul className="space-y-1.5 max-h-48 overflow-y-auto">
                                    {errs.slice(0, 10).map((e) => (
                                      <li key={e.id} className="flex items-start gap-2 text-xs">
                                        <span className="h-1.5 w-1.5 rounded-full bg-[hsl(var(--rose))] mt-1.5 shrink-0" />
                                        <div className="flex-1 min-w-0">
                                          <div className="flex items-center gap-2 flex-wrap">
                                            <span className="text-foreground font-medium truncate">{e.event}</span>
                                            <span className="text-[10px] uppercase tracking-wider text-muted-foreground">{e.source}</span>
                                          </div>
                                          {e.message && (
                                            <p className="text-muted-foreground line-clamp-2">{e.message}</p>
                                          )}
                                        </div>
                                        <span className="text-[10px] text-muted-foreground whitespace-nowrap">
                                          {formatDistanceToNow(new Date(e.created_at), { locale: ptBR, addSuffix: true })}
                                        </span>
                                      </li>
                                    ))}
                                  </ul>
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </AccordionContent>
                  </AccordionItem>
                );
              })}
            </Accordion>
          )}
        </TabsContent>

        <TabsContent value="events" className="mt-4">
          <p className="text-xs text-muted-foreground mb-3">
            Últimas 200 ocorrências de queda e reconexão
          </p>
          <Card className="glass-card overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow className="border-b border-border hover:bg-transparent">
                  <SortableTableHead label="Quando" sortKey="created_at" active={evSort.key === 'created_at'} direction={evSort.direction} onSort={(k) => toggleEv(k as EventSortKey)} />
                  <SortableTableHead label="Instância" sortKey="instance_name" active={evSort.key === 'instance_name'} direction={evSort.direction} onSort={(k) => toggleEv(k as EventSortKey)} />
                  <SortableTableHead label="Evento" sortKey="event_type" active={evSort.key === 'event_type'} direction={evSort.direction} onSort={(k) => toggleEv(k as EventSortKey)} />
                  <TableHead className="text-xs font-medium text-muted-foreground normal-case">Transição</TableHead>
                  <SortableTableHead label="Empresa" sortKey="company" active={evSort.key === 'company'} direction={evSort.direction} onSort={(k) => toggleEv(k as EventSortKey)} />
                  <SortableTableHead label="Duração offline" sortKey="duration_seconds" active={evSort.key === 'duration_seconds'} direction={evSort.direction} onSort={(k) => toggleEv(k as EventSortKey)} />
                </TableRow>
              </TableHeader>
              <TableBody className="divide-y divide-border">
                {loadingEvents ? (
                  <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-8">Carregando...</TableCell></TableRow>
                ) : sortedEvents.length === 0 ? (
                  <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-8">Nenhum evento registrado ainda</TableCell></TableRow>
                ) : (
                  sortedEvents.map((e) => (
                    <TableRow key={e.id} className="border-0 hover:bg-muted/40 transition-colors">
                      <TableCell className="text-sm whitespace-nowrap">
                        <div className="text-foreground">{format(new Date(e.created_at), "dd/MM/yyyy HH:mm:ss", { locale: ptBR })}</div>
                        <div className="text-xs text-muted-foreground">
                          {formatDistanceToNow(new Date(e.created_at), { locale: ptBR, addSuffix: true })}
                        </div>
                      </TableCell>
                      <TableCell className="font-mono text-xs text-muted-foreground">{e.instance_name}</TableCell>
                      <TableCell>
                        {e.event_type === 'disconnected' ? (
                          <Badge variant="outline" className="text-xs font-normal bg-[hsl(var(--rose)/0.10)] text-[hsl(var(--rose))] border-[hsl(var(--rose)/0.30)] gap-1">
                            <ArrowDownCircle className="h-3 w-3" /> Desconexão
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="text-xs font-normal bg-[hsl(var(--emerald)/0.10)] text-[hsl(var(--emerald))] border-[hsl(var(--emerald)/0.30)] gap-1">
                            <ArrowUpCircle className="h-3 w-3" /> Reconexão
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground font-mono">
                        {e.previous_state || '?'} → {e.new_state || '?'}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">{e.metadata?.company_name || '—'}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {e.event_type === 'reconnected' ? formatDuration(e.duration_seconds) : '—'}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </Card>
        </TabsContent>
      </Tabs>
    </PageShell>
  );
}
