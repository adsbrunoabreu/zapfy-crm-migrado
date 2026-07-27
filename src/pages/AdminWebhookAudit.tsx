import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Webhook, RefreshCw, Search, Copy, Check } from 'lucide-react';
import { PageShell } from '@/components/layout/PageShell';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

type AuditRow = {
  id: string;
  company_id: string;
  instance_id: string | null;
  instance_name: string | null;
  provider: string;
  event_type: string;
  normalized_event: string | null;
  status: 'received' | 'processed' | 'failed' | 'ignored';
  error_message: string | null;
  external_message_id: string | null;
  raw_body: any;
  duration_ms: number | null;
  created_at: string;
};

const RANGE_OPTIONS = [
  { label: 'Últimas 24h', value: '24h' },
  { label: 'Últimos 7 dias', value: '7d' },
  { label: 'Últimos 30 dias', value: '30d' },
  { label: 'Tudo', value: 'all' },
];

const STATUS_OPTIONS = ['all', 'received', 'processed', 'failed', 'ignored'];

function rangeToFromIso(range: string): string | undefined {
  const now = Date.now();
  if (range === '24h') return new Date(now - 24 * 3600_000).toISOString();
  if (range === '7d') return new Date(now - 7 * 24 * 3600_000).toISOString();
  if (range === '30d') return new Date(now - 30 * 24 * 3600_000).toISOString();
  return undefined;
}

function statusVariant(s: AuditRow['status']) {
  switch (s) {
    case 'processed':
      return 'default';
    case 'failed':
      return 'destructive';
    case 'ignored':
      return 'secondary';
    default:
      return 'outline';
  }
}

export default function AdminWebhookAudit() {
  const [range, setRange] = useState('24h');
  const [provider, setProvider] = useState<string>('all');
  const [status, setStatus] = useState<string>('all');
  const [instance, setInstance] = useState('');
  const [selected, setSelected] = useState<AuditRow | null>(null);
  const [copied, setCopied] = useState(false);

  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ['webhook-audit', range, provider, status, instance],
    queryFn: async () => {
      let q = supabase
        .from('webhook_audit')
        .select(
          'id, company_id, instance_id, instance_name, provider, event_type, normalized_event, status, error_message, external_message_id, raw_body, duration_ms, created_at',
        )
        .order('created_at', { ascending: false })
        .limit(200);

      const fromIso = rangeToFromIso(range);
      if (fromIso) q = q.gte('created_at', fromIso);
      if (provider !== 'all') q = q.eq('provider', provider);
      if (status !== 'all') q = q.eq('status', status as AuditRow['status']);
      if (instance.trim()) q = q.ilike('instance_name', `%${instance.trim()}%`);

      const { data, error } = await q;
      if (error) throw error;
      return (data || []) as AuditRow[];
    },
    staleTime: 30_000,
  });

  const providers = useMemo(() => {
    const set = new Set<string>(['evolution', 'meta_cloud', 'shopify', 'asaas']);
    (data || []).forEach((r) => set.add(r.provider));
    return Array.from(set);
  }, [data]);

  const copyJson = async () => {
    if (!selected) return;
    try {
      await navigator.clipboard.writeText(JSON.stringify(selected.raw_body, null, 2));
      setCopied(true);
      toast.success('JSON copiado');
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error('Falha ao copiar');
    }
  };

  return (
    <PageShell
      title="Auditoria de Webhooks"
      subtitle="Eventos brutos recebidos por webhooks (Evolution, Meta, Shopify, Asaas)."
      icon={<Webhook className="w-5 h-5" />}
    >
      <div className="space-y-4">
        <div className="flex flex-wrap items-end gap-3 rounded-lg border border-zinc-800 bg-zinc-950 p-3">
          <div className="flex-1 min-w-[180px]">
            <label className="text-xs text-zinc-400 mb-1 block">Instância</label>
            <div className="relative">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-500" />
              <Input
                value={instance}
                onChange={(e) => setInstance(e.target.value)}
                placeholder="Buscar por instance_name…"
                className="pl-8"
              />
            </div>
          </div>
          <div className="w-[160px]">
            <label className="text-xs text-zinc-400 mb-1 block">Período</label>
            <Select value={range} onValueChange={setRange}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {RANGE_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="w-[160px]">
            <label className="text-xs text-zinc-400 mb-1 block">Provedor</label>
            <Select value={provider} onValueChange={setProvider}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                {providers.map((p) => (
                  <SelectItem key={p} value={p}>{p}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="w-[160px]">
            <label className="text-xs text-zinc-400 mb-1 block">Status</label>
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {STATUS_OPTIONS.map((s) => (
                  <SelectItem key={s} value={s}>{s === 'all' ? 'Todos' : s}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
            <RefreshCw className={`h-4 w-4 mr-1 ${isFetching ? 'animate-spin' : ''}`} />
            Atualizar
          </Button>
        </div>

        <div className="rounded-lg border border-zinc-800 bg-zinc-950 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-zinc-900/50 text-zinc-400">
              <tr>
                <th className="text-left font-medium px-3 py-2">Quando</th>
                <th className="text-left font-medium px-3 py-2">Provedor</th>
                <th className="text-left font-medium px-3 py-2">Instância</th>
                <th className="text-left font-medium px-3 py-2">Evento</th>
                <th className="text-left font-medium px-3 py-2">Status</th>
                <th className="text-left font-medium px-3 py-2">External ID</th>
              </tr>
            </thead>
            <tbody>
              {isLoading && (
                <tr><td colSpan={6} className="px-3 py-6 text-center text-zinc-500">Carregando…</td></tr>
              )}
              {!isLoading && (data || []).length === 0 && (
                <tr><td colSpan={6} className="px-3 py-6 text-center text-zinc-500">Nenhum evento no período.</td></tr>
              )}
              {(data || []).map((row) => (
                <tr
                  key={row.id}
                  className="border-t border-zinc-800 hover:bg-zinc-900/40 cursor-pointer"
                  onClick={() => setSelected(row)}
                >
                  <td className="px-3 py-2 text-zinc-300 whitespace-nowrap">
                    {new Date(row.created_at).toLocaleString('pt-BR')}
                  </td>
                  <td className="px-3 py-2 text-zinc-300">{row.provider}</td>
                  <td className="px-3 py-2 text-zinc-300">{row.instance_name || '—'}</td>
                  <td className="px-3 py-2">
                    <div className="text-zinc-200">{row.normalized_event || row.event_type}</div>
                    {row.normalized_event && row.event_type !== row.normalized_event && (
                      <div className="text-xs text-zinc-500">{row.event_type}</div>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    <Badge variant={statusVariant(row.status) as any}>{row.status}</Badge>
                  </td>
                  <td className="px-3 py-2 text-zinc-400 font-mono text-xs">
                    {row.external_message_id || '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <p className="text-xs text-zinc-500">
          Mostrando até 200 eventos mais recentes. Clique em uma linha para ver o JSON completo.
        </p>
      </div>

      <Sheet open={!!selected} onOpenChange={(o) => !o && setSelected(null)}>
        <SheetContent className="w-full sm:max-w-2xl overflow-y-auto">
          <SheetHeader>
            <SheetTitle>Payload do webhook</SheetTitle>
            <SheetDescription>
              {selected && (
                <>
                  {selected.provider} · {selected.normalized_event || selected.event_type} ·{' '}
                  {new Date(selected.created_at).toLocaleString('pt-BR')}
                </>
              )}
            </SheetDescription>
          </SheetHeader>
          {selected && (
            <div className="mt-4 space-y-3">
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div><span className="text-zinc-500">Instância: </span><span className="text-zinc-200">{selected.instance_name || '—'}</span></div>
                <div><span className="text-zinc-500">Status: </span><Badge variant={statusVariant(selected.status) as any}>{selected.status}</Badge></div>
                <div className="col-span-2"><span className="text-zinc-500">External ID: </span><span className="text-zinc-200 font-mono">{selected.external_message_id || '—'}</span></div>
                {selected.error_message && (
                  <div className="col-span-2 text-red-400">
                    <span className="text-zinc-500">Erro: </span>{selected.error_message}
                  </div>
                )}
              </div>
              <div className="flex justify-end">
                <Button size="sm" variant="outline" onClick={copyJson}>
                  {copied ? <Check className="h-4 w-4 mr-1" /> : <Copy className="h-4 w-4 mr-1" />}
                  Copiar JSON
                </Button>
              </div>
              <pre className="text-xs bg-zinc-950 border border-zinc-800 rounded p-3 overflow-auto max-h-[60vh] whitespace-pre-wrap break-all text-zinc-300">
{JSON.stringify(selected.raw_body, null, 2)}
              </pre>
            </div>
          )}
        </SheetContent>
      </Sheet>
    </PageShell>
  );
}
