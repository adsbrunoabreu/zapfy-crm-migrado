import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Subscription } from '@/hooks/useSubscriptions';
import { useCancelSubscription } from '@/hooks/useChangePlan';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  subscription: Subscription | null;
  companyId?: string;
}

export function CancelSubscriptionDialog({ open, onOpenChange, subscription, companyId }: Props) {
  const cancel = useCancelSubscription(companyId);
  const endDate = subscription?.current_period_end ? new Date(subscription.current_period_end) : null;

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Cancelar assinatura?</AlertDialogTitle>
          <AlertDialogDescription>
            Você continua com acesso completo até{' '}
            <strong>
              {endDate ? format(endDate, "dd 'de' MMMM 'de' yyyy", { locale: ptBR }) : 'o fim do período atual'}
            </strong>
            . Após essa data, o acesso será suspenso e a renovação automática não será cobrada.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Manter assinatura</AlertDialogCancel>
          <AlertDialogAction
            disabled={cancel.isPending}
            onClick={async (e) => {
              e.preventDefault();
              await cancel.mutateAsync();
              onOpenChange(false);
            }}
            className="bg-destructive hover:bg-destructive/90"
          >
            Confirmar cancelamento
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
