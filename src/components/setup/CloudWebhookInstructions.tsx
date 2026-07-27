/**
 * CloudWebhookInstructions
 * ------------------------
 * Mostra ao usuário a Callback URL e o Verify Token gerados para
 * configurar o webhook no app da Meta (Meta for Developers).
 *
 * Uso:
 *   <CloudWebhookInstructions verifyToken={token} onClose={() => navigate(...)} />
 */
import { useState } from 'react';
import { Check, Copy, Eye, EyeOff, ExternalLink, Info } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { toast } from 'sonner';

interface Props {
  verifyToken: string;
  /** Mostra rótulo do número/conexão acima das instruções. */
  displayName?: string;
  onClose?: () => void;
  closeLabel?: string;
}

/** URL pública do receptor de webhooks (mesmo endpoint para todas as conexões). */
function buildWebhookUrl(): string {
  const base = import.meta.env.VITE_SUPABASE_URL as string | undefined;
  return `${base ?? ''}/functions/v1/webhook-router`;
}

export default function CloudWebhookInstructions({
  verifyToken,
  displayName,
  onClose,
  closeLabel = 'Concluir',
}: Props) {
  const [showToken, setShowToken] = useState(false);
  const [copied, setCopied] = useState<'url' | 'token' | null>(null);

  const webhookUrl = buildWebhookUrl();

  const copy = async (value: string, kind: 'url' | 'token') => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(kind);
      toast.success(kind === 'url' ? 'URL copiada' : 'Token copiado');
      setTimeout(() => setCopied(null), 1500);
    } catch {
      toast.error('Não foi possível copiar');
    }
  };

  return (
    <div className="space-y-4">
      <Alert>
        <Info className="h-4 w-4" />
        <AlertDescription className="text-sm">
          {displayName ? <strong>{displayName} · </strong> : null}
          Cole estes valores em <strong>Meta Developers → seu App → WhatsApp → Configuration → Webhook</strong>.
          Guarde-os: serão pedidos pelo Meta no momento de salvar.
        </AlertDescription>
      </Alert>

      <div className="space-y-1.5">
        <Label htmlFor="wh-url">Callback URL</Label>
        <div className="flex gap-2">
          <Input
            id="wh-url"
            readOnly
            value={webhookUrl}
            onFocus={(e) => e.currentTarget.select()}
            className="font-mono text-xs"
          />
          <Button
            type="button"
            variant="outline"
            size="icon"
            onClick={() => copy(webhookUrl, 'url')}
            aria-label="Copiar URL"
          >
            {copied === 'url' ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
          </Button>
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="wh-token">Verify Token</Label>
        <div className="flex gap-2">
          <Input
            id="wh-token"
            readOnly
            type={showToken ? 'text' : 'password'}
            value={verifyToken}
            onFocus={(e) => e.currentTarget.select()}
            className="font-mono text-xs"
          />
          <Button
            type="button"
            variant="outline"
            size="icon"
            onClick={() => setShowToken((v) => !v)}
            aria-label={showToken ? 'Ocultar token' : 'Mostrar token'}
          >
            {showToken ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </Button>
          <Button
            type="button"
            variant="outline"
            size="icon"
            onClick={() => copy(verifyToken, 'token')}
            aria-label="Copiar token"
          >
            {copied === 'token' ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          Token gerado automaticamente. Mesmo valor já foi salvo na sua conexão.
        </p>
      </div>

      <div className="space-y-1.5 pt-1">
        <p className="text-xs text-muted-foreground">Eventos a inscrever no painel do Meta:</p>
        <code className="block rounded-md border border-border bg-muted px-2 py-1 text-xs">
          messages, message_template_status_update, message_echoes
        </code>
        <p className="text-xs text-muted-foreground">
          <strong>message_echoes</strong> (opcional) faz o conteúdo real de mensagens disparadas
          por fora (ex.: n8n, Make) aparecer no chat. Sem ele, exibimos apenas um stub do template.
        </p>
      </div>

      <div className="flex items-center justify-between pt-2">
        <a
          href="https://developers.facebook.com/apps"
          target="_blank"
          rel="noreferrer noopener"
          className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
        >
          Abrir Meta for Developers <ExternalLink className="h-3 w-3" />
        </a>
        {onClose && (
          <Button type="button" onClick={onClose}>
            {closeLabel}
          </Button>
        )}
      </div>
    </div>
  );
}
