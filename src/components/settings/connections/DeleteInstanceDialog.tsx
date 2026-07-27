import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Loader2, Trash2 } from 'lucide-react';
import { callProxy } from './proxyUtils';
import type { WhatsAppInstance } from './types';

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  instance: WhatsAppInstance | null;
  onDeleted: () => void;
}

export function DeleteInstanceDialog({ open, onOpenChange, instance, onDeleted }: Props) {
  const { toast } = useToast();
  const [deleting, setDeleting] = useState(false);

  const handleDelete = async () => {
    if (!instance) return;
    setDeleting(true);
    const warnings: string[] = [];

    try {
      await callProxy('logoutInstance', { instanceName: instance.instance_name });
    } catch (err: any) {
      console.warn('[deleteInstance] logout falhou (seguindo):', err?.message ?? err);
    }

    let evolutionRemoved = false;
    try {
      await callProxy('deleteInstance', { instanceName: instance.instance_name });
      evolutionRemoved = true;
    } catch (err: any) {
      const msg = String(err?.message ?? err ?? '');
      const notFound = /404|not.?found|does.?not.?exist|n[ãa]o.?existe/i.test(msg);
      if (notFound) {
        warnings.push('A instância já não existia na Evolution — removendo apenas do banco.');
      } else {
        console.error('[deleteInstance] falha Evolution:', msg);
        warnings.push(
          `Evolution retornou erro: ${msg.slice(0, 160)}. Removendo registro local mesmo assim.`
        );
      }
    }

    try {
      const { error, count } = await (supabase as any)
        .from('whatsapp_instances')
        .delete({ count: 'exact' })
        .eq('id', instance.id);

      if (error) {
        console.error('[deleteInstance] erro DB:', error);
        toast({
          title: 'Erro ao remover',
          description: `Banco rejeitou: ${error.message}. Verifique se você é administrador da empresa.`,
          variant: 'destructive',
        });
        return;
      }
      if (!count || count === 0) {
        toast({
          title: 'Sem permissão',
          description:
            'Nenhuma linha foi removida. Apenas administradores da empresa podem excluir instâncias.',
          variant: 'destructive',
        });
        return;
      }

      toast({
        title: 'Instância removida',
        description: warnings.length
          ? `"${instance.display_name}" removida. ${warnings.join(' ')}`
          : `"${instance.display_name}" foi removida${evolutionRemoved ? ' (Evolution + banco)' : ''}.`,
      });
      onOpenChange(false);
      onDeleted();
    } catch (err: any) {
      console.error('[deleteInstance] exceção DB:', err);
      toast({
        title: 'Erro inesperado',
        description: err?.message ?? 'Falha ao remover do banco.',
        variant: 'destructive',
      });
    } finally {
      setDeleting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !deleting && onOpenChange(o)}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="text-destructive">Remover Instância</DialogTitle>
          <DialogDescription>
            Tem certeza que deseja remover "{instance?.display_name}"? Esta ação irá desconectar e excluir a
            instância permanentemente.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={deleting}>
            Cancelar
          </Button>
          <Button variant="destructive" onClick={handleDelete} disabled={deleting}>
            {deleting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Trash2 className="w-4 h-4 mr-2" />}
            Remover
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
