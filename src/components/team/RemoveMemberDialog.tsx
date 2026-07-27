import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Loader2, AlertTriangle } from 'lucide-react';
import { useRemoveMember } from '@/hooks/useRemoveMember';
import { useState } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

interface RemoveMemberDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  member: { id: string; name: string; email: string } | null;
}

export function RemoveMemberDialog({ open, onOpenChange, member }: RemoveMemberDialogProps) {
  const { mutate: removeMember, isPending } = useRemoveMember();
  const [confirmName, setConfirmName] = useState('');

  const handleRemove = () => {
    if (!member) return;
    removeMember(member.id, {
      onSuccess: () => {
        setConfirmName('');
        onOpenChange(false);
      },
    });
  };

  const isConfirmed = confirmName.trim().toLowerCase() === (member?.name || '').trim().toLowerCase();

  return (
    <AlertDialog open={open} onOpenChange={(o) => {
      if (!o) setConfirmName('');
      onOpenChange(o);
    }}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-destructive" />
            Remover Membro?
          </AlertDialogTitle>
          <AlertDialogDescription className="space-y-3">
            <p>
              Tem certeza que deseja remover <strong>{member?.name}</strong> da equipe?
            </p>
            <div className="text-sm space-y-1 p-3 bg-destructive/10 rounded-lg border border-destructive/20">
              <p className="font-medium text-destructive">Esta ação irá:</p>
              <ul className="list-disc list-inside text-muted-foreground">
                <li>Desassociar o membro da empresa</li>
                <li>Os leads atribuídos a ele ficarão sem responsável</li>
                <li>Remover o membro da distribuição de leads</li>
              </ul>
            </div>
            <div className="space-y-2 pt-1">
              <Label htmlFor="confirm-name" className="text-muted-foreground text-xs">
                Digite o nome do membro para confirmar
              </Label>
              <Input
                id="confirm-name"
                value={confirmName}
                onChange={(e) => setConfirmName(e.target.value)}
                placeholder={member?.name || ''}
                disabled={isPending}
                autoComplete="off"
              />
            </div>
            <p className="text-sm text-muted-foreground">
              Esta ação não pode ser desfeita.
            </p>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isPending} onClick={() => setConfirmName('')}>Cancelar</AlertDialogCancel>
          <AlertDialogAction
            onClick={handleRemove}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            disabled={isPending || !isConfirmed}
          >
            {isPending ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Removendo...
              </>
            ) : (
              'Remover Membro'
            )}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
