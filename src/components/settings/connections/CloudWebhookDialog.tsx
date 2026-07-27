import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import CloudWebhookInstructions from '@/components/setup/CloudWebhookInstructions';
import type { WhatsAppInstance } from './types';

interface Props {
  instance: WhatsAppInstance | null;
  onOpenChange: (o: boolean) => void;
}

export function CloudWebhookDialog({ instance, onOpenChange }: Props) {
  return (
    <Dialog open={!!instance} onOpenChange={(o) => !o && onOpenChange(false)}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Webhook do WhatsApp Cloud</DialogTitle>
          <DialogDescription>
            Use estes valores no painel da Meta para receber mensagens nesta conexão.
          </DialogDescription>
        </DialogHeader>
        {instance && (
          <CloudWebhookInstructions
            displayName={instance.display_name}
            verifyToken={
              ((instance.config as Record<string, unknown> | null)?.webhookVerifyToken as string) ||
              'token não disponível — recadastre a conexão'
            }
            onClose={() => onOpenChange(false)}
            closeLabel="Fechar"
          />
        )}
      </DialogContent>
    </Dialog>
  );
}
