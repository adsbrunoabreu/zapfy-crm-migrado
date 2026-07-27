import { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { RefreshCw, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { useSyncGlobalAddons } from '@/hooks/useSyncGlobalAddons';

/**
 * Botão Master para propagar regras globais e dependências de add-ons
 * para todas as empresas com plano ativo/trial.
 *
 * Regras:
 *  - Loja Virtual ativa  ⇒ exige Agente IA
 *  - Agente IA ativo     ⇒ exige Automações
 */
export function SyncGlobalAddonsButton() {
  const sync = useSyncGlobalAddons();
  const [open, setOpen] = useState(false);

  const handleConfirm = async () => {
    try {
      const report = await sync.mutateAsync();
      if (report.updated === 0) {
        toast.success(`Tudo consistente — ${report.scanned} empresas verificadas.`);
      } else {
        toast.success(
          `${report.updated} de ${report.scanned} empresas atualizadas para refletir as regras globais.`,
        );
      }
      setOpen(false);
    } catch (e: any) {
      toast.error(e?.message ?? 'Falha ao sincronizar add-ons.');
    }
  };

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogTrigger asChild>
        <Button size="sm" variant="outline" className="gap-2">
          {sync.isPending ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <RefreshCw className="h-3.5 w-3.5" />
          )}
          Sincronizar globais
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent className="bg-background border-border">
        <AlertDialogHeader>
          <AlertDialogTitle>Propagar configurações globais?</AlertDialogTitle>
          <AlertDialogDescription className="space-y-2">
            <span className="block">
              Esta ação revisa todas as empresas com plano <strong>ativo</strong> ou em{' '}
              <strong>trial</strong> e garante a consistência das dependências entre add-ons:
            </span>
            <ul className="list-disc pl-5 text-xs text-muted-foreground">
              <li>e-Commerce ativo ⇒ Agente IA é ativado automaticamente</li>
              <li>Agente IA ativo ⇒ Automações são ativadas automaticamente</li>
            </ul>
            <span className="block text-xs">
              Empresas suspensas/canceladas não são afetadas. A operação é auditada em system_logs.
            </span>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={sync.isPending}>Cancelar</AlertDialogCancel>
          <AlertDialogAction onClick={handleConfirm} disabled={sync.isPending}>
            {sync.isPending ? 'Sincronizando…' : 'Sincronizar agora'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
