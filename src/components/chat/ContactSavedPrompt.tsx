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

interface ContactSavedPromptProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreateLead: () => void;
  title?: string;
  description?: string;
}

export function ContactSavedPrompt({
  open,
  onOpenChange,
  onCreateLead,
  title = 'Contato salvo',
  description = 'Deseja transformá-lo em um lead agora? Você poderá escolher o pipeline e a etapa.',
}: ContactSavedPromptProps) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Agora não</AlertDialogCancel>
          <AlertDialogAction onClick={onCreateLead}>Criar lead</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
