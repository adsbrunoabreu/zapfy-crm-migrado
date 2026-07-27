import { useEffect, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Cpu, Save } from 'lucide-react';
import { toast } from 'sonner';

interface WorkerConfig {
  max_batch: number;
  concurrency: number;
  max_per_company: number;
  enabled: boolean;
  updated_at?: string;
}

const clamp = (v: number, min: number, max: number) =>
  Math.max(min, Math.min(max, Number.isFinite(v) ? v : min));

export function StoreWorkerConfigPanel() {
  const qc = useQueryClient();
  const [draft, setDraft] = useState<WorkerConfig | null>(null);

  const { data } = useQuery({
    queryKey: ['store-worker-config'],
    refetchInterval: 30_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('store_worker_config' as never)
        .select('*').eq('id', true).maybeSingle();
      if (error) throw error;
      return data as unknown as WorkerConfig;
    },
  });

  useEffect(() => { if (data && !draft) setDraft(data); }, [data, draft]);

  const save = useMutation({
    mutationFn: async (next: WorkerConfig) => {
      const payload = {
        max_batch: clamp(next.max_batch, 1, 100),
        concurrency: clamp(next.concurrency, 1, 20),
        max_per_company: clamp(next.max_per_company, 1, 50),
        enabled: next.enabled,
        updated_at: new Date().toISOString(),
      };
      const { error } = await supabase
        .from('store_worker_config' as never)
        .update(payload as never).eq('id', true as never);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success('Configuração do worker atualizada');
      qc.invalidateQueries({ queryKey: ['store-worker-config'] });
    },
    onError: (e: any) => toast.error(e?.message ?? 'Falha ao salvar'),
  });

  if (!draft) {
    return <Card className="p-4 bg-background border-border text-muted-foreground/80 text-sm">Carregando…</Card>;
  }

  const dirty =
    !!data && (
      draft.max_batch !== data.max_batch ||
      draft.concurrency !== data.concurrency ||
      draft.max_per_company !== data.max_per_company ||
      draft.enabled !== data.enabled
    );

  return (
    <Card className="p-4 bg-background border-border space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Cpu className="w-4 h-4 text-muted-foreground" />
          <h3 className="text-sm font-semibold text-foreground">Capacidade do Worker (Loja)</h3>
        </div>
        <div className="flex items-center gap-2">
          <Label htmlFor="ww-enabled" className="text-xs text-muted-foreground">Worker ativo</Label>
          <Switch
            id="ww-enabled"
            checked={draft.enabled}
            onCheckedChange={(v) => setDraft({ ...draft, enabled: v })}
          />
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">Jobs por tick (max_batch)</Label>
          <Input
            type="number" min={1} max={100}
            value={draft.max_batch}
            onChange={(e) => setDraft({ ...draft, max_batch: Number(e.target.value) })}
          />
          <p className="text-[11px] text-muted-foreground/80">Total de jobs processados por execução do worker (1–100).</p>
        </div>
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">Concorrência (workers paralelos)</Label>
          <Input
            type="number" min={1} max={20}
            value={draft.concurrency}
            onChange={(e) => setDraft({ ...draft, concurrency: Number(e.target.value) })}
          />
          <p className="text-[11px] text-muted-foreground/80">Quantos jobs rodam ao mesmo tempo dentro do tick (1–20).</p>
        </div>
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">Máx. por empresa por tick</Label>
          <Input
            type="number" min={1} max={50}
            value={draft.max_per_company}
            onChange={(e) => setDraft({ ...draft, max_per_company: Number(e.target.value) })}
          />
          <p className="text-[11px] text-muted-foreground/80">Garante fairness entre empresas (1–50).</p>
        </div>
      </div>

      <div className="flex items-center justify-between pt-2 border-t border-border">
        <span className="text-[11px] text-muted-foreground/80">
          {data?.updated_at ? `Atualizado em ${new Date(data.updated_at).toLocaleString('pt-BR')}` : ''}
        </span>
        <Button
          size="sm"
          disabled={!dirty || save.isPending}
          onClick={() => save.mutate(draft)}
        >
          <Save className="w-3.5 h-3.5 mr-1" />
          {save.isPending ? 'Salvando…' : 'Salvar configuração'}
        </Button>
      </div>
    </Card>
  );
}
