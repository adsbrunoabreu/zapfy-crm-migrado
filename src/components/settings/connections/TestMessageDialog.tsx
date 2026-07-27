import { useEffect, useState } from 'react';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Loader2, Send } from 'lucide-react';
import { formatPhoneBR, normalizePhoneForSend } from '@/lib/phoneFormat';
import { ProviderService } from '@/services/providerService';
import { callProxy } from './proxyUtils';
import type { WhatsAppInstance } from './types';

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  instance: WhatsAppInstance | null;
}

export function TestMessageDialog({ open, onOpenChange, instance }: Props) {
  const { toast } = useToast();
  const [number, setNumber] = useState('');
  const [message, setMessage] = useState('Olá! Esta é uma mensagem de teste do CRM. ✅');
  const [sending, setSending] = useState(false);

  useEffect(() => {
    if (open) {
      setNumber('');
      setMessage('Olá! Esta é uma mensagem de teste do CRM. ✅');
    }
  }, [open]);

  const handleSend = async () => {
    if (!instance) return;
    const normalized = normalizePhoneForSend(number);
    const text = message.trim();
    if (!normalized || normalized.length < 12) {
      toast({
        title: 'Número inválido',
        description: 'Informe um número válido com DDD (ex: 11 98765-4321).',
        variant: 'destructive',
      });
      return;
    }
    if (!text) {
      toast({ title: 'Mensagem vazia', description: 'Digite a mensagem de teste.', variant: 'destructive' });
      return;
    }
    setSending(true);
    try {
      if (instance.provider === 'cloud_api') {
        const provider = await ProviderService.getProvider(instance.id);
        await provider.sendMessage(normalized, text);
      } else {
        await callProxy('sendText', {
          instanceName: instance.instance_name,
          number: normalized,
          text,
          delay: 500,
        });
      }
      toast({ title: 'Mensagem enviada', description: `Teste enviado para ${formatPhoneBR(normalized)}.` });
      onOpenChange(false);
    } catch (err: any) {
      toast({
        title: 'Falha no envio',
        description: err?.message || 'Não foi possível enviar a mensagem de teste.',
        variant: 'destructive',
      });
    } finally {
      setSending(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !sending && onOpenChange(o)}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Send className="w-5 h-5 text-primary" />
            Enviar mensagem de teste
          </DialogTitle>
          <DialogDescription>
            Envie uma mensagem de WhatsApp pela instância{' '}
            <span className="font-medium text-foreground">{instance?.display_name}</span> para validar que
            está funcionando.
          </DialogDescription>
        </DialogHeader>
        <div className="py-4 space-y-4">
          <div className="space-y-2">
            <Label htmlFor="test-number">Número de destino</Label>
            <Input
              id="test-number"
              placeholder="(11) 98765-4321"
              value={number}
              onChange={(e) => setNumber(e.target.value)}
              className="bg-secondary/50 border-border/50"
              disabled={sending}
              inputMode="tel"
            />
            <p className="text-xs text-muted-foreground">
              Informe DDD + número. Se não tiver DDI, será assumido +55 (Brasil).
              {number && normalizePhoneForSend(number).length >= 12 && (
                <span className="block mt-1">
                  Será enviado para:{' '}
                  <span className="font-medium text-foreground">
                    {formatPhoneBR(normalizePhoneForSend(number))}
                  </span>
                </span>
              )}
            </p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="test-message">Mensagem</Label>
            <Textarea
              id="test-message"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={4}
              maxLength={1000}
              className="bg-secondary/50 border-border/50 resize-none"
              disabled={sending}
            />
            <p className="text-xs text-muted-foreground text-right">{message.length}/1000</p>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={sending}>
            Cancelar
          </Button>
          <Button onClick={handleSend} disabled={sending || !number.trim() || !message.trim()}>
            {sending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Send className="w-4 h-4 mr-2" />}
            Enviar teste
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
