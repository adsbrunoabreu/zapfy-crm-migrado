import { useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Loader2, History, RotateCcw, FileDown, Upload, ChevronRight, FileJson } from 'lucide-react';
import { format, formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { useToast } from '@/hooks/use-toast';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';

interface HistoryRow {
  id: string;
  agent_id: string;
  instance_id?: string | null;
  pipeline_id?: string | null;
  version: number;
  snapshot: Record<string, any>;
  change_summary: string | null;
  changed_by: string | null;
  changed_by_name: string | null;
  created_at: string;
}

const RESTORABLE_FIELDS = [
  'name','emoji','persona','tone','system_prompt','model','is_active','business_hours_only',
  'max_turns','handoff_keywords','response_delay_ms','debounce_seconds','kb_document_ids',
  'qualification_questions','collect_fields','available_hours','offer_timing','offer_scheduling',
  'auto_confirmation','reminder_enabled','send_discount_coupon','detect_negative_sentiment',
  'qualification_criteria','transfer_stage_id',
] as const;

interface Props {
  agentId: string | null;
  agentName?: string;
}

export default function AiAgentHistory({ agentId, agentName }: Props) {
  const { profile } = useAuth();
  const companyId = profile?.company_id;
  const qc = useQueryClient();
  const { toast } = useToast();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [confirmRestore, setConfirmRestore] = useState<HistoryRow | null>(null);

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ['ai-agent-history', agentId],
    enabled: !!agentId,
    staleTime: 30_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('ai_agent_history' as any)
        .select('*')
        .eq('agent_id', agentId!)
        .order('version', { ascending: false })
        .limit(100);
      if (error) throw error;
      return (data || []) as unknown as HistoryRow[];
    },
  });

  const selected = useMemo(
    () => rows.find((r) => r.id === selectedId) || rows[0] || null,
    [rows, selectedId]
  );

  const restore = useMutation({
    mutationFn: async (row: HistoryRow) => {
      if (!agentId) throw new Error('Agente não selecionado');
      const snap = row.snapshot || {};
      const payload: Record<string, any> = {};
      RESTORABLE_FIELDS.forEach((k) => {
        if (k in snap) payload[k] = (snap as any)[k];
      });
      const { error } = await supabase.from('ai_agents').update(payload).eq('id', agentId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast({ title: 'Versão restaurada', description: 'A configuração anterior foi aplicada.' });
      qc.invalidateQueries({ queryKey: ['ai-agents', companyId] });
      qc.invalidateQueries({ queryKey: ['ai-agent-history', agentId] });
      setConfirmRestore(null);
    },
    onError: (e: any) => toast({ title: 'Erro ao restaurar', description: e.message, variant: 'destructive' }),
  });

  const handleExport = () => {
    if (!selected) return;
    const blob = new Blob([JSON.stringify(selected.snapshot, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `agente-${agentName || agentId}-v${selected.version}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleImport = async (file: File) => {
    if (!agentId) return;
    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      const payload: Record<string, any> = {};
      RESTORABLE_FIELDS.forEach((k) => {
        if (k in parsed) payload[k] = parsed[k];
      });
      if (Object.keys(payload).length === 0) {
        throw new Error('Arquivo não contém campos válidos');
      }
      const { error } = await supabase.from('ai_agents').update(payload).eq('id', agentId);
      if (error) throw error;
      toast({ title: 'Configuração importada', description: 'Aplicada com sucesso.' });
      qc.invalidateQueries({ queryKey: ['ai-agents', companyId] });
      qc.invalidateQueries({ queryKey: ['ai-agent-history', agentId] });
    } catch (e: any) {
      toast({ title: 'Falha na importação', description: e.message, variant: 'destructive' });
    }
  };

  if (!agentId) {
    return (
      <Card className="p-6 text-center text-sm text-muted-foreground">
        Salve um agente primeiro para visualizar o histórico.
      </Card>
    );
  }

  if (isLoading) {
    return (
      <Card className="p-6 flex items-center justify-center">
        <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
      </Card>
    );
  }

  if (rows.length === 0) {
    return (
      <Card className="p-6 text-center text-sm text-muted-foreground">
        Sem histórico ainda. As alterações no agente serão registradas automaticamente aqui.
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      <Card className="p-4 flex items-start justify-between gap-3 bg-violet/5 border-violet/20">
        <div className="flex items-start gap-3">
          <History className="w-5 h-5 text-violet shrink-0 mt-0.5" />
          <div className="text-sm">
            <p className="font-medium">Histórico de configuração</p>
            <p className="text-xs text-muted-foreground mt-1">
              Cada alteração gera um snapshot. Você pode restaurar uma versão anterior, exportar
              ou importar configurações em JSON.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <Button size="sm" variant="outline" onClick={handleExport} disabled={!selected}>
            <FileDown className="w-3.5 h-3.5 mr-1.5" />
            Exportar
          </Button>
          <label>
            <input
              type="file"
              accept="application/json,.json"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handleImport(f);
                e.currentTarget.value = '';
              }}
            />
            <Button size="sm" variant="outline" asChild>
              <span className="cursor-pointer">
                <Upload className="w-3.5 h-3.5 mr-1.5" />
                Importar
              </span>
            </Button>
          </label>
        </div>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-[1fr_1.4fr] gap-3">
        <ScrollArea className="h-[480px]">
          <div className="space-y-1.5 pr-2">
            {rows.map((r) => (
              <button
                key={r.id}
                onClick={() => setSelectedId(r.id)}
                className={`w-full text-left p-2.5 rounded-md border transition-colors ${
                  selected?.id === r.id ? 'bg-violet/10 border-violet/30' : 'hover:bg-muted/40 border-border'
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <Badge variant="outline" className="text-[10px]">v{r.version}</Badge>
                  <ChevronRight className="w-3 h-3 text-muted-foreground" />
                </div>
                <p className="text-xs font-medium mt-1.5 line-clamp-1">
                  {r.change_summary || 'Atualização'}
                </p>
                <p className="text-[11px] text-muted-foreground mt-0.5">
                  {r.changed_by_name || 'Sistema'} · {formatDistanceToNow(new Date(r.created_at), { locale: ptBR, addSuffix: true })}
                </p>
              </button>
            ))}
          </div>
        </ScrollArea>

        <Card className="p-4 h-[480px] overflow-auto">
          {!selected ? (
            <div className="h-full flex items-center justify-center text-xs text-muted-foreground">
              Selecione uma versão para visualizar.
            </div>
          ) : (
            <div className="space-y-3 text-xs">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium text-sm flex items-center gap-2">
                    <FileJson className="w-3.5 h-3.5 text-violet" />
                    Versão {selected.version}
                  </p>
                  <p className="text-[11px] text-muted-foreground mt-0.5">
                    {format(new Date(selected.created_at), "dd/MM/yyyy HH:mm:ss", { locale: ptBR })} ·
                    {' '}{selected.changed_by_name || 'Sistema'}
                  </p>
                </div>
                <Button
                  size="sm" variant="outline"
                  onClick={() => setConfirmRestore(selected)}
                  disabled={selected.version === rows[0].version}
                >
                  <RotateCcw className="w-3.5 h-3.5 mr-1.5" />
                  Restaurar esta versão
                </Button>
              </div>
              <pre className="whitespace-pre-wrap bg-muted/40 rounded-md p-3 text-[11px] max-h-[360px] overflow-auto">
                {JSON.stringify(selected.snapshot, null, 2)}
              </pre>
            </div>
          )}
        </Card>
      </div>

      <AlertDialog open={!!confirmRestore} onOpenChange={(o) => !o && setConfirmRestore(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Restaurar versão v{confirmRestore?.version}?</AlertDialogTitle>
            <AlertDialogDescription>
              A configuração atual será substituída pela versão{' '}
              <strong>v{confirmRestore?.version}</strong> de{' '}
              {confirmRestore && format(new Date(confirmRestore.created_at), "dd/MM HH:mm", { locale: ptBR })}.
              Uma nova entrada de histórico será criada (você poderá reverter de volta).
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={restore.isPending}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                if (confirmRestore) restore.mutate(confirmRestore);
              }}
              disabled={restore.isPending}
            >
              {restore.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
              Restaurar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
