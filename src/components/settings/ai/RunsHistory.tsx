import { memo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { BookOpen, CheckCircle2, ChevronRight, Loader2, Mic, XCircle } from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Card } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { supabase } from '@/integrations/supabase/client';
import { CitationsList } from './CitationsList';
import type { KbCitation } from './types';

interface RunRow {
  id: string;
  status: 'done' | 'error' | 'running' | string;
  output_text: string | null;
  tools_called: unknown;
  kb_citations: unknown;
  latency_ms: number | null;
  cost_brl: number | null;
  messages_consumed: number | null;
  had_audio: boolean | null;
  error: string | null;
  created_at: string;
  conversation_id: string | null;
}

function StatBase({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[10px] text-muted-foreground">{label}</p>
      <p className="font-medium">{value}</p>
    </div>
  );
}
const Stat = memo(StatBase);

function RunsHistoryBase({ agentId }: { agentId: string }) {
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const { data: runs = [] } = useQuery({
    queryKey: ['ai-runs', agentId],
    queryFn: async () => {
      const { data } = await supabase
        .from('ai_agent_runs')
        .select('id, status, output_text, tools_called, kb_citations, latency_ms, cost_brl, messages_consumed, had_audio, error, created_at, conversation_id')
        .eq('agent_id', agentId)
        .order('created_at', { ascending: false }).limit(50);
      return (data || []) as RunRow[];
    },
    refetchInterval: 30_000,
    staleTime: 15_000,
  });

  const selected = runs.find((r) => r.id === selectedId);

  if (runs.length === 0) {
    return (
      <Card className="p-6 text-center text-sm text-muted-foreground">
        Nenhuma execução ainda. As respostas do agente aparecerão aqui.
      </Card>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-[1fr_1.2fr] gap-3">
      <ScrollArea className="h-[480px]">
        <div className="space-y-1.5 pr-2">
          {runs.map((r) => (
            <button
              key={r.id}
              onClick={() => setSelectedId(r.id)}
              className={`w-full text-left p-2.5 rounded-md border transition-colors ${
                selectedId === r.id ? 'bg-violet/10 border-violet/30' : 'hover:bg-muted/40 border-border'
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-1.5 text-xs">
                  {r.status === 'done' && <CheckCircle2 className="w-3 h-3 text-emerald" />}
                  {r.status === 'error' && <XCircle className="w-3 h-3 text-destructive" />}
                  {r.status === 'running' && <Loader2 className="w-3 h-3 animate-spin text-violet" />}
                  <span className="font-medium">{r.status}</span>
                  {r.had_audio && <Mic className="w-3 h-3 text-muted-foreground" />}
                </div>
                <ChevronRight className="w-3 h-3 text-muted-foreground" />
              </div>
              <p className="text-[11px] text-muted-foreground mt-1 line-clamp-2">
                {r.output_text || r.error || '(sem saída)'}
              </p>
              <p className="text-[10px] text-muted-foreground mt-1">
                {format(new Date(r.created_at), "dd/MM HH:mm:ss", { locale: ptBR })}
                {' · '}{r.latency_ms || 0}ms
              </p>
            </button>
          ))}
        </div>
      </ScrollArea>

      <Card className="p-4 h-[480px] overflow-auto">
        {!selected ? (
          <div className="h-full flex items-center justify-center text-xs text-muted-foreground">
            Selecione uma execução para ver os detalhes
          </div>
        ) : (
          <div className="space-y-3 text-xs">
            <div>
              <p className="font-medium text-sm mb-1">Resposta enviada</p>
              <pre className="whitespace-pre-wrap bg-muted/40 rounded-md p-2 text-[11px]">
                {selected.output_text || '(vazio)'}
              </pre>
            </div>
            {selected.error && (
              <div>
                <p className="font-medium text-sm mb-1 text-destructive">Erro</p>
                <pre className="whitespace-pre-wrap bg-destructive/10 rounded-md p-2 text-[11px] text-destructive">
                  {selected.error}
                </pre>
              </div>
            )}
            {Array.isArray(selected.tools_called) && selected.tools_called.length > 0 && (
              <div>
                <p className="font-medium text-sm mb-1">Ferramentas chamadas</p>
                <pre className="whitespace-pre-wrap bg-muted/40 rounded-md p-2 text-[11px]">
                  {JSON.stringify(selected.tools_called, null, 2)}
                </pre>
              </div>
            )}
            {Array.isArray(selected.kb_citations) && selected.kb_citations.length > 0 && (
              <div>
                <p className="font-medium text-sm mb-1 flex items-center gap-1.5">
                  <BookOpen className="w-3.5 h-3.5 text-violet" />
                  Evidências da base de conhecimento ({selected.kb_citations.length})
                </p>
                <CitationsList citations={selected.kb_citations as unknown as KbCitation[]} />
              </div>
            )}
            <div className="grid grid-cols-3 gap-2 pt-2 border-t border-border/50">
              <Stat label="Latência" value={`${selected.latency_ms || 0}ms`} />
              <Stat label="Mensagens" value={String(selected.messages_consumed || 0)} />
              <Stat label="Custo LLM" value={`R$ ${Number(selected.cost_brl || 0).toFixed(4)}`} />
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}

export const RunsHistory = memo(RunsHistoryBase);
