import { useState } from 'react';
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useCreateInvite } from '@/hooks/useTeamInvites';
import { usePlanLimitGuard } from '@/hooks/usePlanLimitGuard';
import { Mail, AlertCircle, Loader2, Lock } from 'lucide-react';
import { z } from 'zod';
import { TENANT_ROLE_OPTIONS, type AppRole } from '@/lib/roles';

type TenantRole = Exclude<AppRole, 'master'>;

interface InviteMemberDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const emailSchema = z.string().email('Email inválido');

export function InviteMemberDialog({ open, onOpenChange }: InviteMemberDialogProps) {
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<TenantRole>('agente');
  const [emailError, setEmailError] = useState('');

  const { mutate: createInvite, isPending } = useCreateInvite();
  const { canAddUser, userBlockedReason, usersRemaining, limits } = usePlanLimitGuard();

  const validateEmail = (value: string) => {
    try {
      emailSchema.parse(value);
      setEmailError('');
      return true;
    } catch {
      setEmailError('Email inválido');
      return false;
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!validateEmail(email)) return;

    createInvite(
      { email, role },
      {
        onSuccess: () => {
          setEmail('');
          setRole('agente');
          onOpenChange(false);
        },
      }
    );
  };

  const handleClose = () => {
    setEmail('');
    setRole('agente');
    setEmailError('');
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle className="font-display text-xl">Convidar Membro</DialogTitle>
          <DialogDescription>
            Envie um convite para um novo membro da equipe.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="email">Email do membro *</Label>
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                id="email"
                type="email"
                placeholder="email@exemplo.com"
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  if (emailError) validateEmail(e.target.value);
                }}
                className="pl-10"
              />
            </div>
            {emailError && (
              <p className="text-destructive text-sm flex items-center gap-1">
                <AlertCircle className="w-3 h-3" />
                {emailError}
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="role">Função *</Label>
            <Select value={role} onValueChange={(v) => setRole(v as TenantRole)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TENANT_ROLE_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    <div className="text-left">
                      <p className="font-medium">{opt.label}</p>
                      <p className="text-xs text-muted-foreground">{opt.description}</p>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {!canAddUser ? (
            <div className="bg-destructive/10 border border-destructive/30 rounded-lg p-3 text-sm flex items-start gap-2">
              <Lock className="w-4 h-4 mt-0.5 text-destructive shrink-0" />
              <p className="text-foreground">{userBlockedReason}</p>
            </div>
          ) : (
            <div className="bg-secondary/50 rounded-lg p-3 text-sm text-muted-foreground flex items-start gap-2">
              <AlertCircle className="w-4 h-4 mt-0.5 text-amber" />
              <p>
                Um convite será criado para este email. O membro terá <strong>7 dias</strong> para criar uma conta.
                {limits?.max_users != null && usersRemaining != null && (
                  <> Restam <strong>{usersRemaining}</strong> vaga(s) no seu plano.</>
                )}
              </p>
            </div>
          )}

          <DialogFooter className="pt-4">
            <Button type="button" variant="outline" onClick={handleClose}>
              Cancelar
            </Button>
            <Button type="submit" variant="glow" disabled={isPending || !email || !canAddUser}>
              {isPending ? (
                <Loader2 className="w-4 h-4 animate-spin mr-2" />
              ) : (
                <Mail className="w-4 h-4 mr-2" />
              )}
              Enviar Convite
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
