import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2, Trash2, AlertTriangle } from 'lucide-react';
import { fetchCompanyDataCounts, useDeleteCompany } from '@/hooks/useDeleteCompany';
import { useToast } from '@/hooks/use-toast';

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  companyId: string | null;
  companyName: string;
  onDeleted?: () => void;
}

export function CompanyDeleteDialog({ open, onOpenChange, companyId, companyName, onDeleted }: Props) {
  const { toast } = useToast();
  const [confirmName, setConfirmName] = useState('');
  const deleteCompany = useDeleteCompany();

  const { data: counts, isLoading } = useQuery({
    queryKey: ['company-data-counts', companyId],
    queryFn: () => fetchCompanyDataCounts(companyId!),
    enabled: !!companyId && open,
  });

  useEffect(() => {
    if (!open) setConfirmName('');
  }, [open]);

  const hasData = counts && (counts.users > 0 || counts.leads > 0 || counts.conversations > 0);
  const canDelete = !hasData && confirmName.trim() === companyName;

  const handleDelete = async () => {
    if (!companyId) return;
    try {
      await deleteCompany.mutateAsync(companyId);
      toast({ title: 'Empresa excluída' });
      onOpenChange(false);
      onDeleted?.();
    } catch (e: any) {
      toast({ title: 'Erro ao excluir', description: e.message, variant: 'destructive' });
    }
  };

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-rose" />
            Excluir empresa
          </AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-3">
              <p>
                Esta ação é <strong>irreversível</strong> e remove permanentemente a empresa{' '}
                <span className="text-foreground font-medium">{companyName}</span>.
              </p>

              {isLoading ? (
                <div className="flex items-center gap-2 text-muted-foreground text-sm">
                  <Loader2 className="w-4 h-4 animate-spin" /> Verificando dados associados...
                </div>
              ) : hasData ? (
                <div className="rounded-lg border border-rose/30 bg-rose/10 p-3 space-y-2">
                  <p className="text-sm text-foreground font-medium">Não é possível excluir</p>
                  <p className="text-xs">A empresa ainda possui:</p>
                  <ul className="text-xs space-y-1 ml-4 list-disc">
                    {counts!.users > 0 && <li>{counts!.users} usuário(s)</li>}
                    {counts!.leads > 0 && <li>{counts!.leads.toLocaleString('pt-BR')} lead(s)</li>}
                    {counts!.conversations > 0 && <li>{counts!.conversations.toLocaleString('pt-BR')} conversa(s)</li>}
                  </ul>
                  <p className="text-xs">
                    Remova ou transfira esses dados antes de excluir, ou use a opção "Cancelar" para encerrar
                    o plano sem apagar.
                  </p>
                </div>
              ) : (
                <div className="space-y-2">
                  <Label className="text-xs">
                    Para confirmar, digite o nome da empresa:{' '}
                    <span className="text-foreground font-medium">{companyName}</span>
                  </Label>
                  <Input
                    value={confirmName}
                    onChange={(e) => setConfirmName(e.target.value)}
                    placeholder={companyName}
                  />
                </div>
              )}
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancelar</AlertDialogCancel>
          <Button
            variant="destructive"
            disabled={!canDelete || deleteCompany.isPending}
            onClick={handleDelete}
          >
            {deleteCompany.isPending ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <Trash2 className="w-4 h-4 mr-2" />
            )}
            Excluir definitivamente
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
