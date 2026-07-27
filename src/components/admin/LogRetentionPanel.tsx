import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { useState } from 'react';
import { Archive, Play, RotateCw, Database } from 'lucide-react';

interface Policy {
  id: string;
  table_name: string;
  hot_days: number;
  archive_days: number;
  archive_enabled: boolean;
  enabled: boolean;
  last_run_at: string | null;
  last_moved: number | null;
  last_purged: number | null;
}

export function LogRetentionPanel() {
  const qc = useQueryClient();
  const [running, setRunning] = useState(false);

  const { data: policies = [] } = useQuery({
    queryKey: ['log-retention-policies'],
    queryFn: async () => {
      const { data } = await supabase
        .from('log_retention_policies' as never)
        .select('*')
        .order('table_name')
        .limit(100);
      return (data ?? []) as Policy[];
    },
  });

  const { data: archiveStats } = useQuery({
    queryKey: ['archived-logs-stats'],
    refetchInterval: 30000,
    queryFn: async () => {
      const { count } = await supabase
        .from('archived_logs' as never)
        .select('id', { count: 'exact', head: true });
      return { count: count ?? 0 };
    },
  });

  const update = useMutation({
    mutationFn: async (p: Partial<Policy> & { id: string }) => {
      const { id, ...rest } = p;
      const { error } = await (supabase.from('log_retention_policies' as never) as any)
        .update(rest)
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success('Política atualizada');
      qc.invalidateQueries({ queryKey: ['log-retention-policies'] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const runNow = async () => {
    setRunning(true);
    try {
      const { data, error } = await supabase.functions.invoke('log-retention', { body: {} });
      if (error) throw error;
      const totals = (data as { totals?: { moved: number; purged: number } })?.totals;
      toast.success(`Retenção executada — ${totals?.moved ?? 0} arquivados, ${totals?.purged ?? 0} expurgados`);
      qc.invalidateQueries({ queryKey: ['log-retention-policies'] });
      qc.invalidateQueries({ queryKey: ['archived-logs-stats'] });
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setRunning(false);
    }
  };

  return (
    <Card className="p-4 space-y-3">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h3 className="text-sm font-semibold flex items-center gap-2">
            <Archive className="w-4 h-4" /> Retenção e arquivamento de logs
          </h3>
          <p className="text-xs text-muted-foreground">
            Roda automaticamente todo dia às 03:15 UTC. Registros antigos são movidos para o arquivo e depois excluídos.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="text-xs">
            <Database className="w-3 h-3 mr-1" /> {archiveStats?.count ?? 0} no arquivo
          </Badge>
          <Button size="sm" onClick={runNow} disabled={running}>
            {running ? <RotateCw className="w-3.5 h-3.5 mr-1 animate-spin" /> : <Play className="w-3.5 h-3.5 mr-1" />}
            Executar agora
          </Button>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead className="text-muted-foreground border-b border-border">
            <tr>
              <th className="text-left py-2 pr-3">Tabela</th>
              <th className="text-left py-2 px-2 w-[90px]">Quente (d)</th>
              <th className="text-left py-2 px-2 w-[90px]">Arquivo (d)</th>
              <th className="text-left py-2 px-2 w-[100px]">Arquivar?</th>
              <th className="text-left py-2 px-2 w-[80px]">Ativa?</th>
              <th className="text-left py-2 px-2">Última execução</th>
            </tr>
          </thead>
          <tbody>
            {policies.map((p) => (
              <tr key={p.id} className="border-b border-border/40">
                <td className="py-2 pr-3 font-mono">{p.table_name}</td>
                <td className="py-2 px-2">
                  <Input
                    type="number" min={1} className="h-7 text-xs w-20"
                    defaultValue={p.hot_days}
                    onBlur={(e) => {
                      const v = Number(e.target.value);
                      if (v !== p.hot_days && v > 0) update.mutate({ id: p.id, hot_days: v });
                    }}
                  />
                </td>
                <td className="py-2 px-2">
                  <Input
                    type="number" min={0} className="h-7 text-xs w-20"
                    defaultValue={p.archive_days}
                    onBlur={(e) => {
                      const v = Number(e.target.value);
                      if (v !== p.archive_days && v >= 0) update.mutate({ id: p.id, archive_days: v });
                    }}
                  />
                </td>
                <td className="py-2 px-2">
                  <Switch
                    checked={p.archive_enabled}
                    onCheckedChange={(v) => update.mutate({ id: p.id, archive_enabled: v })}
                  />
                </td>
                <td className="py-2 px-2">
                  <Switch
                    checked={p.enabled}
                    onCheckedChange={(v) => update.mutate({ id: p.id, enabled: v })}
                  />
                </td>
                <td className="py-2 px-2 text-muted-foreground">
                  {p.last_run_at
                    ? `${new Date(p.last_run_at).toLocaleString('pt-BR')} · ${p.last_moved ?? 0}↓ ${p.last_purged ?? 0}✕`
                    : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
