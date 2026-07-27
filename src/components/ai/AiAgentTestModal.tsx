import { useEffect, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Send, RotateCcw, Loader2, Sparkle, Clock, BookOpen } from 'lucide-react';
import { toast } from 'sonner';

type Msg = { role: 'user' | 'assistant'; content: string; meta?: { latency_ms?: number; kb?: number } };

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  agentId: string | null;
  agentName?: string;
  agentEmoji?: string;
}

export default function AiAgentTestModal({ open, onOpenChange, agentId, agentName, agentEmoji }: Props) {
  const [history, setHistory] = useState<Msg[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [lastKb, setLastKb] = useState<any[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open) {
      setHistory([]);
      setInput('');
      setLastKb([]);
    }
  }, [open]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [history, loading]);

  const send = async () => {
    if (!agentId || !input.trim() || loading) return;
    const userMsg: Msg = { role: 'user', content: input.trim() };
    const next = [...history, userMsg];
    setHistory(next);
    setInput('');
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('ai-agent-playground', {
        body: {
          agent_id: agentId,
          history: next.map((m) => ({ role: m.role, content: m.content })),
          use_kb: true,
          action: 'generate',
        },
      });
      if (error) {
        const ctx = (error as any).context;
        const msg = ctx?.message || ctx?.error || error.message || 'Falha ao gerar resposta';
        toast.error(msg);
        return;
      }
      const messages: string[] = data?.messages?.length ? data.messages : [data?.raw || ''];
      const meta = { latency_ms: data?.latency_ms, kb: (data?.kb_citations || []).length };
      setLastKb(data?.kb_citations || []);
      setHistory((h) => [
        ...h,
        ...messages.filter(Boolean).map((c, i) => ({
          role: 'assistant' as const,
          content: c,
          meta: i === 0 ? meta : undefined,
        })),
      ]);
    } catch (e: any) {
      toast.error(e?.message || 'Erro inesperado');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl p-0 overflow-hidden">
        <DialogHeader className="px-5 pt-4 pb-3 border-b border-border">
          <DialogTitle className="flex items-center gap-2 text-base">
            <Sparkle className="w-4 h-4 text-violet" />
            Testar Agente {agentEmoji} {agentName}
          </DialogTitle>
          <DialogDescription className="text-xs">
            Modo sandbox — não envia mensagens reais nem grava no histórico do cliente.
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-1 md:grid-cols-[1fr_220px] min-h-[420px] max-h-[70vh]">
          {/* Chat */}
          <div className="flex flex-col border-r border-border min-w-0">
            <ScrollArea className="flex-1">
              <div ref={scrollRef as any} className="p-4 space-y-3">
                {history.length === 0 && (
                  <div className="text-xs text-muted-foreground text-center py-10">
                    Envie uma mensagem para começar o teste.
                  </div>
                )}
                {history.map((m, idx) => (
                  <div key={idx} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                    <div
                      className={`max-w-[80%] text-sm px-3 py-2 rounded-lg whitespace-pre-wrap ${
                        m.role === 'user'
                          ? 'bg-violet/15 text-foreground border border-violet/30'
                          : 'bg-muted/40 border border-border'
                      }`}
                    >
                      {m.content}
                      {m.meta && (
                        <div className="flex items-center gap-2 mt-1.5 text-[10px] text-muted-foreground">
                          {m.meta.latency_ms != null && (
                            <span className="inline-flex items-center gap-1">
                              <Clock className="w-3 h-3" />
                              {m.meta.latency_ms}ms
                            </span>
                          )}
                          {m.meta.kb ? (
                            <span className="inline-flex items-center gap-1">
                              <BookOpen className="w-3 h-3" />
                              {m.meta.kb} chunks
                            </span>
                          ) : null}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
                {loading && (
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Loader2 className="w-3 h-3 animate-spin" />
                    Agente digitando…
                  </div>
                )}
              </div>
            </ScrollArea>
            <div className="border-t border-border p-3 flex items-center gap-2">
              <Input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    send();
                  }
                }}
                placeholder="Escreva como se fosse um cliente…"
                disabled={!agentId || loading}
              />
              <Button size="icon" onClick={send} disabled={!agentId || !input.trim() || loading}>
                <Send className="w-4 h-4" />
              </Button>
            </div>
          </div>

          {/* Debug sidebar */}
          <div className="hidden md:flex flex-col p-3 gap-2 bg-muted/20">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Debug</p>
            <div className="text-xs space-y-1">
              <div className="flex justify-between"><span className="text-muted-foreground">Turnos</span><span>{history.filter(m => m.role === 'user').length}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Chunks (última)</span><span>{lastKb.length}</span></div>
            </div>
            {lastKb.length > 0 && (
              <div className="space-y-1.5 mt-2 overflow-auto">
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Citações</p>
                {lastKb.slice(0, 4).map((c: any, i: number) => (
                  <div key={i} className="text-[10px] p-2 rounded border border-border bg-background/40 space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="font-medium truncate">{c.file_name || 'doc'}</span>
                      <Badge variant="outline" className="h-4 text-[9px] px-1">{Math.round((c.similarity || 0) * 100)}%</Badge>
                    </div>
                    <p className="text-muted-foreground line-clamp-3">{c.snippet}</p>
                  </div>
                ))}
              </div>
            )}
            <div className="mt-auto pt-2 border-t border-border">
              <Button variant="outline" size="sm" className="w-full" onClick={() => { setHistory([]); setLastKb([]); }}>
                <RotateCcw className="w-3.5 h-3.5 mr-1.5" />
                Resetar conversa
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
