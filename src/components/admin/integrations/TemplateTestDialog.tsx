import { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Send, Loader2, CheckCircle2, AlertCircle, Mail, MessageCircle } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  type: 'email' | 'whatsapp';
  template: {
    slug: string;
    name: string;
    subject?: string;
    body?: string;
    html_body?: string;
    variables?: any[];
  } | null;
}

export const TemplateTestDialog = ({ open, onOpenChange, type, template }: Props) => {
  const [recipient, setRecipient] = useState('');
  const [vars, setVars] = useState<Record<string, string>>({});
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    if (open && template) {
      setRecipient('');
      setResult(null);
      const initial: Record<string, string> = {};
      (template.variables || []).forEach((v: any) => {
        const key = typeof v === 'string' ? v : v?.name || v?.key;
        if (key) initial[key] = '';
      });
      setVars(initial);
    }
  }, [open, template]);

  if (!template) return null;

  const variableNames = Object.keys(vars);

  const handleSend = async () => {
    if (!recipient.trim()) {
      return toast.error(type === 'email' ? 'Informe o e-mail destinatário' : 'Informe o telefone destinatário');
    }
    setSending(true);
    setResult(null);
    try {
      const fnName = type === 'email' ? 'send-email' : 'send-system-whatsapp';
      const body =
        type === 'email'
          ? { template_slug: template.slug, to: recipient.trim(), variables: vars }
          : { template_slug: template.slug, phone: recipient.replace(/\D/g, ''), variables: vars };

      const { data, error } = await supabase.functions.invoke(fnName, { body });
      if (error) {
        let msg = error.message;
        try { msg = (error as any).context?.json?.error || msg; } catch { /* */ }
        throw new Error(msg);
      }
      if (!data?.success) throw new Error(data?.error || 'Falha no envio');
      setResult({ ok: true, text: 'Enviado com sucesso!' });
      toast.success('Teste enviado');
    } catch (e: any) {
      setResult({ ok: false, text: e?.message || 'Erro' });
      toast.error(e?.message || 'Erro no envio');
    } finally {
      setSending(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {type === 'email' ? <Mail className="h-5 w-5" /> : <MessageCircle className="h-5 w-5" />}
            Testar template: {template.name}
          </DialogTitle>
          <DialogDescription>
            Envia uma cópia real usando este template. Útil para validar layout e variáveis.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div>
            <Label className="text-xs">
              {type === 'email' ? 'E-mail destinatário' : 'Telefone (com DDI)'}
            </Label>
            <Input
              value={recipient}
              onChange={(e) => setRecipient(e.target.value)}
              placeholder={type === 'email' ? 'voce@empresa.com' : '5511999999999'}
              type={type === 'email' ? 'email' : 'tel'}
            />
          </div>

          {variableNames.length > 0 && (
            <div className="space-y-2">
              <Label className="text-xs uppercase tracking-wide text-muted-foreground">
                Variáveis ({variableNames.length})
              </Label>
              <div className="space-y-2 rounded border border-border bg-muted/30 p-3 max-h-60 overflow-y-auto">
                {variableNames.map((key) => (
                  <div key={key}>
                    <Label className="text-[11px] font-mono text-muted-foreground">{`{{${key}}}`}</Label>
                    <Input
                      value={vars[key]}
                      onChange={(e) => setVars((p) => ({ ...p, [key]: e.target.value }))}
                      placeholder={`Valor para ${key}`}
                      className="h-8 text-sm"
                    />
                  </div>
                ))}
              </div>
            </div>
          )}

          {result && (
            <div className={`rounded border p-3 text-xs ${
              result.ok
                ? 'border-[hsl(var(--emerald)/0.30)] bg-[hsl(var(--emerald)/0.10)] text-[hsl(var(--emerald))]'
                : 'border-[hsl(var(--rose)/0.30)] bg-[hsl(var(--rose)/0.10)] text-[hsl(var(--rose))]'
            }`}>
              {result.ok
                ? <CheckCircle2 className="h-3.5 w-3.5 inline mr-1" />
                : <AlertCircle className="h-3.5 w-3.5 inline mr-1" />}
              {result.text}
            </div>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => onOpenChange(false)} disabled={sending}>
              Fechar
            </Button>
            <Button onClick={handleSend} disabled={sending}>
              {sending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Send className="h-4 w-4 mr-2" />}
              Enviar teste
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
