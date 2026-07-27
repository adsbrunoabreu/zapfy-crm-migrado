import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
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
import { Loader2, Plus } from 'lucide-react';
import { callProxy, evolutionWebhookUrl, extractQrCode } from './proxyUtils';
import type { WhatsAppInstance } from './types';
import { parsePlanLimitError } from '@/hooks/usePlanLimitGuard';

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  companyId: string | undefined;
  canAddInstance: boolean;
  onPlanLimitHit: () => void;
  onCreated: (inst: WhatsAppInstance, qrBase64: string | null) => void;
  onRefetch: () => void;
}

export function CreateInstanceDialog({
  open,
  onOpenChange,
  companyId,
  canAddInstance,
  onPlanLimitHit,
  onCreated,
  onRefetch,
}: Props) {
  const { toast } = useToast();
  const [name, setName] = useState('');
  const [creating, setCreating] = useState(false);

  const handleCreate = async () => {
    if (!name.trim() || !companyId) return;
    if (!canAddInstance) {
      onPlanLimitHit();
      return;
    }
    setCreating(true);
    try {
      const companyPrefix = (companyId ?? '').slice(0, 8).toLowerCase();
      const cleaned = name.trim().toLowerCase().replace(/[^a-z0-9_-]/g, '_');
      const instanceName = `${companyPrefix}_${cleaned}`;

      const { error: insertErr } = await (supabase as any)
        .from('whatsapp_instances')
        .insert({
          company_id: companyId,
          instance_name: instanceName,
          display_name: name.trim(),
          status: 'disconnected',
        });

      if (insertErr) {
        const planMsg = parsePlanLimitError(insertErr);
        if (planMsg) onPlanLimitHit();
        else toast({ title: 'Erro ao criar', description: insertErr.message, variant: 'destructive' });
        return;
      }

      const result = await callProxy('createInstance', {
        instanceName,
        webhookUrl: evolutionWebhookUrl(),
      });

      toast({ title: 'Instância criada', description: `"${name.trim()}" foi criada com sucesso.` });
      onOpenChange(false);

      const newInst: WhatsAppInstance = {
        id: '',
        company_id: companyId,
        instance_name: instanceName,
        display_name: name.trim(),
        status: 'disconnected',
        phone_connected: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      setName('');
      onCreated(newInst, extractQrCode(result));
      onRefetch();
    } catch (err: any) {
      const planMsg = parsePlanLimitError(err);
      if (planMsg) onPlanLimitHit();
      else
        toast({
          title: 'Erro ao criar',
          description: err?.message || 'Não foi possível criar a instância.',
          variant: 'destructive',
        });
    } finally {
      setCreating(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !creating && onOpenChange(o)}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Nova Instância WhatsApp</DialogTitle>
          <DialogDescription>
            Crie uma nova instância para conectar um número de WhatsApp ao sistema.
          </DialogDescription>
        </DialogHeader>
        <div className="py-4 space-y-4">
          <div className="space-y-2">
            <Label htmlFor="inst-name">Nome da Instância</Label>
            <Input
              id="inst-name"
              placeholder="Ex: Vendas, Suporte, Marketing"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="bg-secondary/50 border-border/50"
              disabled={creating}
            />
            <p className="text-xs text-muted-foreground">
              Um nome para identificar esta conexão (ex: "WhatsApp Vendas")
            </p>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={creating}>
            Cancelar
          </Button>
          <Button onClick={handleCreate} disabled={!name.trim() || creating}>
            {creating ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Plus className="w-4 h-4 mr-2" />}
            Criar Instância
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
