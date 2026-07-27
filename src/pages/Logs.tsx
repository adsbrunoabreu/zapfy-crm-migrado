import { PageShell } from '@/components/layout/PageShell';
import { useState, useMemo, forwardRef, useEffect, useRef, memo } from 'react';
import { useSystemLogs, type SystemLog } from '@/hooks/useSystemLogs';
import { useAuth } from '@/contexts/AuthContext';
import { useAllUsers } from '@/hooks/useAllUsers';
import { useCompanies } from '@/hooks/useCompanies';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import {
  Search,
  AlertTriangle,
  AlertCircle,
  Info,
  Bug,
  RefreshCw,
  Filter,
  ChevronDown,
  ChevronRight,
  Loader2,
  ScrollText,
  Wifi,
  MessageSquare,
  Zap,
  CalendarIcon,
  User as UserIcon,
  Building2,
} from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { DatePicker } from '@/components/ui/date-picker';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
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
import { LogRetentionPanel } from '@/components/admin/LogRetentionPanel';

// ─── Level Config ─────────────────────────────────────
const levelConfig: Record<string, { icon: React.ElementType; color: string; label: string }> = {
  error: { icon: AlertCircle, color: 'text-[hsl(var(--rose))] bg-[hsl(var(--rose)/0.10)] border-[hsl(var(--rose)/0.20)]', label: 'Erro' },
  warn: { icon: AlertTriangle, color: 'text-[hsl(var(--amber))] bg-[hsl(var(--amber)/0.10)] border-[hsl(var(--amber)/0.20)]', label: 'Aviso' },
  info: { icon: Info, color: 'text-[hsl(var(--cyan))] bg-[hsl(var(--cyan)/0.10)] border-[hsl(var(--cyan)/0.20)]', label: 'Info' },
  debug: { icon: Bug, color: 'text-muted-foreground bg-muted/50 border-border/50', label: 'Debug' },
};

const sourceConfig: Record<string, { icon: React.ElementType; label: string }> = {
  'evolution-webhook': { icon: Zap, label: 'Webhook' },
  'evolution-proxy': { icon: Wifi, label: 'Proxy' },
  'system': { icon: ScrollText, label: 'Sistema' },
};

function getLevelConfig(level: string) {
  return levelConfig[level] || levelConfig.debug;
}

function getSourceConfig(source: string) {
  return sourceConfig[source] || sourceConfig.system;
}

// ─── Log Row ──────────────────────────────────────────
const LogRowButton = forwardRef<
  HTMLButtonElement,
  React.ButtonHTMLAttributes<HTMLButtonElement> & { log: SystemLog; expanded: boolean }
>(({ log, expanded, ...props }, ref) => {
  const lvl = getLevelConfig(log.level);
  const src = getSourceConfig(log.source);
  const LevelIcon = lvl.icon;
  const SourceIcon = src.icon;
  const hasMetadata = log.metadata && Object.keys(log.metadata).length > 0;

  return (
    <button
      ref={ref}
      {...props}
      className={cn(
        'w-full flex items-start gap-3 px-4 py-3 text-left hover:bg-accent/30 transition-colors border-b border-border/30',
        log.level === 'error' && 'bg-[hsl(var(--rose)/0.08)]'
      )}
    >
      <div className={cn('mt-0.5 p-1 rounded border shrink-0', lvl.color)}>
        <LevelIcon className="w-3.5 h-3.5" />
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <Badge variant="outline" className="text-[10px] h-5 font-mono">
            <SourceIcon className="w-3 h-3 mr-1" />
            {src.label}
          </Badge>
          <Badge variant="secondary" className="text-[10px] h-5 font-mono">
            {log.event}
          </Badge>
          {log.instance_name && (
            <Badge variant="outline" className="text-[10px] h-5 font-mono text-muted-foreground">
              {log.instance_name}
            </Badge>
          )}
        </div>
        <p className="text-sm mt-1 text-foreground/90 break-words">{log.message}</p>
      </div>

      <div className="flex items-center gap-2 shrink-0">
        <span className="text-[11px] text-muted-foreground font-mono whitespace-nowrap">
          {format(new Date(log.created_at), 'dd/MM HH:mm:ss', { locale: ptBR })}
        </span>
        {hasMetadata && (
          expanded ? <ChevronDown className="w-4 h-4 text-muted-foreground" /> : <ChevronRight className="w-4 h-4 text-muted-foreground" />
        )}
      </div>
    </button>
  );
});
LogRowButton.displayName = 'LogRowButton';

const LogRow = memo(function LogRow({ log }: { log: SystemLog }) {
  const [expanded, setExpanded] = useState(false);
  const hasMetadata = log.metadata && Object.keys(log.metadata).length > 0;

  return (
    <Collapsible open={expanded} onOpenChange={setExpanded}>
      <CollapsibleTrigger asChild>
        <LogRowButton log={log} expanded={expanded} />
      </CollapsibleTrigger>

      {hasMetadata && (
        <CollapsibleContent>
          <div className="px-4 py-3 bg-muted/30 border-b border-border/30">
            <pre className="text-xs text-muted-foreground font-mono overflow-x-auto whitespace-pre-wrap break-all">
              {JSON.stringify(log.metadata, null, 2)}
            </pre>
          </div>
        </CollapsibleContent>
      )}
    </Collapsible>
  );
});

// ─── Stats Bar ────────────────────────────────────────
function LogStats({ logs }: { logs: SystemLog[] }) {
  const stats = useMemo(() => {
    const counts = { error: 0, warn: 0, info: 0, debug: 0 };
    logs.forEach((l) => {
      if (l.level in counts) counts[l.level as keyof typeof counts]++;
    });
    return counts;
  }, [logs]);

  return (
    <div className="flex items-center gap-4 text-xs">
      {stats.error > 0 && (
        <span className="flex items-center gap-1 text-[hsl(var(--rose))] font-medium">
          <AlertCircle className="w-3.5 h-3.5" /> {stats.error} erros
        </span>
      )}
      {stats.warn > 0 && (
        <span className="flex items-center gap-1 text-[hsl(var(--amber))]">
          <AlertTriangle className="w-3.5 h-3.5" /> {stats.warn} avisos
        </span>
      )}
      <span className="flex items-center gap-1 text-muted-foreground">
        <Info className="w-3.5 h-3.5" /> {stats.info} info
      </span>
      <span className="text-muted-foreground">
        {logs.length} carregados
      </span>
    </div>
  );
}

// ─── Date Picker ──────────────────────────────────────
function DateFilter({
  value,
  onChange,
  placeholder,
}: {
  value?: Date;
  onChange: (d?: Date) => void;
  placeholder: string;
}) {
  return <DatePicker value={value} onChange={onChange} placeholder={placeholder} size="sm" />;
}

// ─── Debounce ─────────────────────────────────────────
function useDebounced<T>(value: T, delay = 300): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return v;
}

// ─── Main Page ────────────────────────────────────────
export default function Logs() {
  const { isMaster } = useAuth();
  const [searchInput, setSearchInput] = useState('');
  const search = useDebounced(searchInput, 300);
  const [source, setSource] = useState('all');
  const [level, setLevel] = useState('all');
  const [instanceFilter, setInstanceFilter] = useState('all');
  const [userFilter, setUserFilter] = useState('all');
  const [companyFilter, setCompanyFilter] = useState('all');
  const [dateFrom, setDateFrom] = useState<Date | undefined>();
  const [dateTo, setDateTo] = useState<Date | undefined>();

  const { data: usersData = [] } = useAllUsers();
  const { data: companiesData = [] } = useCompanies();

  const {
    logs: rawLogs,
    isLoading,
    refetch,
    isFetching,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useSystemLogs({
    source: source !== 'all' ? source : undefined,
    level: level !== 'all' ? level : undefined,
    instanceName: instanceFilter !== 'all' ? instanceFilter : undefined,
    userId: userFilter !== 'all' ? userFilter : undefined,
    companyId: isMaster && companyFilter !== 'all' ? companyFilter : undefined,
    dateFrom: dateFrom ? dateFrom.toISOString() : undefined,
    dateTo: dateTo
      ? new Date(dateTo.getTime() + 24 * 60 * 60 * 1000 - 1).toISOString()
      : undefined,
    search: search || undefined,
  });

  const logs: SystemLog[] = Array.isArray(rawLogs) ? rawLogs : [];

  // Extract unique instances from currently loaded logs
  const instances = useMemo(() => {
    const set = new Set<string>();
    logs.forEach((l) => {
      if (l.instance_name) set.add(l.instance_name);
    });
    return Array.from(set).sort();
  }, [logs]);

  const userOptions = useMemo(
    () => usersData.map((u) => ({ id: u.id, label: u.full_name || u.email })),
    [usersData]
  );

  const companyOptions = useMemo(
    () => companiesData.map((c) => ({ id: c.id, label: c.name })),
    [companiesData]
  );

  const hasFilters =
    !!search ||
    source !== 'all' ||
    level !== 'all' ||
    instanceFilter !== 'all' ||
    userFilter !== 'all' ||
    companyFilter !== 'all' ||
    !!dateFrom ||
    !!dateTo;

  // Infinite scroll sentinel
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el || !hasNextPage || isFetchingNextPage) return;
    const obs = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          fetchNextPage();
        }
      },
      { rootMargin: '200px' }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage, logs.length]);

  return (
    <PageShell
      title="Logs do Sistema"
      subtitle="Monitore eventos de integrações, webhooks e proxy em tempo real"
      actions={
        <>
          <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[hsl(var(--emerald))] opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-[hsl(var(--emerald))]" />
            </span>
            Ao vivo
          </span>
          <Button
            variant="outline"
            size="sm"
            onClick={() => refetch()}
            disabled={isFetching}
          >
            <RefreshCw className={cn('w-4 h-4 mr-2', isFetching && 'animate-spin')} />
            Atualizar
          </Button>
        </>
      }
    >

      {isMaster && <div className="mb-4"><LogRetentionPanel /></div>}

      {/* Filters */}
      <div className="glass-card p-4 rounded-xl space-y-3">
        <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
          <Filter className="w-4 h-4" />
          Filtros
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-3">
          <div className="relative lg:col-span-2">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Buscar por mensagem ou evento..."
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              className="pl-9 bg-secondary/50 border-border/50"
            />
          </div>

          <Select value={source} onValueChange={setSource}>
            <SelectTrigger className="bg-secondary/50 border-border/50">
              <SelectValue placeholder="Origem" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas origens</SelectItem>
              <SelectItem value="evolution-webhook">Webhook</SelectItem>
              <SelectItem value="evolution-proxy">Proxy</SelectItem>
              <SelectItem value="system">Sistema</SelectItem>
            </SelectContent>
          </Select>

          <Select value={level} onValueChange={setLevel}>
            <SelectTrigger className="bg-secondary/50 border-border/50">
              <SelectValue placeholder="Nível" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos níveis</SelectItem>
              <SelectItem value="error">🔴 Erro</SelectItem>
              <SelectItem value="warn">🟡 Aviso</SelectItem>
              <SelectItem value="info">🔵 Info</SelectItem>
              <SelectItem value="debug">⚪ Debug</SelectItem>
            </SelectContent>
          </Select>

          <Select value={instanceFilter} onValueChange={setInstanceFilter}>
            <SelectTrigger className="bg-secondary/50 border-border/50">
              <SelectValue placeholder="Instância" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas instâncias</SelectItem>
              {instances.map((inst) => (
                <SelectItem key={inst} value={inst}>
                  {inst}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={userFilter} onValueChange={setUserFilter}>
            <SelectTrigger className="bg-secondary/50 border-border/50">
              <UserIcon className="w-3.5 h-3.5 mr-2 text-muted-foreground" />
              <SelectValue placeholder="Usuário" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos usuários</SelectItem>
              {userOptions.map((u) => (
                <SelectItem key={u.id} value={u.id}>
                  {u.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex items-center gap-3 flex-wrap">
          {isMaster && (
            <Select value={companyFilter} onValueChange={setCompanyFilter}>
              <SelectTrigger className="w-56 h-8 bg-secondary/50 border-border/50 text-xs">
                <Building2 className="w-3.5 h-3.5 mr-2 text-muted-foreground" />
                <SelectValue placeholder="Empresa" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas empresas</SelectItem>
                {companyOptions.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}

          <div className="flex items-center gap-2">
            <label className="text-xs text-muted-foreground">De:</label>
            <DateFilter value={dateFrom} onChange={setDateFrom} placeholder="Data inicial" />
          </div>
          <div className="flex items-center gap-2">
            <label className="text-xs text-muted-foreground">Até:</label>
            <DateFilter value={dateTo} onChange={setDateTo} placeholder="Data final" />
          </div>

          {hasFilters && (
            <Button
              variant="ghost"
              size="sm"
              className="text-xs h-8"
              onClick={() => {
                setSearchInput('');
                setSource('all');
                setLevel('all');
                setInstanceFilter('all');
                setUserFilter('all');
                setCompanyFilter('all');
                setDateFrom(undefined);
                setDateTo(undefined);
              }}
            >
              Limpar filtros
            </Button>
          )}
        </div>
      </div>

      {/* Stats */}
      {logs.length > 0 && (
        <div className="flex items-center justify-between">
          <LogStats logs={logs} />
          <span className="text-xs text-muted-foreground">
            Atualização ao vivo + auto a cada 60s
          </span>
        </div>
      )}

      {/* Logs List */}
      <div className="glass-card rounded-xl overflow-hidden border border-border/50">
        {isLoading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        ) : logs.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <ScrollText className="w-12 h-12 text-muted-foreground/30 mb-3" />
            <h3 className="font-medium text-muted-foreground">Nenhum log encontrado</h3>
            <p className="text-xs text-muted-foreground/70 mt-1">
              {hasFilters
                ? 'Tente ajustar os filtros'
                : 'Os logs aparecerão conforme as integrações forem utilizadas'}
            </p>
          </div>
        ) : (
          <div className="max-h-[calc(100vh-22rem)] overflow-y-auto">
            {logs.map((log) => (
              <LogRow key={log.id} log={log} />
            ))}

            {/* Sentinel + footer */}
            <div ref={sentinelRef} className="py-4 flex items-center justify-center">
              {isFetchingNextPage ? (
                <span className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Loader2 className="w-3.5 h-3.5 animate-spin" /> Carregando mais...
                </span>
              ) : hasNextPage ? (
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-xs h-7"
                  onClick={() => fetchNextPage()}
                >
                  Carregar mais
                </Button>
              ) : (
                <span className="text-xs text-muted-foreground/60">
                  Você chegou ao fim — {logs.length} logs
                </span>
              )}
            </div>
          </div>
        )}
      </div>
    </PageShell>
  );
}
