import { useState } from 'react';
import { format } from 'date-fns';
import { Loader2, Copy, Check, ChevronDown, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { useMessageAuditTimeline, type AuditMessageRow } from '@/hooks/useMessageAudit';

interface Props {
  message: AuditMessageRow | null;
}

const STATUS_DOT: Record<string, string> = {
  success: 'bg-emerald-500',
  warning: 'bg-amber-500',
  error: 'bg-red-500',
  info: 'bg-blue-500',
};

export function MessageAuditTimeline({ message }: Props) {
  const { data, isLoading } = useMessageAuditTimeline(message?.id ?? null);
  const [showJson, setShowJson] = useState(false);
  const [copied, setCopied] = useState(false);

  if (!message) {
    return (
      <div className="flex items-center justify-center text-sm text-muted-foreground h-full py-10">
        Selecione uma mensagem na lista para ver a linha do tempo.
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-10 text-muted-foreground">
        <Loader2 className="w-4 h-4 mr-2 animate-spin" /> Carregando timeline…
      </div>
    );
  }

  const events = data?.events ?? [];

  const copyDiagnostic = async () => {
    const lines = [
      `Mensagem: ${message.id}`,
      `message_id: ${message.message_id ?? '-'}  provider_message_id: ${message.provider_message_id ?? '-'}`,
      `Provider: ${message.provider ?? '-'} | Status atual: ${message.status ?? '-'} | Direção: ${message.from_me ? 'OUT' : 'IN'}`,
      `Lead: ${message.lead_name ?? '-'} | JID: ${message.remote_jid ?? '-'}`,
      `Conteúdo: ${message.content ?? ''}`,
      '',
      'Linha do tempo:',
      ...events.map(
        (e) =>
          `  ${format(new Date(e.ts), 'dd/MM HH:mm:ss')}  [${e.status ?? '-'}]  ${e.event}  ${e.description ?? ''}`
      ),
    ];
    await navigator.clipboard.writeText(lines.join('\n'));
    setCopied(true);
    toast.success('Diagnóstico copiado');
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div className="space-y-3">
      <div className="border border-border rounded-lg p-3 bg-muted/20">
        <div className="flex items-start justify-between gap-3 mb-2">
          <div className="min-w-0">
            <div className="text-xs text-muted-foreground">
              {message.from_me ? 'Enviada por' : 'Recebida de'}{' '}
              <span className="text-foreground font-medium">
                {message.from_me ? message.sender_name || 'Sistema' : message.lead_name || message.sender_name || '—'}
              </span>
            </div>
            <div className="text-sm mt-1 break-words">{message.content || `[${message.message_type ?? 'mensagem'}]`}</div>
          </div>
          <Button size="sm" variant="outline" onClick={copyDiagnostic}>
            {copied ? <Check className="w-3.5 h-3.5 mr-1.5" /> : <Copy className="w-3.5 h-3.5 mr-1.5" />}
            Copiar
          </Button>
        </div>
        <div className="flex items-center gap-1.5 flex-wrap text-[10px]">
          <Badge variant="outline">status: {message.status ?? 'pending'}</Badge>
          <Badge variant="outline">{message.provider ?? '—'}</Badge>
          <Badge variant="outline">type: {message.message_type ?? 'text'}</Badge>
          {message.message_id && <Badge variant="outline">mid: {message.message_id.slice(0, 18)}…</Badge>}
          {message.provider_message_id && (
            <Badge variant="outline">pmid: {message.provider_message_id.slice(0, 18)}…</Badge>
          )}
        </div>
      </div>

      <ScrollArea className="h-[calc(100vh-30rem)]">
        <div className="relative pl-5">
          <div className="absolute left-[7px] top-1 bottom-1 w-px bg-border" />
          <div className="space-y-3">
            {events.map((e, i) => (
              <div key={i} className="relative">
                <span
                  className={cn(
                    'absolute -left-[18px] top-1.5 w-3 h-3 rounded-full border-2 border-background',
                    STATUS_DOT[e.status ?? 'info'] ?? 'bg-muted-foreground'
                  )}
                />
                <div className="flex items-center gap-2 mb-0.5">
                  <span className="text-[11px] font-mono text-muted-foreground">
                    {format(new Date(e.ts), 'dd/MM HH:mm:ss.SSS')}
                  </span>
                  <Badge variant="outline" className="text-[10px] py-0 h-4">
                    {e.event}
                  </Badge>
                  {e.status && (
                    <span
                      className={cn(
                        'text-[10px]',
                        e.status === 'error' && 'text-red-400',
                        e.status === 'warning' && 'text-amber-400',
                        e.status === 'success' && 'text-emerald-400'
                      )}
                    >
                      {e.status}
                    </span>
                  )}
                </div>
                <div className="text-xs text-foreground/80 break-words">{e.description}</div>
                {e.metadata && Object.keys(e.metadata).length > 0 && (
                  <details className="mt-1">
                    <summary className="text-[10px] text-muted-foreground cursor-pointer hover:text-foreground">
                      metadata
                    </summary>
                    <pre className="mt-1 text-[10px] bg-muted/40 p-2 rounded overflow-auto max-h-40">
                      {JSON.stringify(e.metadata, null, 2)}
                    </pre>
                  </details>
                )}
              </div>
            ))}
            {!events.length && (
              <div className="text-xs text-muted-foreground">Nenhum evento registrado.</div>
            )}
          </div>
        </div>

        <button
          className="mt-4 flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
          onClick={() => setShowJson((v) => !v)}
        >
          {showJson ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
          JSON bruto da mensagem
        </button>
        {showJson && (
          <pre className="mt-2 text-[10px] bg-muted/40 p-2 rounded overflow-auto max-h-80">
            {JSON.stringify(data?.message ?? message, null, 2)}
          </pre>
        )}
      </ScrollArea>
    </div>
  );
}
