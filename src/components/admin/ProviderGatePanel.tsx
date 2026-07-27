import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Switch } from '@/components/ui/switch';
import { ShieldAlert, ShieldCheck, ShieldQuestion, Zap } from 'lucide-react';
import { toast } from 'sonner';

interface RateConfig {
  id: string; provider: string;
  tokens_per_sec: number; bucket_capacity: number;
  failure_threshold: number; open_seconds: number;
  enabled: boolean;
}
interface CircuitState {
  company_id: string; provider: string;
  status: 'closed' | 'open' | 'half_open';
  consecutive_failures: number;
  next_attempt_at: string | null;
  total_allowed: number; total_throttled: number;
  total_short_circuited: number; total_failures: number;
  last_error: string | null; updated_at: string;
}

const statusBadge = (s: CircuitState['status']) =>
  s === 'open' ? <Badge variant="destructive"><ShieldAlert className="w-3 h-3 mr-1" />aberto</Badge>
  : s === 'half_open' ? <Badge variant="secondary"><ShieldQuestion className="w-3 h-3 mr-1" />half-open</Badge>
  : <Badge variant="outline" className="text-emerald-500 border-emerald-500/30"><ShieldCheck className="w-3 h-3 mr-1" />fechado</Badge>;

export function ProviderGatePanel() {
  const qc = useQueryClient();

  const { data: configs = [] } = useQuery({
    queryKey: ['provider-rate-limits'],
    refetchInterval: 30000,
    queryFn: async () => {
      const { data } = await supabase
        .from('provider_rate_limits' as never)
        .select('*').order('provider').limit(50);
      return (data ?? []) as RateConfig[];
    },
  });

  const { data: states = [] } = useQuery({
    queryKey: ['provider-circuit-state'],
    refetchInterval: 5000,
    queryFn: async () => {
      const { data } = await supabase
        .from('provider_circuit_state' as never)
        .select('*').order('updated_at', { ascending: false }).limit(100);
      return (data ?? []) as CircuitState[];
    },
  });

  const update = useMutation({
    mutationFn: async (p: Partial<RateConfig> & { id: string }) => {
      const { id, ...rest } = p;
      const { error } = await (supabase.from('provider_rate_limits' as never) as any)
        .update(rest).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success('Configuração atualizada');
      qc.invalidateQueries({ queryKey: ['provider-rate-limits'] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const open = states.filter((s) => s.status !== 'closed');

  return (
    <Card className="p-4 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold flex items-center gap-2">
            <Zap className="w-4 h-4" /> Rate limit e circuit breakers
          </h3>
          <p className="text-xs text-muted-foreground">
            Token-bucket por empresa + breaker que abre após N falhas consecutivas.
          </p>
        </div>
        {open.length > 0 && (
          <Badge variant="destructive">{open.length} circuito(s) não-fechados</Badge>
        )}
      </div>

      {/* Config global por provedor */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {configs.map((c) => (
          <Card key={c.id} className="p-3 bg-secondary/30">
            <div className="flex items-center justify-between mb-2">
              <span className="font-mono text-sm capitalize">{c.provider}</span>
              <Switch checked={c.enabled} onCheckedChange={(v) => update.mutate({ id: c.id, enabled: v })} />
            </div>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <label className="space-y-0.5">
                <span className="text-muted-foreground">req/s</span>
                <Input type="number" step="0.1" min={0.1} className="h-7" defaultValue={c.tokens_per_sec}
                  onBlur={(e) => {
                    const v = Number(e.target.value);
                    if (v !== c.tokens_per_sec && v > 0) update.mutate({ id: c.id, tokens_per_sec: v });
                  }} />
              </label>
              <label className="space-y-0.5">
                <span className="text-muted-foreground">capacidade</span>
                <Input type="number" min={1} className="h-7" defaultValue={c.bucket_capacity}
                  onBlur={(e) => {
                    const v = Number(e.target.value);
                    if (v !== c.bucket_capacity && v > 0) update.mutate({ id: c.id, bucket_capacity: v });
                  }} />
              </label>
              <label className="space-y-0.5">
                <span className="text-muted-foreground">limiar falhas</span>
                <Input type="number" min={1} className="h-7" defaultValue={c.failure_threshold}
                  onBlur={(e) => {
                    const v = Number(e.target.value);
                    if (v !== c.failure_threshold && v > 0) update.mutate({ id: c.id, failure_threshold: v });
                  }} />
              </label>
              <label className="space-y-0.5">
                <span className="text-muted-foreground">aberto (s)</span>
                <Input type="number" min={5} className="h-7" defaultValue={c.open_seconds}
                  onBlur={(e) => {
                    const v = Number(e.target.value);
                    if (v !== c.open_seconds && v >= 5) update.mutate({ id: c.id, open_seconds: v });
                  }} />
              </label>
            </div>
          </Card>
        ))}
      </div>

      {/* Estado por (empresa, provedor) */}
      <div>
        <div className="text-xs text-muted-foreground mb-1">
          Estado ao vivo · {states.length} pares (empresa × provedor)
        </div>
        <Card className="p-0 overflow-hidden">
          <ScrollArea className="h-[260px]">
            <table className="w-full text-xs">
              <thead className="text-muted-foreground border-b border-border bg-secondary/30 sticky top-0">
                <tr>
                  <th className="text-left p-2">Empresa</th>
                  <th className="text-left p-2">Provedor</th>
                  <th className="text-left p-2">Status</th>
                  <th className="text-right p-2">Permitidas</th>
                  <th className="text-right p-2">Limitadas</th>
                  <th className="text-right p-2">Curto-circuito</th>
                  <th className="text-right p-2">Falhas</th>
                  <th className="text-left p-2">Próx. tentativa</th>
                  <th className="text-left p-2">Último erro</th>
                </tr>
              </thead>
              <tbody>
                {states.map((s) => (
                  <tr key={`${s.company_id}-${s.provider}`} className="border-b border-border/40">
                    <td className="p-2 font-mono">{s.company_id.slice(0, 8)}</td>
                    <td className="p-2 capitalize">{s.provider}</td>
                    <td className="p-2">{statusBadge(s.status)}</td>
                    <td className="p-2 text-right">{s.total_allowed}</td>
                    <td className="p-2 text-right">{s.total_throttled}</td>
                    <td className="p-2 text-right">{s.total_short_circuited}</td>
                    <td className="p-2 text-right text-destructive">{s.total_failures}</td>
                    <td className="p-2 text-muted-foreground">
                      {s.next_attempt_at ? new Date(s.next_attempt_at).toLocaleTimeString('pt-BR') : '—'}
                    </td>
                    <td className="p-2 truncate max-w-[220px] text-destructive" title={s.last_error ?? ''}>
                      {s.last_error ?? ''}
                    </td>
                  </tr>
                ))}
                {states.length === 0 && (
                  <tr><td colSpan={9} className="p-4 text-center text-muted-foreground">
                    Nenhum tráfego registrado ainda. ✨
                  </td></tr>
                )}
              </tbody>
            </table>
          </ScrollArea>
        </Card>
      </div>
    </Card>
  );
}
