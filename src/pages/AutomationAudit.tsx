import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { format, formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import { Search, RefreshCw, Database, Cog, Send, AlertTriangle, Info, Bug, CheckCircle2, MessageSquare, ArrowRight, Inbox, Ghost, RotateCw, Wand2, Building2, Layers } from 'lucide-react';
import { PhantomAttemptsPanel } from '@/components/automation/PhantomAttemptsPanel';
import { ReplayDialog } from '@/components/automation/ReplayDialog';
import { SkipSuggestionsPanel } from '@/components/automation/SkipSuggestionsPanel';
import { BulkCancelDialog } from '@/components/automation/BulkCancelDialog';

type LogRow = {
  id: string;
  company_id: string | null;
  source: string;
  level: string;
  event: string;
  message: string;
  metadata: any;
  created_at: string;
};

type QueueRow = {
  id: string;
  conversation_id: string;
  message_kind: string;
  status: string;
  attempts: number;
  last_error: string | null;
  processed_at: string | null;
  created_at: string;
};

type SentRow = {
  id: string;
  conversation_id: string;
  message_kind: string;
  body: string | null;
  sent_at: string;
};

type ConvRow = {
  id: string;
  contact_name: string | null;
  phone: string;
  instance_name: string;
  lead_id: string | null;
  company_id: string;
  last_message_at: string | null;
};

const ORIGIN_META: Record<string, { label: string; icon: any; color: string; description: string }> = {
  'trigger:enqueue_attendance_auto_reply': {
    label: 'Trigger DB',
    icon: Database,
    color: 'text-sky-400 bg-sky-500/10 border-sky-500/30',
    description: 'Trigger Postgres em chat_messages — decide se enfileira a mensagem',
  },
  'edge_function:attendance-auto-reply': {
    label: 'Edge Function',
    icon: Cog,
    color: 'text-violet-400 bg-violet-500/10 border-violet-500/30',
    description: 'Função que entrega a mensagem ao WhatsApp via Evolution API',
  },
  'edge_function:process-attendance-queue': {
    label: 'Cron Worker',
    icon: Send,
    color: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30',
    description: 'Cron 1/min que pega itens pendentes da fila e chama o sender',
  },
};

const LEVEL_META: Record<string, { color: string; icon: any }> = {
  info: { color: 'text-sky-400 bg-sky-500/10 border-sky-500/20', icon: Info },
  warn: { color: 'text-amber-400 bg-amber-500/10 border-amber-500/20', icon: AlertTriangle },
  error: { color: 'text-rose-400 bg-rose-500/10 border-rose-500/20', icon: AlertTriangle },
  debug: { color: 'text-foreground bg-muted border-border', icon: Bug },
};

const KIND_LABEL: Record<string, string> = {
  off_hours: 'Fora do horário',
  welcome: 'Boas-vindas',
  wait_time: 'Tempo de espera',
  supervisor_alert: 'Alerta supervisor',
  rating: 'Avaliação',
};

function OriginBadge({ metadata }: { metadata: any }) {
  const origin = metadata?.origin ?? 'desconhecido';
  const meta = ORIGIN_META[origin] ?? { label: origin, icon: Cog, color: 'text-foreground bg-muted border-border', description: 'Origem desconhecida' };
  const Icon = meta.icon;
  return (
    <span className={cn('inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-[11px] border', meta.color)} title={meta.description}>
      <Icon className="w-3 h-3" /> {meta.label}
    </span>
  );
}

function LevelBadge({ level }: { level: string }) {
  const meta = LEVEL_META[level] ?? LEVEL_META.info;
  const Icon = meta.icon;
  return (
    <span className={cn('inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] uppercase tracking-wide border', meta.color)}>
      <Icon className="w-2.5 h-2.5" /> {level}
    </span>
  );
}

interface AutomationAuditProps { embedded?: boolean }
export default function AutomationAudit({ embedded = false }: AutomationAuditProps = {}) {
  const { profile, roles } = useAuth();
  const isMaster = roles.includes('master');
  const ownCompanyId = profile?.company_id ?? null;

  const [search, setSearch] = useState('');
  const [originFilter, setOriginFilter] = useState<string>('all');
  const [levelFilter, setLevelFilter] = useState<string>('all');
  // Master-only: 'all' = todas as empresas; uuid = uma empresa específica
  const [companyFilter, setCompanyFilter] = useState<string>(isMaster ? 'all' : (ownCompanyId ?? 'all'));
  const [selectedConv, setSelectedConv] = useState<string | null>(null);
  const [replayCtx, setReplayCtx] = useState<{ kind: 'off_hours' | 'welcome' | 'wait_time'; queueId: string | null } | null>(null);

  // Effective company id used to scope queries (null = sem filtro server-side, vê tudo via RLS)
  const effectiveCompanyId = isMaster
    ? (companyFilter === 'all' ? null : companyFilter)
    : ownCompanyId;

  // Lista de empresas (apenas Master)
  const companiesQuery = useQuery({
    queryKey: ['audit-companies-list'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('companies')
        .select('id, name, trade_name, plan_status')
        .order('name', { ascending: true })
        .limit(500);
      if (error) throw error;
      return data ?? [];
    },
    enabled: isMaster,
    staleTime: 120_000,
  });

  // Logs (system_logs source=attendance_auto)
  const logsQuery = useQuery({
    queryKey: ['automation-audit-logs', effectiveCompanyId, isMaster],
    queryFn: async () => {
      let q = supabase
        .from('system_logs')
        .select('id, company_id, source, level, event, message, metadata, created_at')
        .eq('source', 'attendance_auto')
        .order('created_at', { ascending: false })
        .limit(500);
      if (effectiveCompanyId) q = q.eq('company_id', effectiveCompanyId);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as LogRow[];
    },
    refetchInterval: 10_000,
  });

  // Conversation index for label resolution
  const conversationIds = useMemo(() => {
    const set = new Set<string>();
    (logsQuery.data ?? []).forEach(l => {
      const cid = l.metadata?.conversation_id;
      if (cid) set.add(cid);
    });
    return Array.from(set);
  }, [logsQuery.data]);

  const conversationsQuery = useQuery({
    queryKey: ['audit-conversations', conversationIds],
    queryFn: async () => {
      if (!conversationIds.length) return new Map<string, ConvRow>();
      const { data } = await supabase
        .from('conversations')
        .select('id, contact_name, phone, instance_name, lead_id, company_id, last_message_at')
        .in('id', conversationIds)
        .limit(500);
      return new Map((data ?? []).map(c => [c.id, c as ConvRow]));
    },
    enabled: conversationIds.length > 0,
    staleTime: 60_000,
  });

  const filteredLogs = useMemo(() => {
    const term = search.trim().toLowerCase();
    return (logsQuery.data ?? []).filter(l => {
      if (originFilter !== 'all' && (l.metadata?.origin ?? '') !== originFilter) return false;
      if (levelFilter !== 'all' && l.level !== levelFilter) return false;
      if (selectedConv && l.metadata?.conversation_id !== selectedConv) return false;
      // Filtro client-side adicional para Master quando seleciona uma empresa específica
      if (isMaster && companyFilter !== 'all' && l.company_id !== companyFilter) return false;
      if (!term) return true;
      const conv = conversationsQuery.data?.get(l.metadata?.conversation_id || '');
      const haystack = [
        l.message,
        l.event,
        JSON.stringify(l.metadata ?? {}),
        conv?.contact_name ?? '',
        conv?.phone ?? '',
      ].join(' ').toLowerCase();
      return haystack.includes(term);
    });
  }, [logsQuery.data, search, originFilter, levelFilter, selectedConv, conversationsQuery.data, isMaster, companyFilter]);

  // Group conversations from logs for the side picker
  const conversationsList = useMemo(() => {
    const map = new Map<string, { conv: ConvRow | undefined; company_id: string | null; count: number; lastEvent: string; lastAt: string; hasError: boolean }>();
    (logsQuery.data ?? []).forEach(l => {
      const cid = l.metadata?.conversation_id;
      if (!cid) return;
      // Filtro Master por empresa também afeta a lista lateral
      if (isMaster && companyFilter !== 'all' && l.company_id !== companyFilter) return;
      const cur = map.get(cid);
      const conv = conversationsQuery.data?.get(cid);
      if (cur) {
        cur.count += 1;
        if (l.level === 'error') cur.hasError = true;
      } else {
        map.set(cid, { conv, company_id: l.company_id, count: 1, lastEvent: l.event, lastAt: l.created_at, hasError: l.level === 'error' });
      }
    });
    return Array.from(map.entries()).sort(([, a], [, b]) => +new Date(b.lastAt) - +new Date(a.lastAt));
  }, [logsQuery.data, conversationsQuery.data, isMaster, companyFilter]);

  // Timeline for selected conversation: queue + sent + logs
  const conversationTimelineQuery = useQuery({
    queryKey: ['conv-timeline', selectedConv],
    queryFn: async () => {
      if (!selectedConv) return { queue: [] as QueueRow[], sent: [] as SentRow[] };
      const [{ data: queue }, { data: sent }] = await Promise.all([
        supabase
          .from('attendance_auto_message_queue')
          .select('id, conversation_id, message_kind, status, attempts, last_error, processed_at, created_at')
          .eq('conversation_id', selectedConv)
          .order('created_at', { ascending: false })
          .limit(50),
        supabase
          .from('attendance_auto_messages')
          .select('id, conversation_id, message_kind, body, sent_at')
          .eq('conversation_id', selectedConv)
          .order('sent_at', { ascending: false })
          .limit(50),
      ]);
      return { queue: (queue ?? []) as QueueRow[], sent: (sent ?? []) as SentRow[] };
    },
    enabled: !!selectedConv,
  });

  const stats = useMemo(() => {
    const all = logsQuery.data ?? [];
    // Aplica filtro de empresa Master para os KPIs também
    const rows = (isMaster && companyFilter !== 'all')
      ? all.filter(r => r.company_id === companyFilter)
      : all;
    return {
      total: rows.length,
      enqueued: rows.filter(r => r.event === 'enqueued').length,
      sent: rows.filter(r => r.event === 'sent').length,
      skipped: rows.filter(r => r.event === 'skipped').length,
      errors: rows.filter(r => r.level === 'error').length,
    };
  }, [logsQuery.data, isMaster, companyFilter]);

  // Agregação por empresa (apenas Master)
  const byCompanyStats = useMemo(() => {
    if (!isMaster) return [];
    const map = new Map<string, { company_id: string; total: number; sent: number; skipped: number; errors: number; lastAt: string }>();
    (logsQuery.data ?? []).forEach(l => {
      const cid = l.company_id ?? 'sem_empresa';
      const cur = map.get(cid) ?? { company_id: cid, total: 0, sent: 0, skipped: 0, errors: 0, lastAt: l.created_at };
      cur.total += 1;
      if (l.event === 'sent') cur.sent += 1;
      if (l.event === 'skipped') cur.skipped += 1;
      if (l.level === 'error') cur.errors += 1;
      if (new Date(l.created_at) > new Date(cur.lastAt)) cur.lastAt = l.created_at;
      map.set(cid, cur);
    });
    return Array.from(map.values()).sort((a, b) => b.total - a.total);
  }, [logsQuery.data, isMaster]);

  const companyName = (cid: string | null | undefined) => {
    if (!cid) return '—';
    const c = companiesQuery.data?.find((x: any) => x.id === cid);
    return c?.trade_name || c?.name || cid.slice(0, 8);
  };

  const refresh = () => { logsQuery.refetch(); if (selectedConv) conversationTimelineQuery.refetch(); };

  return (
    <div className={cn(embedded ? 'space-y-6' : 'p-6 space-y-6')}>
      <header className="flex flex-col md:flex-row md:items-end md:justify-between gap-4">
        {!embedded ? (
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-foreground">Auditoria de Mensagens Automáticas</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Veja qual <strong>fonte</strong> (trigger DB, cron worker ou edge function) decidiu disparar cada mensagem, e por quê.
            </p>
          </div>
        ) : <div />}
        <div className="flex items-center gap-2">
          {isMaster && (
            <Select value={companyFilter} onValueChange={(v) => { setCompanyFilter(v); setSelectedConv(null); }}>
              <SelectTrigger className="w-64">
                <Building2 className="w-4 h-4 mr-1.5 text-muted-foreground" />
                <SelectValue placeholder="Empresa" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">
                  <span className="inline-flex items-center gap-1.5">
                    <Layers className="w-3.5 h-3.5" /> Todas as empresas
                  </span>
                </SelectItem>
                {(companiesQuery.data ?? []).map((c: any) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.trade_name || c.name}
                    {c.plan_status && c.plan_status !== 'active' && (
                      <span className="ml-1.5 text-[10px] text-amber-400">({c.plan_status})</span>
                    )}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          <BulkCancelDialog
            defaultCompanyId={effectiveCompanyId}
            defaultConversationId={selectedConv}
            onCancelled={() => refresh()}
          />
          <Button variant="outline" size="sm" onClick={refresh} disabled={logsQuery.isFetching}>
            <RefreshCw className={cn('w-4 h-4 mr-2', logsQuery.isFetching && 'animate-spin')} />
            Atualizar
          </Button>
        </div>
      </header>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {[
          { label: 'Eventos', value: stats.total, color: 'text-foreground' },
          { label: 'Enfileiradas', value: stats.enqueued, color: 'text-sky-400' },
          { label: 'Enviadas', value: stats.sent, color: 'text-emerald-400' },
          { label: 'Bloqueadas', value: stats.skipped, color: 'text-amber-400' },
          { label: 'Erros', value: stats.errors, color: 'text-rose-400' },
        ].map(s => (
          <Card key={s.label} className="p-3 bg-background border-border">
            <p className="text-xs text-muted-foreground">{s.label}</p>
            <p className={cn('text-2xl font-semibold mt-1', s.color)}>{s.value}</p>
          </Card>
        ))}
      </div>

      {/* Master only: agrupamento por empresa */}
      {isMaster && companyFilter === 'all' && byCompanyStats.length > 0 && (
        <Card className="p-3 bg-background border-border">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-medium text-foreground flex items-center gap-1.5">
              <Layers className="w-4 h-4" /> Resumo por empresa ({byCompanyStats.length})
            </h3>
            <span className="text-[11px] text-muted-foreground">clique para filtrar</span>
          </div>
          <ScrollArea className="max-h-56">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
              {byCompanyStats.map(c => (
                <button
                  key={c.company_id}
                  onClick={() => { setCompanyFilter(c.company_id); setSelectedConv(null); }}
                  className="text-left border border-border hover:border-sky-500/50 hover:bg-sky-500/5 rounded p-2 transition-colors"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-medium text-foreground truncate">
                      {companyName(c.company_id)}
                    </span>
                    <span className="text-[10px] text-muted-foreground font-mono shrink-0">{c.total}</span>
                  </div>
                  <div className="flex items-center gap-3 mt-1.5 text-[10px]">
                    <span className="text-emerald-400">✓ {c.sent}</span>
                    <span className="text-amber-400">⊘ {c.skipped}</span>
                    <span className="text-rose-400">! {c.errors}</span>
                    <span className="ml-auto text-muted-foreground">
                      {formatDistanceToNow(new Date(c.lastAt), { locale: ptBR, addSuffix: true })}
                    </span>
                  </div>
                </button>
              ))}
            </div>
          </ScrollArea>
        </Card>
      )}


      <div className="grid grid-cols-1 lg:grid-cols-[300px_1fr] gap-4">
        {/* Side: conversations index */}
        <Card className="p-3 bg-background border-border">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-medium text-foreground flex items-center gap-1.5">
              <MessageSquare className="w-4 h-4" /> Conversas com eventos
            </h3>
            {selectedConv && (
              <Button variant="ghost" size="sm" className="h-6 px-2 text-xs" onClick={() => setSelectedConv(null)}>
                Limpar
              </Button>
            )}
          </div>
          <ScrollArea className="h-[480px]">
            <div className="space-y-1">
              {conversationsList.length === 0 ? (
                <p className="text-xs text-muted-foreground text-center py-6">Nenhum evento.</p>
              ) : conversationsList.map(([cid, info]) => (
                <button
                  key={cid}
                  onClick={() => setSelectedConv(selectedConv === cid ? null : cid)}
                  className={cn(
                    'w-full text-left px-2 py-2 rounded border text-xs transition-colors',
                    selectedConv === cid
                      ? 'border-sky-500/50 bg-sky-500/5'
                      : 'border-border hover:border-border hover:bg-card/60'
                  )}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate text-foreground font-medium">
                      {info.conv?.contact_name || info.conv?.phone || cid.slice(0, 8)}
                    </span>
                    {info.hasError && <AlertTriangle className="w-3 h-3 text-rose-400 shrink-0" />}
                  </div>
                  {isMaster && companyFilter === 'all' && info.company_id && (
                    <div className="flex items-center gap-1 mt-0.5 text-[10px] text-violet-400 truncate">
                      <Building2 className="w-2.5 h-2.5 shrink-0" />
                      <span className="truncate">{companyName(info.company_id)}</span>
                    </div>
                  )}
                  <div className="flex items-center justify-between mt-1">
                    <span className="text-muted-foreground">{info.count} eventos</span>
                    <span className="text-muted-foreground">
                      {formatDistanceToNow(new Date(info.lastAt), { locale: ptBR, addSuffix: true })}
                    </span>
                  </div>
                </button>
              ))}
            </div>
          </ScrollArea>
        </Card>

        {/* Main: logs + timeline */}
        <div className="space-y-4">
          <Card className="p-3 bg-background border-border">
            <div className="flex flex-col md:flex-row gap-2">
              <div className="relative flex-1">
                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar mensagem, telefone, contato, ID..." className="pl-9" />
              </div>
              <Select value={originFilter} onValueChange={setOriginFilter}>
                <SelectTrigger className="md:w-44"><SelectValue placeholder="Origem" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas as origens</SelectItem>
                  {Object.entries(ORIGIN_META).map(([k, m]) => (
                    <SelectItem key={k} value={k}>{m.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={levelFilter} onValueChange={setLevelFilter}>
                <SelectTrigger className="md:w-36"><SelectValue placeholder="Nível" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  <SelectItem value="info">Info</SelectItem>
                  <SelectItem value="warn">Warn</SelectItem>
                  <SelectItem value="error">Error</SelectItem>
                  <SelectItem value="debug">Debug</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </Card>

          <Tabs defaultValue="logs">
            <TabsList>
              <TabsTrigger value="logs">Eventos ({filteredLogs.length})</TabsTrigger>
              <TabsTrigger value="timeline" disabled={!selectedConv}>
                Linha do tempo {selectedConv ? `(${(conversationTimelineQuery.data?.queue.length ?? 0) + (conversationTimelineQuery.data?.sent.length ?? 0)})` : ''}
              </TabsTrigger>
              <TabsTrigger value="phantoms" className="gap-1.5">
                <Ghost className="w-3.5 h-3.5" /> Tentativas & Phantoms
              </TabsTrigger>
              <TabsTrigger value="suggestions" className="gap-1.5">
                <Wand2 className="w-3.5 h-3.5" /> Sugestões de correção
              </TabsTrigger>
            </TabsList>

            <TabsContent value="logs" className="mt-3">
              <Card className="p-0 bg-background border-border overflow-hidden">
                <ScrollArea className="h-[520px]">
                  {logsQuery.isLoading ? (
                    <p className="text-center text-muted-foreground py-10 text-sm">Carregando...</p>
                  ) : filteredLogs.length === 0 ? (
                    <p className="text-center text-muted-foreground py-10 text-sm">Nenhum evento encontrado.</p>
                  ) : (
                    <ul className="divide-y divide-border">
                      {filteredLogs.map(log => {
                        const conv = conversationsQuery.data?.get(log.metadata?.conversation_id || '');
                        return (
                          <li key={log.id} className="px-3 py-2.5 hover:bg-card/60">
                            <div className="flex items-center gap-2 flex-wrap">
                              <LevelBadge level={log.level} />
                              <OriginBadge metadata={log.metadata} />
                              <span className="text-xs font-mono text-muted-foreground/80">{log.event}</span>
                              {log.metadata?.kind && (
                                <Badge variant="outline" className="text-[10px] h-5 border-border">
                                  {KIND_LABEL[log.metadata.kind] ?? log.metadata.kind}
                                </Badge>
                              )}
                              {isMaster && companyFilter === 'all' && log.company_id && (
                                <button
                                  onClick={(e) => { e.stopPropagation(); setCompanyFilter(log.company_id!); }}
                                  className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] border border-violet-500/30 bg-violet-500/10 text-violet-300 hover:bg-violet-500/20"
                                  title="Filtrar por esta empresa"
                                >
                                  <Building2 className="w-2.5 h-2.5" />
                                  {companyName(log.company_id)}
                                </button>
                              )}
                              <span className="ml-auto text-[11px] text-muted-foreground" title={format(new Date(log.created_at), 'dd/MM/yyyy HH:mm:ss')}>
                                {format(new Date(log.created_at), 'dd/MM HH:mm:ss')}
                              </span>
                            </div>
                            <p className="text-sm text-foreground mt-1.5">{log.message}</p>
                            {(conv || log.metadata?.conversation_id) && (
                              <button
                                onClick={() => setSelectedConv(log.metadata.conversation_id)}
                                className="text-[11px] text-sky-400 hover:underline mt-1 inline-flex items-center gap-1"
                              >
                                <ArrowRight className="w-3 h-3" />
                                {conv?.contact_name || conv?.phone || log.metadata.conversation_id?.slice(0, 12)}
                                {conv?.instance_name && <span className="text-muted-foreground/80">· {conv.instance_name}</span>}
                              </button>
                            )}
                            {log.metadata?.reason && (
                              <p className="text-[11px] text-amber-400 mt-1">
                                Motivo: <span className="font-mono">{log.metadata.reason}</span>
                              </p>
                            )}
                            {Object.keys(log.metadata ?? {}).filter(k => !['origin', 'conversation_id', 'kind', 'reason', 'message_id'].includes(k)).length > 0 && (
                              <details className="mt-1.5">
                                <summary className="text-[11px] text-muted-foreground cursor-pointer hover:text-foreground">Detalhes técnicos</summary>
                                <pre className="text-[10px] bg-card border border-border rounded p-2 mt-1 overflow-auto text-foreground">{JSON.stringify(log.metadata, null, 2)}</pre>
                              </details>
                            )}
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </ScrollArea>
              </Card>
            </TabsContent>

            <TabsContent value="timeline" className="mt-3">
              {selectedConv && (
                <Card className="p-4 bg-background border-border space-y-4">
                  <div className="flex items-center gap-2 text-sm">
                    <MessageSquare className="w-4 h-4 text-muted-foreground" />
                    <span className="font-medium text-foreground">
                      {conversationsQuery.data?.get(selectedConv)?.contact_name || conversationsQuery.data?.get(selectedConv)?.phone || selectedConv.slice(0, 12)}
                    </span>
                    <span className="text-xs text-muted-foreground font-mono">{selectedConv}</span>
                    <Button size="sm" variant="outline" className="ml-auto h-7" onClick={() => setReplayCtx({ kind: 'off_hours', queueId: null })}>
                      <RotateCw className="w-3 h-3 mr-1.5" /> Replay
                    </Button>
                  </div>

                  <div>
                    <h4 className="text-xs uppercase tracking-wide text-muted-foreground mb-2 flex items-center gap-1.5"><Inbox className="w-3 h-3" /> Fila</h4>
                    {(conversationTimelineQuery.data?.queue ?? []).length === 0 ? (
                      <p className="text-xs text-muted-foreground">Nenhum item na fila.</p>
                    ) : (
                      <ul className="space-y-1.5">
                        {conversationTimelineQuery.data?.queue.map(q => (
                          <li key={q.id} className="text-xs border border-border rounded p-2 flex items-center gap-2">
                            <Badge variant="outline" className="border-border text-[10px]">{KIND_LABEL[q.message_kind] ?? q.message_kind}</Badge>
                            <span className={cn(
                              'text-[10px] uppercase',
                              q.status === 'sent' && 'text-emerald-400',
                              q.status === 'failed' && 'text-rose-400',
                              q.status === 'skipped' && 'text-amber-400',
                              q.status === 'pending' && 'text-foreground',
                              q.status === 'processing' && 'text-sky-400',
                            )}>{q.status}</span>
                            {q.last_error && <span className="text-rose-400 truncate">· {q.last_error}</span>}
                            <span className="ml-auto text-muted-foreground">{format(new Date(q.created_at), 'dd/MM HH:mm:ss')}</span>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-6 px-2 text-[10px]"
                              onClick={() => setReplayCtx({ kind: q.message_kind as any, queueId: ['pending','processing'].includes(q.status) ? q.id : null })}
                            >
                              <RotateCw className="w-3 h-3 mr-1" /> Replay
                            </Button>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>

                  <div>
                    <h4 className="text-xs uppercase tracking-wide text-muted-foreground mb-2 flex items-center gap-1.5"><CheckCircle2 className="w-3 h-3" /> Enviadas</h4>
                    {(conversationTimelineQuery.data?.sent ?? []).length === 0 ? (
                      <p className="text-xs text-muted-foreground">Nenhuma mensagem foi entregue ainda.</p>
                    ) : (
                      <ul className="space-y-1.5">
                        {conversationTimelineQuery.data?.sent.map(s => (
                          <li key={s.id} className="text-xs border border-border rounded p-2">
                            <div className="flex items-center gap-2">
                              <Badge variant="outline" className="border-border text-[10px]">{KIND_LABEL[s.message_kind] ?? s.message_kind}</Badge>
                              <span className="ml-auto text-muted-foreground">{format(new Date(s.sent_at), 'dd/MM HH:mm:ss')}</span>
                            </div>
                            {s.body && <p className="text-muted-foreground mt-1 line-clamp-3">{s.body}</p>}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </Card>
              )}
            </TabsContent>

            <TabsContent value="phantoms" className="mt-3">
              <PhantomAttemptsPanel companyIdFilter={effectiveCompanyId} />
            </TabsContent>

            <TabsContent value="suggestions" className="mt-3">
              <SkipSuggestionsPanel conversationId={selectedConv} companyIdFilter={effectiveCompanyId} />
            </TabsContent>
          </Tabs>
        </div>
      </div>
      {replayCtx && selectedConv && (
        <ReplayDialog
          conversationId={selectedConv}
          conversationLabel={conversationsQuery.data?.get(selectedConv)?.contact_name || conversationsQuery.data?.get(selectedConv)?.phone || undefined}
          defaultKind={replayCtx.kind}
          pendingQueueId={replayCtx.queueId}
          onClose={() => setReplayCtx(null)}
          onAfterAction={() => { refresh(); }}
        />
      )}
    </div>
  );
}
