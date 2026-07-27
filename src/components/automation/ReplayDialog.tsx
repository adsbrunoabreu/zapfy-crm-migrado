import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, Play, RotateCw, CheckCircle2, XCircle, AlertTriangle, Send, Ban } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

type Kind = 'off_hours' | 'welcome' | 'wait_time';
type Step = { step: string; ok: boolean; detail?: string; meta?: Record<string, unknown> };
type ReplayResult = {
  dry_run: boolean;
  would_send: boolean;
  executed: boolean;
  execution_result?: any;
  steps: Step[];
  flags: { off_hours_enabled: boolean; welcome_enabled: boolean; wait_time_enabled: boolean };
};

const STEP_LABEL: Record<string, string> = {
  conversation: 'Conversa válida',
  company_active: 'Plano da empresa ativo',
  feature_enabled: 'Automação ativada',
  off_business_hours: 'Fora do horário comercial',
  recent_duplicate: 'Anti-duplicação (6h)',
  message_body: 'Corpo da mensagem',
  whatsapp_instance: 'Instância WhatsApp',
};

interface Props {
  conversationId: string;
  conversationLabel?: string;
  defaultKind?: Kind;
  pendingQueueId?: string | null;
  onClose: () => void;
  onAfterAction?: () => void;
}

export function ReplayDialog({ conversationId, conversationLabel, defaultKind = 'off_hours', pendingQueueId, onClose, onAfterAction }: Props) {
  const [kind, setKind] = useState<Kind>(defaultKind);
  const [result, setResult] = useState<ReplayResult | null>(null);

  const dryRun = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke('replay-attendance-auto', {
        body: { conversation_id: conversationId, kind, dry_run: true },
      });
      if (error) throw error;
      return data as ReplayResult;
    },
    onSuccess: (data) => setResult(data),
    onError: (e: any) => toast.error(e?.message || 'Falha ao simular'),
  });

  const execute = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke('replay-attendance-auto', {
        body: { conversation_id: conversationId, kind, dry_run: false },
      });
      if (error) throw error;
      return data as ReplayResult;
    },
    onSuccess: (data) => {
      setResult(data);
      if (data.executed) {
        toast.success('Mensagem reenviada com sucesso');
        onAfterAction?.();
      } else {
        toast.warning('Execução bloqueada — veja as decisões');
      }
    },
    onError: (e: any) => toast.error(e?.message || 'Falha ao executar'),
  });

  const cancelQueue = useMutation({
    mutationFn: async () => {
      if (!pendingQueueId) throw new Error('Sem item na fila');
      const { data, error } = await supabase.rpc('cancel_attendance_queue_item', {
        _queue_id: pendingQueueId,
        _reason: 'Cancelado manualmente via Replay UI',
      });
      if (error) throw error;
      return data;
    },
    onSuccess: (data: any) => {
      if (data?.ok) {
        toast.success('Item cancelado');
        onAfterAction?.();
        onClose();
      } else {
        toast.error(`Não foi possível cancelar: ${data?.error || 'erro'}`);
      }
    },
    onError: (e: any) => toast.error(e?.message || 'Falha ao cancelar'),
  });

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl bg-background border-border">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <RotateCw className="w-4 h-4" /> Replay de automação
          </DialogTitle>
          <DialogDescription className="text-xs">
            {conversationLabel || conversationId.slice(0, 12)} — simule o fluxo passo-a-passo antes de reenviar
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">Tipo:</span>
          <Select value={kind} onValueChange={(v) => { setKind(v as Kind); setResult(null); }}>
            <SelectTrigger className="w-[200px] bg-card border-border">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="off_hours">Fora do horário</SelectItem>
              <SelectItem value="welcome">Boas-vindas</SelectItem>
              <SelectItem value="wait_time">Tempo de espera</SelectItem>
            </SelectContent>
          </Select>
          <Button
            size="sm"
            variant="outline"
            onClick={() => dryRun.mutate()}
            disabled={dryRun.isPending}
            className="ml-auto"
          >
            {dryRun.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" /> : <Play className="w-3.5 h-3.5 mr-1.5" />}
            Simular
          </Button>
        </div>

        {pendingQueueId && (
          <div className="rounded border border-amber/30 bg-amber/5 p-2.5 text-xs text-amber flex items-center gap-2">
            <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
            <span className="flex-1">Existe um item na fila aguardando processamento.</span>
            <Button size="sm" variant="outline" className="h-7 border-amber/40 text-amber hover:bg-amber/10" onClick={() => cancelQueue.mutate()} disabled={cancelQueue.isPending}>
              {cancelQueue.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" /> : <Ban className="w-3.5 h-3.5 mr-1.5" />}
              Cancelar item
            </Button>
          </div>
        )}

        {result && (
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-xs">
              <Badge variant="outline" className={cn('border-border', result.would_send ? 'text-emerald bg-emerald/10 border-emerald/30' : 'text-rose bg-rose/10 border-rose/30')}>
                {result.would_send ? '✓ Enviaria' : '✗ Bloquearia'}
              </Badge>
              <span className="text-muted-foreground/80 font-mono">{result.dry_run ? 'dry-run' : (result.executed ? 'executado' : 'não executado')}</span>
            </div>

            <ScrollArea className="h-[280px] border border-border rounded">
              <ul className="divide-y divide-border/60">
                {result.steps.map((s, i) => {
                  const Icon = s.ok ? CheckCircle2 : XCircle;
                  return (
                    <li key={i} className="px-3 py-2 flex items-start gap-2.5">
                      <Icon className={cn('w-4 h-4 shrink-0 mt-0.5', s.ok ? 'text-emerald' : 'text-rose')} />
                      <div className="flex-1 min-w-0">
                        <div className="text-xs font-medium text-foreground">{STEP_LABEL[s.step] ?? s.step}</div>
                        {s.detail && <div className="text-[11px] text-muted-foreground">{s.detail}</div>}
                        {s.meta && Object.keys(s.meta).length > 0 && (
                          <pre className="text-[10px] text-muted-foreground/80 mt-1 font-mono whitespace-pre-wrap break-all">{JSON.stringify(s.meta, null, 0)}</pre>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            </ScrollArea>

            {result.execution_result && (
              <details className="text-[11px]">
                <summary className="text-muted-foreground cursor-pointer">Resposta da execução</summary>
                <pre className="bg-card border border-border rounded p-2 mt-1 text-foreground overflow-auto">{JSON.stringify(result.execution_result, null, 2)}</pre>
              </details>
            )}
          </div>
        )}

        <DialogFooter className="gap-2">
          <Button variant="ghost" onClick={onClose}>Fechar</Button>
          <Button
            onClick={() => execute.mutate()}
            disabled={execute.isPending || !result?.would_send}
            className="bg-emerald hover:bg-emerald"
          >
            {execute.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" /> : <Send className="w-3.5 h-3.5 mr-1.5" />}
            Executar reenvio
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
