import { memo, useCallback, useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  BookOpen, CheckCircle2, Clock, Download, Eraser, FileDown, FileSpreadsheet, FileText,
  FlaskConical, Loader2, MessageSquare, Phone, Send, Zap,
} from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { exportPlaygroundCsv, exportPlaygroundPdf } from '../playgroundExport';
import { CitationsList } from './CitationsList';
import type { KbCitation, PlayMsg } from './types';

interface KbDocLite { id: string; file_name: string; status: string; storage_path: string }
interface InstanceLite { instance_name: string; status: string }

interface Props {
  agentId: string;
  draftPersona: string;
  draftSystemPrompt: string;
  draftModel: string;
}

function PlaygroundBase({ agentId, draftPersona, draftSystemPrompt, draftModel }: Props) {
  const { toast } = useToast();
  const { profile } = useAuth();
  const companyId = profile?.company_id;
  const isAdmin = profile?.role === 'admin' || profile?.role === 'master';

  const [messages, setMessages] = useState<PlayMsg[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [useKb, setUseKb] = useState(true);
  const [useDraft, setUseDraft] = useState(true);
  const [liveSend, setLiveSend] = useState(false);
  const [phone, setPhone] = useState('');
  const [instanceName, setInstanceName] = useState<string>('');
  const [confirmIdx, setConfirmIdx] = useState<number | null>(null);
  const [sendingIdx, setSendingIdx] = useState<number | null>(null);
  const [overrideDocs, setOverrideDocs] = useState<string[] | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const { data: kbDocs = [] } = useQuery({
    queryKey: ['ai-kb-pl', agentId],
    queryFn: async () => {
      const { data } = await supabase
        .from('ai_knowledge_documents')
        .select('id, file_name, status, storage_path')
        .eq('agent_id', agentId)
        .order('created_at', { ascending: false }).limit(100);
      return (data || []) as KbDocLite[];
    },
    enabled: !!agentId,
  });

  const { data: instances = [] } = useQuery({
    queryKey: ['playground-instances', companyId],
    queryFn: async () => {
      if (!companyId) return [] as InstanceLite[];
      const { data } = await supabase
        .from('whatsapp_instances')
        .select('instance_name, status')
        .eq('company_id', companyId)
        .eq('status', 'connected')
        .limit(20);
      return (data || []) as InstanceLite[];
    },
    enabled: !!companyId && liveSend,
  });

  useEffect(() => {
    if (liveSend && !instanceName && instances[0]) {
      setInstanceName(instances[0].instance_name);
    }
  }, [liveSend, instances, instanceName]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const send = useCallback(async () => {
    const text = input.trim();
    if (!text || sending) return;
    const newHistory: PlayMsg[] = [
      ...messages,
      { role: 'user', content: text, ts: Date.now() },
    ];
    setMessages(newHistory);
    setInput('');
    setSending(true);
    try {
      const overrides = useDraft
        ? { persona: draftPersona, system_prompt: draftSystemPrompt, model: draftModel }
        : undefined;
      const { data, error } = await supabase.functions.invoke('ai-agent-playground', {
        body: {
          agent_id: agentId,
          history: newHistory.map((m) => ({ role: m.role, content: m.content })),
          use_kb: useKb,
          ...(overrideDocs !== null ? { kb_document_ids: overrideDocs } : {}),
          overrides,
        },
      });
      if (error) {
        let msg = error.message || 'Erro';
        try {
          const ctx = (error as { context?: unknown }).context;
          if (ctx) {
            const j = typeof ctx === 'string' ? JSON.parse(ctx) : ctx;
            msg = (j as { message?: string; error?: string })?.message
              || (j as { message?: string; error?: string })?.error || msg;
          }
        } catch { /* ignore */ }
        throw new Error(msg);
      }
      const replies: string[] = (data as { messages?: string[] })?.messages || [];
      const citations: KbCitation[] = (data as { kb_citations?: KbCitation[] })?.kb_citations || [];
      const latency = (data as { latency_ms?: number })?.latency_ms;
      const assistantMsgs: PlayMsg[] = replies.map((c, i) => ({
        role: 'assistant',
        content: c,
        ts: Date.now() + i,
        kb: i === 0 ? citations : undefined,
        latency_ms: i === 0 ? latency : undefined,
      }));
      setMessages((prev) => [...prev, ...assistantMsgs]);
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Erro';
      toast({ title: 'Erro no playground', description: msg, variant: 'destructive' });
      setMessages((prev) => prev.slice(0, -1));
      setInput(text);
    } finally {
      setSending(false);
    }
  }, [agentId, draftModel, draftPersona, draftSystemPrompt, input, messages, overrideDocs, sending, toast, useDraft, useKb]);

  const sendReal = useCallback(async (idx: number) => {
    const msg = messages[idx];
    if (!msg || msg.role !== 'assistant') return;
    const phoneClean = phone.replace(/\D/g, '');
    if (!phoneClean || phoneClean.length < 10) {
      toast({ title: 'Número inválido', description: 'Informe DDI+DDD+número (ex: 5511999999999)', variant: 'destructive' });
      return;
    }
    if (!instanceName) {
      toast({ title: 'Selecione uma instância', variant: 'destructive' });
      return;
    }
    setSendingIdx(idx);
    try {
      const { data, error } = await supabase.functions.invoke('ai-agent-playground', {
        body: {
          agent_id: agentId,
          action: 'send_test',
          send_text: msg.content,
          send_to_phone: phoneClean,
          instance_name: instanceName,
        },
      });
      if (error) {
        let m = error.message || 'Erro';
        try {
          const ctx = (error as { context?: unknown }).context;
          if (ctx) {
            const j = typeof ctx === 'string' ? JSON.parse(ctx) : ctx;
            m = (j as { detail?: string; message?: string; error?: string })?.detail
              || (j as { detail?: string; message?: string; error?: string })?.message
              || (j as { detail?: string; message?: string; error?: string })?.error || m;
          }
        } catch { /* ignore */ }
        throw new Error(m);
      }
      const sent = (data as { sent?: boolean; instance?: string })?.sent;
      if (sent) {
        setMessages((prev) => prev.map((mm, i) => (i === idx ? { ...mm, sent: true } : mm)));
        toast({ title: 'Mensagem enviada', description: `Para ${phoneClean} via ${(data as { instance?: string }).instance}` });
      }
    } catch (e) {
      const m = e instanceof Error ? e.message : 'Erro';
      toast({ title: 'Falha no envio', description: m, variant: 'destructive' });
    } finally {
      setSendingIdx(null);
      setConfirmIdx(null);
    }
  }, [agentId, instanceName, messages, phone, toast]);

  const confirmMsg = confirmIdx !== null ? messages[confirmIdx] : null;

  return (
    <div className="space-y-3">
      <Card className="p-4 flex items-start gap-3 bg-violet/5 border-violet/20">
        <FlaskConical className="w-5 h-5 text-violet shrink-0 mt-0.5" />
        <div className="text-sm flex-1">
          <p className="font-medium">Teste o agente sem WhatsApp</p>
          <p className="text-xs text-muted-foreground mt-1">
            Conversa de teste local. Não salva no histórico de runs nem envia mensagens reais.
            Ative <strong>Envio real</strong> abaixo para disparar mensagens via WhatsApp com confirmação.
          </p>
        </div>
      </Card>

      <Card className="p-3 grid grid-cols-2 gap-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-sm font-medium">Usar rascunho atual</p>
            <p className="text-[11px] text-muted-foreground">Testa edições não salvas</p>
          </div>
          <Switch checked={useDraft} onCheckedChange={setUseDraft} />
        </div>
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-sm font-medium">Consultar base de conhecimento</p>
            <p className="text-[11px] text-muted-foreground">Mostra trechos usados</p>
          </div>
          <Switch checked={useKb} onCheckedChange={setUseKb} />
        </div>
      </Card>

      {useKb && kbDocs.length > 0 && (
        <Card className="p-3 space-y-2">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-medium flex items-center gap-2">
                <BookOpen className="w-3.5 h-3.5 text-violet" />
                Filtrar documentos nesta sessão
              </p>
              <p className="text-[11px] text-muted-foreground">
                {overrideDocs === null
                  ? 'Usando configuração do agente'
                  : overrideDocs.length === 0
                    ? 'Todos os documentos'
                    : `${overrideDocs.length} de ${kbDocs.length} selecionados`}
              </p>
            </div>
            <div className="flex gap-1">
              <Button
                size="sm" variant="outline" className="h-7 text-[11px]"
                onClick={() => setOverrideDocs(null)}
                disabled={overrideDocs === null}
              >
                Padrão do agente
              </Button>
              <Button
                size="sm" variant="outline" className="h-7 text-[11px]"
                onClick={() => setOverrideDocs([])}
              >
                Todos
              </Button>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-1.5 max-h-32 overflow-y-auto pt-1 border-t border-border/40">
            {kbDocs.map((d) => {
              const list = overrideDocs ?? [];
              const checked = overrideDocs !== null && (list.length === 0 || list.includes(d.id));
              const ready = d.status === 'ready';
              return (
                <label
                  key={d.id}
                  className={`flex items-center gap-2 text-[11px] p-1.5 rounded cursor-pointer hover:bg-muted/40 ${!ready ? 'opacity-50' : ''}`}
                >
                  <input
                    type="checkbox"
                    className="accent-violet"
                    checked={checked}
                    disabled={!ready}
                    onChange={(e) => {
                      const base = overrideDocs === null
                        ? kbDocs.filter((x) => x.status === 'ready').map((x) => x.id)
                        : (overrideDocs.length === 0
                            ? kbDocs.filter((x) => x.status === 'ready').map((x) => x.id)
                            : [...overrideDocs]);
                      const next = e.target.checked
                        ? Array.from(new Set([...base, d.id]))
                        : base.filter((id) => id !== d.id);
                      setOverrideDocs(next);
                    }}
                  />
                  <FileText className="w-3 h-3 shrink-0 text-muted-foreground" />
                  <span className="truncate">{d.file_name}</span>
                </label>
              );
            })}
          </div>
        </Card>
      )}

      <Card className={`p-3 space-y-3 ${liveSend ? 'border-amber/40 bg-amber/5' : ''}`}>
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-start gap-2">
            <Zap className={`w-4 h-4 mt-0.5 ${liveSend ? 'text-amber' : 'text-muted-foreground'}`} />
            <div>
              <p className="text-sm font-medium">Envio real via WhatsApp</p>
              <p className="text-[11px] text-muted-foreground">
                {isAdmin
                  ? 'Cada mensagem da IA exibirá um botão para enviar ao número informado, com confirmação.'
                  : 'Apenas administradores podem ativar o envio real.'}
              </p>
            </div>
          </div>
          <Switch checked={liveSend} onCheckedChange={setLiveSend} disabled={!isAdmin} />
        </div>

        {liveSend && (
          <div className="grid grid-cols-2 gap-3 pt-2 border-t border-border/40">
            <div className="space-y-1">
              <Label className="text-xs">Número de destino</Label>
              <Input
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="5511999999999"
                className="font-mono text-xs"
              />
              <p className="text-[10px] text-muted-foreground">DDI + DDD + número, sem espaços</p>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Instância WhatsApp</Label>
              <Select value={instanceName} onValueChange={setInstanceName}>
                <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>
                  {instances.length === 0 ? (
                    <div className="p-2 text-xs text-muted-foreground">
                      Nenhuma instância conectada
                    </div>
                  ) : instances.map((i) => (
                    <SelectItem key={i.instance_name} value={i.instance_name}>
                      {i.instance_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        )}
      </Card>

      <Card className="flex flex-col h-[480px]">
        <div className="flex items-center justify-between px-3 py-2 border-b border-border/40">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <MessageSquare className="w-3.5 h-3.5" />
            <span>{messages.length} mensagem(ns) na sessão</span>
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                size="sm"
                variant="outline"
                className="h-7 text-[11px] gap-1.5"
                disabled={messages.length === 0}
              >
                <Download className="w-3.5 h-3.5" />
                Exportar logs
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-44">
              <DropdownMenuItem
                onClick={() => {
                  const filteredDocNames =
                    overrideDocs && overrideDocs.length > 0
                      ? kbDocs.filter((d) => overrideDocs.includes(d.id)).map((d) => d.file_name)
                      : undefined;
                  const file = exportPlaygroundCsv(messages, {
                    agentId, useDraft, useKb, overrideDocs, filteredDocNames,
                  });
                  toast({ title: 'CSV exportado', description: file });
                }}
              >
                <FileSpreadsheet className="w-3.5 h-3.5 mr-2" />
                Exportar como CSV
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => {
                  const filteredDocNames =
                    overrideDocs && overrideDocs.length > 0
                      ? kbDocs.filter((d) => overrideDocs.includes(d.id)).map((d) => d.file_name)
                      : undefined;
                  const file = exportPlaygroundPdf(messages, {
                    agentId, useDraft, useKb, overrideDocs, filteredDocNames,
                  });
                  toast({ title: 'PDF exportado', description: file });
                }}
              >
                <FileDown className="w-3.5 h-3.5 mr-2" />
                Exportar como PDF
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
        <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-3">
          {messages.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-center text-sm text-muted-foreground">
              <MessageSquare className="w-8 h-8 mb-2 opacity-40" />
              <p>Envie uma mensagem como se fosse um cliente</p>
              <p className="text-xs mt-1">Ex: "oi, queria saber mais sobre o produto"</p>
            </div>
          ) : (
            messages.map((m, i) => (
              <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div className="max-w-[80%] space-y-1">
                  <div
                    className={`rounded-2xl px-3 py-2 text-sm ${
                      m.role === 'user'
                        ? 'bg-primary text-primary-foreground rounded-br-sm'
                        : 'bg-muted rounded-bl-sm'
                    }`}
                  >
                    {m.content}
                  </div>
                  {m.role === 'assistant' && (
                    <div className="flex items-center gap-2 flex-wrap">
                      {m.latency_ms && (
                        <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                          <Clock className="w-3 h-3" />{m.latency_ms}ms
                        </span>
                      )}
                      {liveSend && (
                        m.sent ? (
                          <span className="text-[10px] text-emerald flex items-center gap-1">
                            <CheckCircle2 className="w-3 h-3" />enviado
                          </span>
                        ) : (
                          <Button
                            size="sm" variant="outline"
                            className="h-6 px-2 text-[10px] gap-1 border-amber/40 text-amber hover:bg-amber/10"
                            onClick={() => setConfirmIdx(i)}
                            disabled={sendingIdx !== null || !phone || !instanceName}
                          >
                            {sendingIdx === i ? (
                              <Loader2 className="w-3 h-3 animate-spin" />
                            ) : (
                              <Phone className="w-3 h-3" />
                            )}
                            Enviar pelo WhatsApp
                          </Button>
                        )
                      )}
                      {m.kb && m.kb.length > 0 && (
                        <details className="text-[10px]">
                          <summary className="cursor-pointer text-violet flex items-center gap-1">
                            <BookOpen className="w-3 h-3" />Fontes ({m.kb.length})
                          </summary>
                          <div className="mt-1 space-y-1 max-w-md">
                            <CitationsList citations={m.kb} />
                          </div>
                        </details>
                      )}
                    </div>
                  )}
                </div>
              </div>
            ))
          )}
          {sending && (
            <div className="flex justify-start">
              <div className="rounded-2xl rounded-bl-sm px-3 py-2 bg-muted text-sm flex items-center gap-2">
                <Loader2 className="w-3 h-3 animate-spin" />
                <span className="text-muted-foreground text-xs">digitando…</span>
              </div>
            </div>
          )}
        </div>

        <div className="border-t p-3 flex items-center gap-2">
          <Button
            size="icon" variant="ghost" type="button"
            onClick={() => setMessages([])}
            disabled={messages.length === 0 || sending}
            title="Limpar conversa"
          >
            <Eraser className="w-4 h-4" />
          </Button>
          <Input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Digite como se fosse um cliente…"
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                send();
              }
            }}
            disabled={sending}
          />
          <Button onClick={send} disabled={sending || !input.trim()}>
            {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
          </Button>
        </div>
      </Card>

      <AlertDialog open={confirmIdx !== null} onOpenChange={(o) => !o && setConfirmIdx(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <Zap className="w-4 h-4 text-amber" />
              Enviar mensagem real pelo WhatsApp?
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3 text-sm">
                <p>
                  Esta ação envia uma mensagem real via Evolution API. O destinatário receberá
                  no WhatsApp dele.
                </p>
                <div className="rounded-md bg-muted p-3 space-y-1.5 text-xs">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Para</span>
                    <span className="font-mono">{phone.replace(/\D/g, '')}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Instância</span>
                    <span className="font-mono">{instanceName}</span>
                  </div>
                  <div className="border-t border-border/40 pt-1.5 mt-1.5">
                    <span className="text-muted-foreground">Mensagem</span>
                    <p className="mt-1 text-foreground whitespace-pre-wrap">{confirmMsg?.content}</p>
                  </div>
                </div>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={sendingIdx !== null}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-amber hover:bg-amber/90 text-amber-foreground"
              onClick={(e) => {
                e.preventDefault();
                if (confirmIdx !== null) sendReal(confirmIdx);
              }}
              disabled={sendingIdx !== null}
            >
              {sendingIdx !== null ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Phone className="w-4 h-4 mr-2" />}
              Confirmar envio
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

export const Playground = memo(PlaygroundBase);
