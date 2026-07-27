import { useEffect, useMemo, useState } from 'react';
import { Activity, Search, RefreshCw } from 'lucide-react';
import { PageShell } from '@/components/layout/PageShell';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { useQuery } from '@tanstack/react-query';
import { useMessageAuditList, type AuditMessageRow, type AuditFilters } from '@/hooks/useMessageAudit';
import { MessageAuditList } from '@/components/admin/audit/MessageAuditList';
import { MessageAuditTimeline } from '@/components/admin/audit/MessageAuditTimeline';

const RANGE_OPTIONS = [
  { label: 'Últimas 24h', value: '24h' },
  { label: 'Últimos 7 dias', value: '7d' },
  { label: 'Últimos 30 dias', value: '30d' },
  { label: 'Tudo', value: 'all' },
];

const STATUS_OPTIONS = ['pending', 'sent', 'delivered', 'read', 'failed', 'error'];
const DIRECTION_OPTIONS = [
  { value: 'all', label: 'Todas' },
  { value: 'out', label: 'Enviadas' },
  { value: 'in', label: 'Recebidas' },
];

function rangeToFromTs(range: string): string | undefined {
  const now = Date.now();
  if (range === '24h') return new Date(now - 24 * 3600_000).toISOString();
  if (range === '7d') return new Date(now - 7 * 24 * 3600_000).toISOString();
  if (range === '30d') return new Date(now - 30 * 24 * 3600_000).toISOString();
  return undefined;
}

export default function AdminMessageAudit() {
  const { isMaster, profile } = useAuth();
  const [companyId, setCompanyId] = useState<string | undefined>(undefined);
  const [range, setRange] = useState('24h');
  const [status, setStatus] = useState<string>('all');
  const [direction, setDirection] = useState<string>('all');
  const [search, setSearch] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [selected, setSelected] = useState<AuditMessageRow | null>(null);

  // Master companies list
  const companiesQ = useQuery({
    queryKey: ['audit-companies'],
    enabled: isMaster,
    staleTime: 1000 * 60 * 5,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('companies')
        .select('id, name')
        .order('name')
        .limit(500);
      if (error) throw error;
      return data ?? [];
    },
  });

  // Lock company for non-master
  useEffect(() => {
    if (!isMaster && profile?.company_id) {
      setCompanyId(profile.company_id);
    }
  }, [isMaster, profile?.company_id]);

  const filters: AuditFilters = useMemo(
    () => ({
      companyId,
      fromTs: rangeToFromTs(range),
      status: status === 'all' ? undefined : status,
      direction: direction === 'all' ? undefined : (direction as 'in' | 'out'),
      search: search || undefined,
      limit: 100,
    }),
    [companyId, range, status, direction, search]
  );

  const listQ = useMessageAuditList(filters);

  const onSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setSearch(searchInput.trim());
  };

  return (
    <PageShell
      icon={<Activity className="w-5 h-5" />}
      title="Auditoria de Mensagens"
      subtitle="Linha do tempo completa de cada mensagem (envio, persistência e ACKs sent/delivered/read) por empresa, lead ou conversa."
      actions={
        <Button variant="outline" size="sm" onClick={() => listQ.refetch()} disabled={listQ.isFetching}>
          <RefreshCw className={`w-3.5 h-3.5 mr-1.5 ${listQ.isFetching ? 'animate-spin' : ''}`} />
          Atualizar
        </Button>
      }
    >
      <div className="space-y-4">
        {/* Filters */}
        <div className="border border-border rounded-lg p-3 bg-muted/20 grid grid-cols-1 md:grid-cols-12 gap-2">
          {isMaster && (
            <div className="md:col-span-3">
              <Select value={companyId ?? ''} onValueChange={(v) => setCompanyId(v || undefined)}>
                <SelectTrigger className="h-9">
                  <SelectValue placeholder="Selecione a empresa" />
                </SelectTrigger>
                <SelectContent>
                  {(companiesQ.data ?? []).map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          <div className="md:col-span-2">
            <Select value={range} onValueChange={setRange}>
              <SelectTrigger className="h-9">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {RANGE_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="md:col-span-2">
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger className="h-9">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os status</SelectItem>
                {STATUS_OPTIONS.map((s) => (
                  <SelectItem key={s} value={s}>
                    {s}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="md:col-span-2">
            <Select value={direction} onValueChange={setDirection}>
              <SelectTrigger className="h-9">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {DIRECTION_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <form onSubmit={onSearch} className="md:col-span-3 flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
              <Input
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                placeholder="Texto, message_id ou provider_message_id"
                className="h-9 pl-7"
              />
            </div>
            <Button type="submit" size="sm" variant="secondary">Buscar</Button>
          </form>
        </div>

        {!companyId ? (
          <div className="border border-border rounded-lg p-10 text-center text-sm text-muted-foreground">
            Selecione uma empresa para ver a auditoria.
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-5 gap-3">
            <div className="lg:col-span-2 border border-border rounded-lg overflow-hidden bg-background">
              <div className="px-3 py-2 border-b border-border flex items-center justify-between">
                <span className="text-xs font-medium">Mensagens</span>
                <span className="text-[10px] text-muted-foreground">
                  {listQ.data?.[0]?.total_count ?? listQ.data?.length ?? 0} encontradas
                </span>
              </div>
              <MessageAuditList
                rows={listQ.data ?? []}
                loading={listQ.isLoading}
                selectedId={selected?.id ?? null}
                onSelect={setSelected}
              />
            </div>
            <div className="lg:col-span-3 border border-border rounded-lg p-3 bg-background">
              <MessageAuditTimeline message={selected} />
            </div>
          </div>
        )}
      </div>
    </PageShell>
  );
}
