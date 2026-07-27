import { useEffect, useState } from 'react';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { KeyRound, Loader2, ShieldCheck } from 'lucide-react';
import { ProviderService } from '@/services/providerService';
import type { WhatsAppInstance } from './types';

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  instance: WhatsAppInstance | null;
  onRefetch: () => void;
}

export function ReconnectCloudDialog({ open, onOpenChange, instance, onRefetch }: Props) {
  const { toast } = useToast();
  const [token, setToken] = useState('');
  const [phoneId, setPhoneId] = useState('');
  const [wabaId, setWabaId] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open || !instance) return;
    const cfg = (instance.config || {}) as Record<string, any>;
    setToken('');
    setPhoneId(typeof cfg.phoneNumberId === 'string' ? cfg.phoneNumberId : '');
    setWabaId(typeof cfg.businessAccountId === 'string' ? cfg.businessAccountId : '');
  }, [open, instance]);

  const handleReconnect = async () => {
    if (!instance) return;
    const tk = token.trim();
    if (tk.length < 20) {
      toast({
        title: 'Token inválido',
        description: 'Cole o novo Access Token gerado no Meta Business.',
        variant: 'destructive',
      });
      return;
    }
    setBusy(true);
    try {
      await ProviderService.updateCloudApiCredentials(instance.id, {
        accessToken: tk,
        phoneNumberId: phoneId.trim() || undefined,
        businessAccountId: wabaId.trim() || undefined,
      });
      toast({
        title: 'Reconectado',
        description: `"${instance.display_name}" voltou a ficar disponível.`,
      });
      onOpenChange(false);
      onRefetch();
    } catch (err: any) {
      toast({
        title: 'Falha ao reconectar',
        description: err?.message || 'Não foi possível validar o novo token.',
        variant: 'destructive',
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !busy && onOpenChange(o)}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <KeyRound className="w-5 h-5 text-primary" />
            Reconectar API Oficial
          </DialogTitle>
          <DialogDescription>
            Cole o novo Access Token gerado no Meta Business Suite. Validamos o token na Graph API antes de
            salvar.
          </DialogDescription>
        </DialogHeader>
        <div className="py-2 space-y-4">
          <div className="space-y-2">
            <Label htmlFor="rc-token">Novo Access Token</Label>
            <Input
              id="rc-token"
              type="password"
              autoComplete="new-password"
              placeholder="Token permanente da Cloud API"
              value={token}
              onChange={(e) => setToken(e.target.value)}
              disabled={busy}
            />
            <p className="inline-flex items-center gap-1 text-xs text-muted-foreground">
              <ShieldCheck className="w-3 h-3" /> Criptografado em repouso. Phone Number ID, WABA ID e webhook
              serão preservados.
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="rc-phone">Phone Number ID</Label>
              <Input
                id="rc-phone"
                inputMode="numeric"
                value={phoneId}
                onChange={(e) => setPhoneId(e.target.value)}
                disabled={busy}
                placeholder="Mantém o atual se vazio"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="rc-waba">WABA ID</Label>
              <Input
                id="rc-waba"
                inputMode="numeric"
                value={wabaId}
                onChange={(e) => setWabaId(e.target.value)}
                disabled={busy}
                placeholder="Mantém o atual se vazio"
              />
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
            Cancelar
          </Button>
          <Button onClick={handleReconnect} disabled={busy || token.trim().length < 20}>
            {busy ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <KeyRound className="w-4 h-4 mr-2" />}
            Salvar e validar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
