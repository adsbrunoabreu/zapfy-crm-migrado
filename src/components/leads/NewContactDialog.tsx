import { useState, useEffect } from 'react';
import { Loader2, User, Phone, Mail } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useCreateLead } from '@/hooks/useLeads';
import { toast } from 'sonner';

interface NewContactDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Chamado após criar o contato. Recebe o lead criado para o caller decidir o próximo passo. */
  onCreated?: (lead: { id: string; name: string; phone: string | null; email: string | null }) => void;
}

function normalizePhoneNumber(phone: string): string {
  let cleaned = phone.replace(/\D/g, '');
  if (!cleaned.startsWith('55') && (cleaned.length === 10 || cleaned.length === 11)) {
    cleaned = '55' + cleaned;
  }
  return cleaned;
}

export function NewContactDialog({ open, onOpenChange, onCreated }: NewContactDialogProps) {
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const createLead = useCreateLead();

  useEffect(() => {
    if (!open) {
      setName('');
      setPhone('');
      setEmail('');
    }
  }, [open]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    const normalizedPhone = phone.trim() ? normalizePhoneNumber(phone) : null;

    createLead.mutate(
      {
        name: name.trim(),
        phone: normalizedPhone,
        email: email.trim() || null,
        pipeline_id: null,
        stage_id: null,
        status: 'new',
        notes: null,
        assigned_to: null,
        value: null,
        _silent: true,
      } as any,
      {
        onSuccess: (data) => {
          toast.success('Contato salvo!');
          onCreated?.({
            id: data.id,
            name: data.name,
            phone: data.phone,
            email: data.email,
          });
          onOpenChange(false);
        },
      }
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Novo contato</DialogTitle>
          <DialogDescription>
            Salve apenas os dados de contato. Você poderá transformá-lo em lead depois.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label className="text-sm font-medium">Nome</Label>
            <div className="relative">
              <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Nome do contato"
                className="pl-9 h-10"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-sm font-medium">Telefone</Label>
            <div className="relative">
              <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="(11) 99999-9999"
                className="pl-9 h-10"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-sm font-medium">E-mail</Label>
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="email@exemplo.com"
                className="pl-9 h-10"
              />
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={createLead.isPending || !name.trim()}>
              {createLead.isPending && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
              Salvar contato
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
