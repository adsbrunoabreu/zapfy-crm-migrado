import { memo } from 'react';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { AlertTriangle, Loader2, Trash2 } from 'lucide-react';

interface SingleProps {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  leadName: string | undefined;
  confirmation: string;
  setConfirmation: (v: string) => void;
  onConfirm: () => void;
  isPending: boolean;
}

export const LeadDeleteDialog = memo(function LeadDeleteDialog({ open, onOpenChange, leadName, confirmation, setConfirmation, onConfirm, isPending }: SingleProps) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2 text-destructive">
            <AlertTriangle className="w-5 h-5" />
            Excluir Lead
          </AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-4">
              <p>Você está prestes a excluir <strong className="text-foreground">"{leadName}"</strong>.</p>
              <div className="p-3 bg-destructive/10 border border-destructive/30 rounded-md">
                <p className="text-destructive font-medium flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4" />
                  Esta ação NÃO pode ser desfeita!
                </p>
                <p className="text-sm text-muted-foreground mt-1">
                  Todos os dados, histórico de mensagens e atividades serão removidos permanentemente.
                </p>
              </div>
              <div className="space-y-2">
                <Label>Digite <strong>EXCLUIR</strong> para confirmar:</Label>
                <Input value={confirmation} onChange={(e) => setConfirmation(e.target.value.toUpperCase())} placeholder="EXCLUIR" className="font-mono" />
              </div>
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancelar</AlertDialogCancel>
          <AlertDialogAction
            disabled={confirmation !== 'EXCLUIR' || isPending}
            className="bg-destructive hover:bg-destructive/90"
            onClick={onConfirm}
          >
            {isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Trash2 className="w-4 h-4 mr-2" />}
            Excluir Definitivamente
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
});

interface BulkProps {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  count: number;
  confirmation: string;
  setConfirmation: (v: string) => void;
  onConfirm: () => void;
  isPending: boolean;
}

export const LeadBulkDeleteDialog = memo(function LeadBulkDeleteDialog({ open, onOpenChange, count, confirmation, setConfirmation, onConfirm, isPending }: BulkProps) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2 text-destructive">
            <AlertTriangle className="w-5 h-5" />
            Excluir {count} Leads
          </AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-4">
              <p>Você está prestes a excluir <strong className="text-foreground">{count} leads</strong> selecionados.</p>
              <div className="p-3 bg-destructive/10 border border-destructive/30 rounded-md">
                <p className="text-destructive font-medium flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4" />
                  Esta ação NÃO pode ser desfeita!
                </p>
                <p className="text-sm text-muted-foreground mt-1">
                  Todos os dados, históricos de mensagens e atividades serão removidos permanentemente.
                </p>
              </div>
              <div className="space-y-2">
                <Label>Digite <strong>EXCLUIR</strong> para confirmar:</Label>
                <Input value={confirmation} onChange={(e) => setConfirmation(e.target.value.toUpperCase())} placeholder="EXCLUIR" className="font-mono" />
              </div>
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancelar</AlertDialogCancel>
          <AlertDialogAction
            disabled={confirmation !== 'EXCLUIR' || isPending}
            className="bg-destructive hover:bg-destructive/90"
            onClick={onConfirm}
          >
            {isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Trash2 className="w-4 h-4 mr-2" />}
            Excluir {count} Leads
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
});
