import { useState } from 'react';
import { z } from 'zod';
import { Loader2, Send, CheckCircle2 } from 'lucide-react';
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
import { Textarea } from '@/components/ui/textarea';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

const schema = z.object({
  requester_name: z.string().trim().min(2, 'Informe seu nome').max(100),
  requester_email: z.string().trim().email('E-mail inválido').max(255),
  company_name: z.string().trim().min(2, 'Informe a empresa').max(150),
  message: z.string().trim().max(1000).optional(),
});

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultCompanyName?: string;
  defaultEmail?: string;
  defaultName?: string;
  companyId?: string | null;
}

export function ReactivationRequestDialog({
  open,
  onOpenChange,
  defaultCompanyName = '',
  defaultEmail = '',
  defaultName = '',
  companyId = null,
}: Props) {
  const [form, setForm] = useState({
    requester_name: defaultName,
    requester_email: defaultEmail,
    company_name: defaultCompanyName,
    message: '',
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrors({});

    const parsed = schema.safeParse(form);
    if (!parsed.success) {
      const fieldErrors: Record<string, string> = {};
      parsed.error.issues.forEach((i) => {
        if (i.path[0]) fieldErrors[i.path[0] as string] = i.message;
      });
      setErrors(fieldErrors);
      return;
    }

    setSubmitting(true);
    const { error } = await supabase.from('reactivation_requests').insert([
      {
        requester_name: parsed.data.requester_name,
        requester_email: parsed.data.requester_email,
        company_name: parsed.data.company_name,
        message: parsed.data.message,
        company_id: companyId ?? undefined,
      },
    ]);
    setSubmitting(false);

    if (error) {
      toast.error('Não foi possível enviar', { description: error.message });
      return;
    }

    setSuccess(true);
    toast.success('Solicitação enviada com sucesso');
  };

  const handleClose = (next: boolean) => {
    if (!next) {
      setSuccess(false);
      setForm({
        requester_name: defaultName,
        requester_email: defaultEmail,
        company_name: defaultCompanyName,
        message: '',
      });
      setErrors({});
    }
    onOpenChange(next);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md">
        {success ? (
          <div className="py-6 text-center space-y-4">
            <div className="w-14 h-14 mx-auto rounded-full bg-[hsl(var(--emerald)/0.15)] flex items-center justify-center">
              <CheckCircle2 className="w-7 h-7 text-[hsl(var(--emerald))]" />
            </div>
            <div className="space-y-1">
              <h2 className="text-lg font-semibold">Solicitação enviada</h2>
              <p className="text-sm text-muted-foreground">
                O administrador do sistema entrará em contato pelo e-mail informado em breve.
              </p>
            </div>
            <Button className="w-full" onClick={() => handleClose(false)}>
              Fechar
            </Button>
          </div>
        ) : (
          <form onSubmit={handleSubmit}>
            <DialogHeader>
              <DialogTitle>Solicitar reativação do plano</DialogTitle>
              <DialogDescription>
                Preencha os dados abaixo e o administrador do sistema entrará em contato.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-4">
              <div className="space-y-1.5">
                <Label htmlFor="req-name">Seu nome</Label>
                <Input
                  id="req-name"
                  value={form.requester_name}
                  onChange={(e) => setForm({ ...form, requester_name: e.target.value })}
                  maxLength={100}
                  placeholder="Nome completo"
                />
                {errors.requester_name && (
                  <p className="text-xs text-rose">{errors.requester_name}</p>
                )}
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="req-company">Empresa</Label>
                <Input
                  id="req-company"
                  value={form.company_name}
                  onChange={(e) => setForm({ ...form, company_name: e.target.value })}
                  maxLength={150}
                  placeholder="Nome da empresa"
                />
                {errors.company_name && (
                  <p className="text-xs text-rose">{errors.company_name}</p>
                )}
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="req-email">E-mail para contato</Label>
                <Input
                  id="req-email"
                  type="email"
                  value={form.requester_email}
                  onChange={(e) => setForm({ ...form, requester_email: e.target.value })}
                  maxLength={255}
                  placeholder="voce@empresa.com"
                />
                {errors.requester_email && (
                  <p className="text-xs text-rose">{errors.requester_email}</p>
                )}
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="req-message">Mensagem (opcional)</Label>
                <Textarea
                  id="req-message"
                  value={form.message}
                  onChange={(e) => setForm({ ...form, message: e.target.value })}
                  maxLength={1000}
                  rows={3}
                  placeholder="Conte brevemente o motivo da solicitação"
                />
              </div>
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => handleClose(false)}>
                Cancelar
              </Button>
              <Button type="submit" disabled={submitting}>
                {submitting ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <Send className="w-4 h-4 mr-2" />
                )}
                Enviar solicitação
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
