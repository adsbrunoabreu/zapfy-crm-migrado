import { useState } from 'react';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, UserPlus, Copy, Check, Mail } from 'lucide-react';
import { useCreateUserInvite } from '@/hooks/useAllUsers';
import { useCompanies } from '@/hooks/useCompanies';
import { toast } from 'sonner';
import { ALL_ROLE_OPTIONS, type AppRole } from '@/lib/roles';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function UserCreateDrawer({ open, onOpenChange }: Props) {
  const create = useCreateUserInvite();
  const { data: companies = [] } = useCompanies();

  const [email, setEmail] = useState('');
  const [role, setRole] = useState<AppRole>('agente');
  const [companyId, setCompanyId] = useState<string>('__none__');
  const [inviteLink, setInviteLink] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const reset = () => {
    setEmail('');
    setRole('agente');
    setCompanyId('__none__');
    setInviteLink(null);
    setCopied(false);
  };

  const close = (o: boolean) => {
    if (!o) reset();
    onOpenChange(o);
  };

  const handleCreate = async () => {
    if (!email.trim()) return toast.error('Informe o e-mail');
    if (role !== 'master' && companyId === '__none__') {
      return toast.error('Selecione a empresa para este papel');
    }
    try {
      const data = await create.mutateAsync({
        email: email.trim(),
        role,
        company_id: companyId === '__none__' ? null : companyId,
      });
      const url = `${window.location.origin}/auth?invite=${data.token}`;
      setInviteLink(url);
      toast.success('Convite criado');
    } catch (e: any) {
      toast.error(e.message || 'Erro ao criar convite');
    }
  };

  const handleCopy = async () => {
    if (!inviteLink) return;
    await navigator.clipboard.writeText(inviteLink);
    setCopied(true);
    toast.success('Link copiado');
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <Sheet open={open} onOpenChange={close}>
      <SheetContent className="w-full sm:max-w-xl h-[100dvh] overflow-hidden p-0 flex flex-col">
        <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain">
          <div className="p-6 flex flex-col gap-4">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <UserPlus className="w-5 h-5 text-primary" />
            Novo usuário
          </SheetTitle>
          <SheetDescription>
            Gera um link de convite. O usuário cria a conta e entra automaticamente na empresa.
          </SheetDescription>
        </SheetHeader>

        {!inviteLink ? (
          <div className="space-y-5 py-6">
            <div className="space-y-2">
              <Label>E-mail</Label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
                <Input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="usuario@empresa.com"
                  className="pl-9"
                  autoFocus
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Papel</Label>
              <Select value={role} onValueChange={(v) => setRole(v as AppRole)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {ALL_ROLE_OPTIONS.map((r) => (
                    <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Empresa {role === 'master' && <span className="text-muted-foreground text-xs">(opcional para Master)</span>}</Label>
              <Select value={companyId} onValueChange={setCompanyId}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">— Sem empresa —</SelectItem>
                  {companies.map((c) => (
                    <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <Button onClick={handleCreate} disabled={create.isPending} className="w-full">
              {create.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Gerar convite
            </Button>
          </div>
        ) : (
          <div className="space-y-5 py-6">
            <div className="rounded-lg border border-emerald/30 bg-emerald/10 p-4">
              <p className="text-sm text-emerald font-medium mb-2">Convite criado!</p>
              <p className="text-xs text-muted-foreground">
                Envie este link para <strong className="text-foreground">{email}</strong>. O convite expira em 7 dias.
              </p>
            </div>

            <div className="space-y-2">
              <Label>Link do convite</Label>
              <div className="flex gap-2">
                <Input value={inviteLink} readOnly className="font-mono text-xs" />
                <Button onClick={handleCopy} variant="outline" size="icon" className="shrink-0">
                  {copied ? <Check className="w-4 h-4 text-emerald" /> : <Copy className="w-4 h-4" />}
                </Button>
              </div>
            </div>

            <div className="flex gap-2">
              <Button variant="outline" onClick={reset} className="flex-1">Criar outro</Button>
              <Button onClick={() => close(false)} className="flex-1">Fechar</Button>
            </div>
          </div>
        )}
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
