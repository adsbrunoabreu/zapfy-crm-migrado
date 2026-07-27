import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { useAuth } from '@/contexts/AuthContext';
import { Bot, Clock, Inbox, RefreshCw, Search, Send, ShieldAlert, Star, Timer, MailCheck, Ban, CheckCircle2, AlertCircle, Loader2, MessageSquareDashed } from 'lucide-react';
import { format, formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import { BulkCancelDialog } from '@/components/automation/BulkCancelDialog';
import { KpiCard } from '@/components/ui/KpiCard';

type QueueRow = {
  id: string;
  conversation_id: string;
  company_id: string;
  message_kind: string;
  status: string;
  attempts: number;
  last_error: string | null;
  processed_at: string | null;
  created_at: string;
  conversation?: {
    contact_name: string | null;
    phone: string;
    instance_name: string;
  } | null;
};

type SentRow = {
  id: string;
  conversation_id: string;
  company_id: string;
  message_kind: string;
  body: string | null;
  sent_at: string;
  created_at: string;
  conversation?: {
    contact_name: string | null;
    phone: string;
  } | null;
};

const KIND_META: Record<string, { label: string; icon: any; trigger: string; color: string }> = {
  off_hours: {
    label: 'Fora do horário',
    icon: Clock,
    trigger: 'Mensagem recebida fora do horário comercial e a resposta automática está ativa.',
    color: 'text-amber-400 bg-amber-500/10 border-amber-500/20',
  },
  welcome: {
    label: 'Boas-vindas',
    icon: MailCheck,
    trigger: 'Primeira mensagem do contato (ou após 24h sem boas-vindas) com mensagem de boas-vindas configurada.',
    color: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20',
  },
  wait_time: {
    label: 'Tempo de espera',
    icon: Timer,
    trigger: 'Aviso de tempo de espera ativado em Configurações → Geral.',
    color: 'text-sky-400 bg-sky-500/10 border-sky-500/20',
  },
  supervisor_alert: {
    label: 'Alerta supervisor',
    icon: ShieldAlert,
    trigger: 'Conversa sem resposta acima do limite definido em Configurações → Geral.',
    color: 'text-rose-400 bg-rose-500/10 border-rose-500/20',
  },
  rating: {
    label: 'Avaliação',
    icon: Star,
    trigger: 'Ticket encerrado com solicitação de avaliação habilitada.',
    color: 'text-violet-400 bg-violet-500/10 border-violet-500/20',
  },
  ai_response: {
    label: 'Agente IA',
    icon: Bot,
    trigger: 'Resposta gerada pelo Agente IA configurado para a empresa.',
    color: 'text-fuchsia-400 bg-fuchsia-500/10 border-fuchsia-500/20',
  },
};

const STATUS_META: Record<string, { label: string; icon: any; tone: string }> = {
  pending: { label: 'Pendente', icon: Loader2, tone: 'text-foreground bg-muted border-border' },
  processing: { label: 'Processando', icon: Loader2, tone: 'text-sky-400 bg-sky-500/10 border-sky-500/20' },
  sent: { label: 'Enviada', icon: CheckCircle2, tone: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20' },
  failed: { label: 'Falhou', icon: AlertCircle, tone: 'text-rose-400 bg-rose-500/10 border-rose-500/20' },
  skipped: { label: 'Bloqueada', icon: Ban, tone: 'text-amber-400 bg-amber-500/10 border-amber-500/20' },
};

function KindBadge({ kind }: { kind: string }) {
  const meta = KIND_META[kind] ?? { label: kind, icon: MessageSquareDashed, trigger: 'Tipo desconhecido', color: 'text-foreground bg-muted border-border' };
  const Icon = meta.icon;
  return (
    <TooltipProvider delayDuration={200}>
      <Tooltip>
        <TooltipTrigger asChild>
          <span className={cn('inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-xs border', meta.color)}>
            <Icon className="w-3 h-3" /> {meta.label}
          </span>
        </TooltipTrigger>
        <TooltipContent side="top" className="max-w-xs text-xs">
          <strong className="block mb-1">Quando dispara:</strong>
          {meta.trigger}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

function StatusBadge({ status, lastError }: { status: string; lastError?: string | null }) {
  const meta = STATUS_META[status] ?? { label: status, icon: AlertCircle, tone: 'text-foreground bg-muted border-border' };
  const Icon = meta.icon;
  const spinning = status === 'processing' || status === 'pending';
  const node = (
    <span className={cn('inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-xs border', meta.tone)}>
      <Icon className={cn('w-3 h-3', spinning && 'animate-spin')} /> {meta.label}
    </span>
  );
  if (!lastError) return node;
  return (
    <TooltipProvider delayDuration={200}>
      <Tooltip>
        <TooltipTrigger asChild>{node}</TooltipTrigger>
        <TooltipContent side="top" className="max-w-sm text-xs">
          <strong className="block mb-1">Motivo:</strong>
          {lastError}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

interface AutomationStatusProps { embedded?: boolean }
export default function AutomationStatus({ embedded = false }: AutomationStatusProps = {}) {
  const { profile, roles } = useAuth();
  const isMaster = roles.includes('master');
  const companyId = profile?.company_id ?? null;

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [kindFilter, setKindFilter] = useState<string>('all');

  const queueQuery = useQuery({
    queryKey: ['automation-queue', companyId, isMaster],
    queryFn: async () => {
      let q = supabase
        .from('attendance_auto_message_queue')
        .select('id, conversation_id, company_id, message_kind, status, attempts, last_error, processed_at, created_at')
        .order('created_at', { ascending: false })
        .limit(300);
      if (!isMaster && companyId) q = q.eq('company_id', companyId);
      const { data, error } = await q;
      if (error) throw error;
      const rows = (data ?? []) as QueueRow[];
      const ids = Array.from(new Set(rows.map(r => r.conversation_id)));
      if (ids.length) {
        const { data: convs } = await supabase
          .from('conversations')
          .select('id, contact_name, phone, instance_name')
          .in('id', ids)
          .limit(500);
        const map = new Map((convs ?? []).map(c => [c.id, c]));
        rows.forEach(r => { r.conversation = map.get(r.conversation_id) as any; });
      }
      return rows;
    },
    refetchInterval: 15_000,
  });

  const sentQuery = useQuery({
    queryKey: ['automation-sent', companyId, isMaster],
    queryFn: async () => {
      let q = supabase
        .from('attendance_auto_messages')
        .select('id, conversation_id, company_id, message_kind, body, sent_at, created_at')
        .order('sent_at', { ascending: false })
        .limit(300);
      if (!isMaster && companyId) q = q.eq('company_id', companyId);
      const { data, error } = await q;
      if (error) throw error;
      const rows = (data ?? []) as SentRow[];
      const ids = Array.from(new Set(rows.map(r => r.conversation_id)));
      if (ids.length) {
        const { data: convs } = await supabase
          .from('conversations')
          .select('id, contact_name, phone')
          .in('id', ids)
          .limit(500);
        const map = new Map((convs ?? []).map(c => [c.id, c]));
        rows.forEach(r => { r.conversation = map.get(r.conversation_id) as any; });
      }
      return rows;
    },
    refetchInterval: 30_000,
  });

  const filteredQueue = useMemo(() => {
    const term = search.trim().toLowerCase();
    return (queueQuery.data ?? []).filter(r => {
      if (statusFilter !== 'all' && r.status !== statusFilter) return false;
      if (kindFilter !== 'all' && r.message_kind !== kindFilter) return false;
      if (!term) return true;
      const name = r.conversation?.contact_name ?? '';
      const phone = r.conversation?.phone ?? '';
      return name.toLowerCase().includes(term) || phone.toLowerCase().includes(term);
    });
  }, [queueQuery.data, search, statusFilter, kindFilter]);

  const filteredSent = useMemo(() => {
    const term = search.trim().toLowerCase();
    return (sentQuery.data ?? []).filter(r => {
      if (kindFilter !== 'all' && r.message_kind !== kindFilter) return false;
      if (!term) return true;
      const name = r.conversation?.contact_name ?? '';
      const phone = r.conversation?.phone ?? '';
      return name.toLowerCase().includes(term) || phone.toLowerCase().includes(term);
    });
  }, [sentQuery.data, search, kindFilter]);

  const counts = useMemo(() => {
    const rows = queueQuery.data ?? [];
    return {
      total: rows.length,
      pending: rows.filter(r => r.status === 'pending').length,
      processing: rows.filter(r => r.status === 'processing').length,
      sent: rows.filter(r => r.status === 'sent').length,
      failed: rows.filter(r => r.status === 'failed').length,
      skipped: rows.filter(r => r.status === 'skipped').length,
    };
  }, [queueQuery.data]);

  const refresh = () => { queueQuery.refetch(); sentQuery.refetch(); };

  return (
    <div className={cn(embedded ? 'space-y-6' : 'p-6 space-y-6')}>
      {!embedded && (
        <header className="flex flex-col md:flex-row md:items-end md:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-foreground">Status de Mensagens Automáticas</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Acompanhe disparos pendentes, enviados e bloqueados — com o motivo de cada decisão.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <BulkCancelDialog
              defaultCompanyId={isMaster ? null : companyId}
              onCancelled={() => { queueQuery.refetch(); sentQuery.refetch(); }}
            />
            <Button variant="outline" size="sm" onClick={refresh} disabled={queueQuery.isFetching}>
              <RefreshCw className={cn('w-4 h-4 mr-2', queueQuery.isFetching && 'animate-spin')} />
              Atualizar
            </Button>
          </div>
        </header>
      )}
      {embedded && (
        <div className="flex items-center justify-end gap-2">
          <BulkCancelDialog
            defaultCompanyId={isMaster ? null : companyId}
            onCancelled={() => { queueQuery.refetch(); sentQuery.refetch(); }}
          />
          <Button variant="outline" size="sm" onClick={refresh} disabled={queueQuery.isFetching}>
            <RefreshCw className={cn('w-4 h-4 mr-2', queueQuery.isFetching && 'animate-spin')} />
            Atualizar
          </Button>
        </div>
      )}


      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        <KpiCard label="Total" value={counts.total} icon={Inbox} tone="muted" />
        <KpiCard label="Pendentes" value={counts.pending} icon={Loader2} tone="muted" />
        <KpiCard label="Processando" value={counts.processing} icon={Loader2} tone="cyan" iconSpin={counts.processing > 0} />
        <KpiCard label="Enviadas" value={counts.sent} icon={CheckCircle2} tone="emerald" />
        <KpiCard label="Falharam" value={counts.failed} icon={AlertCircle} tone={counts.failed ? 'rose' : 'muted'} />
        <KpiCard label="Bloqueadas" value={counts.skipped} icon={Ban} tone={counts.skipped ? 'amber' : 'muted'} />
      </div>

      <Card className="p-4 bg-background border-border space-y-4">
        <div className="flex flex-col md:flex-row gap-2">
          <div className="relative flex-1">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Buscar por nome ou telefone..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
          <Select value={kindFilter} onValueChange={setKindFilter}>
            <SelectTrigger className="md:w-48"><SelectValue placeholder="Tipo" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os tipos</SelectItem>
              {Object.entries(KIND_META).map(([k, m]) => (
                <SelectItem key={k} value={k}>{m.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="md:w-48"><SelectValue placeholder="Status" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os status</SelectItem>
              {Object.entries(STATUS_META).map(([k, m]) => (
                <SelectItem key={k} value={k}>{m.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <Tabs defaultValue="queue">
          <TabsList>
            <TabsTrigger value="queue">
              <Inbox className="w-3.5 h-3.5 mr-1.5" /> Fila ({filteredQueue.length})
            </TabsTrigger>
            <TabsTrigger value="sent">
              <Send className="w-3.5 h-3.5 mr-1.5" /> Enviadas ({filteredSent.length})
            </TabsTrigger>
          </TabsList>

          <TabsContent value="queue" className="mt-4">
            <div className="rounded-md border border-border overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow className="border-border hover:bg-transparent">
                    <TableHead>Contato</TableHead>
                    <TableHead>Tipo</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Tentativas</TableHead>
                    <TableHead>Enfileirada</TableHead>
                    <TableHead>Processada</TableHead>
                    <TableHead>Motivo / Erro</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {queueQuery.isLoading ? (
                    <TableRow><TableCell colSpan={7} className="text-center py-10 text-muted-foreground">Carregando...</TableCell></TableRow>
                  ) : filteredQueue.length === 0 ? (
                    <TableRow><TableCell colSpan={7} className="text-center py-10 text-muted-foreground">Nenhuma mensagem na fila com os filtros atuais.</TableCell></TableRow>
                  ) : filteredQueue.map(row => (
                    <TableRow key={row.id} className="border-border">
                      <TableCell>
                        <div className="text-sm text-foreground">{row.conversation?.contact_name || row.conversation?.phone || '—'}</div>
                        {row.conversation?.phone && (
                          <div className="text-xs text-muted-foreground">{row.conversation.phone}</div>
                        )}
                      </TableCell>
                      <TableCell><KindBadge kind={row.message_kind} /></TableCell>
                      <TableCell><StatusBadge status={row.status} lastError={row.last_error} /></TableCell>
                      <TableCell className="text-sm text-muted-foreground">{row.attempts}</TableCell>
                      <TableCell className="text-sm text-muted-foreground" title={format(new Date(row.created_at), 'dd/MM/yyyy HH:mm:ss', { locale: ptBR })}>
                        {formatDistanceToNow(new Date(row.created_at), { addSuffix: true, locale: ptBR })}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {row.processed_at ? formatDistanceToNow(new Date(row.processed_at), { addSuffix: true, locale: ptBR }) : '—'}
                      </TableCell>
                      <TableCell className="max-w-xs">
                        {row.last_error ? (
                          <span className="text-xs text-rose-400 line-clamp-2">{row.last_error}</span>
                        ) : row.status === 'sent' ? (
                          <span className="text-xs text-emerald-400">Entregue ao WhatsApp</span>
                        ) : row.status === 'pending' ? (
                          <span className="text-xs text-muted-foreground">Aguardando worker (executa a cada 1 min)</span>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </TabsContent>

          <TabsContent value="sent" className="mt-4">
            <div className="rounded-md border border-border overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow className="border-border hover:bg-transparent">
                    <TableHead>Contato</TableHead>
                    <TableHead>Tipo</TableHead>
                    <TableHead>Mensagem</TableHead>
                    <TableHead>Enviada</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sentQuery.isLoading ? (
                    <TableRow><TableCell colSpan={4} className="text-center py-10 text-muted-foreground">Carregando...</TableCell></TableRow>
                  ) : filteredSent.length === 0 ? (
                    <TableRow><TableCell colSpan={4} className="text-center py-10 text-muted-foreground">Nenhuma mensagem enviada com os filtros atuais.</TableCell></TableRow>
                  ) : filteredSent.map(row => (
                    <TableRow key={row.id} className="border-border">
                      <TableCell>
                        <div className="text-sm text-foreground">{row.conversation?.contact_name || row.conversation?.phone || '—'}</div>
                        {row.conversation?.phone && (
                          <div className="text-xs text-muted-foreground">{row.conversation.phone}</div>
                        )}
                      </TableCell>
                      <TableCell><KindBadge kind={row.message_kind} /></TableCell>
                      <TableCell className="max-w-md">
                        <span className="text-xs text-muted-foreground line-clamp-2">{row.body || '—'}</span>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground" title={format(new Date(row.sent_at), 'dd/MM/yyyy HH:mm:ss', { locale: ptBR })}>
                        {formatDistanceToNow(new Date(row.sent_at), { addSuffix: true, locale: ptBR })}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </TabsContent>
        </Tabs>
      </Card>
    </div>
  );
}
