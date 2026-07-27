import { useEffect, useState } from 'react';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, UserCog } from 'lucide-react';
import { useUpdateUser, type AdminUser } from '@/hooks/useAllUsers';
import { useCompanies } from '@/hooks/useCompanies';
import { useToast } from '@/hooks/use-toast';
import { ALL_ROLE_OPTIONS, type AppRole } from '@/lib/roles';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  user: AdminUser | null;
}

const normalizeRole = (r: string): AppRole => {
  if (r === 'company_admin') return 'admin';
  if (r === 'user') return 'agente';
  return r as AppRole;
};

export function UserEditDrawer({ open, onOpenChange, user }: Props) {
  const { toast } = useToast();
  const update = useUpdateUser();
  const { data: companies = [] } = useCompanies();

  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [companyId, setCompanyId] = useState<string>('__none__');
  const [role, setRole] = useState<AppRole>('agente');
  const [isActive, setIsActive] = useState(true);

  useEffect(() => {
    if (user) {
      setFullName(user.full_name || '');
      setPhone(user.phone || '');
      setCompanyId(user.company_id || '__none__');
      setRole(normalizeRole(user.role));
      setIsActive(user.is_active);
    }
  }, [user]);

  const handleSave = async () => {
    if (!user) return;
    try {
      await update.mutateAsync({
        id: user.id,
        full_name: fullName,
        phone: phone || null,
        company_id: companyId === '__none__' ? null : companyId,
        role,
        is_active: isActive,
      });
      toast({ title: 'Usuário atualizado' });
      onOpenChange(false);
    } catch (err: any) {
      toast({ title: 'Erro', description: err.message, variant: 'destructive' });
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-xl h-[100dvh] overflow-hidden p-0 flex flex-col">
        <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain">
          <div className="p-6 flex flex-col gap-4">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <UserCog className="w-5 h-5 text-primary" />
            Editar usuário
          </SheetTitle>
          <SheetDescription>{user?.email}</SheetDescription>
        </SheetHeader>

        <div className="space-y-5 py-6">
          <div className="space-y-2">
            <Label>Nome completo</Label>
            <Input value={fullName} onChange={(e) => setFullName(e.target.value)} />
          </div>

          <div className="space-y-2">
            <Label>Telefone</Label>
            <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="(11) 99999-9999" />
          </div>

          <div className="space-y-2">
            <Label>Empresa</Label>
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

          <div className="flex items-center justify-between rounded-lg border border-border p-3">
            <div>
              <Label htmlFor="active" className="cursor-pointer">Usuário ativo</Label>
              <p className="text-xs text-muted-foreground mt-0.5">Inativos não conseguem entrar</p>
            </div>
            <Switch id="active" checked={isActive} onCheckedChange={setIsActive} />
          </div>

          <Button onClick={handleSave} disabled={update.isPending} className="w-full">
            {update.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            Salvar alterações
          </Button>
        </div>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
