import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { AlertTriangle, Loader2, Mail, Trash2, KeyRound, ShieldCheck, Settings2 } from 'lucide-react';
import { useUpdateMemberProfile, useResetMemberPassword } from '@/hooks/useUpdateMemberProfile';
import { useToggleUserActive } from '@/hooks/useToggleUserActive';
import { useRemoveMember } from '@/hooks/useRemoveMember';
import { useUpdateMemberEmail } from '@/hooks/useMemberCrm';
import { useAuth } from '@/contexts/AuthContext';
import { AvatarUpload } from './AvatarUpload';
import { supabase } from '@/integrations/supabase/client';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
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

interface Props {
  member: any;
  isSelf: boolean;
  onClose: () => void;
  onStateChange?: (s: { dirty: boolean; isPending: boolean; save: () => void }) => void;
}

export function ProfileTab({ member, isSelf, onClose, onStateChange }: Props) {
  const [fullName, setFullName] = useState(member?.name || '');
  const [phone, setPhone] = useState(member?.phone || '');
  const [avatarUrl, setAvatarUrl] = useState(member?.avatarUrl || '');
  const [email, setEmail] = useState(member?.email || '');
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [confirmName, setConfirmName] = useState('');
  const [removingAvatar, setRemovingAvatar] = useState(false);

  const { profile } = useAuth();
  const canEditEmail =
    !isSelf &&
    (profile?.role === 'admin' || profile?.role === 'master');

  const update = useUpdateMemberProfile();
  const toggleActive = useToggleUserActive();
  const reset = useResetMemberPassword();
  const remove = useRemoveMember();
  const updateEmail = useUpdateMemberEmail();

  useEffect(() => {
    setFullName(member?.name || '');
    setPhone(member?.phone || '');
    setAvatarUrl(member?.avatarUrl || '');
    setEmail(member?.email || '');
  }, [member?.id]);

  const isActive = member?.isActive !== false;
  const emailDirty = canEditEmail && email.trim().toLowerCase() !== (member?.email || '').toLowerCase() && /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email.trim());
  const profileDirty =
    fullName !== (member?.name || '') ||
    phone !== (member?.phone || '') ||
    avatarUrl !== (member?.avatarUrl || '');
  const dirty = profileDirty || emailDirty;

  function extractAvatarPath(url: string): string | null {
    try {
      const u = new URL(url);
      const prefix = '/storage/v1/object/public/avatars/';
      if (u.pathname.startsWith(prefix)) {
        return decodeURIComponent(u.pathname.slice(prefix.length));
      }
    } catch {
      // ignore invalid URLs
    }
    return null;
  }

  const handleAvatarChange = async (url: string | null) => {
    if (url === null && avatarUrl) {
      setRemovingAvatar(true);
      try {
        const path = extractAvatarPath(avatarUrl);
        if (path) {
          const { error } = await supabase.storage.from('avatars').remove([path]);
          if (error) {
            console.warn('Erro ao remover avatar do storage:', error.message);
          }
        }
      } finally {
        setRemovingAvatar(false);
      }
    }
    setAvatarUrl(url || '');
    update.mutate({ userId: member.id, avatar_url: url });
  };

  const handleSave = () => {
    if (profileDirty) {
      update.mutate({
        userId: member.id,
        full_name: fullName.trim() || null,
        phone: phone.trim() || null,
        avatar_url: avatarUrl.trim() || null,
      });
    }
    if (emailDirty) {
      updateEmail.mutate({ memberId: member.id, email: email.trim().toLowerCase() });
    }
  };

  useEffect(() => {
    onStateChange?.({
      dirty,
      isPending: update.isPending || updateEmail.isPending,
      save: handleSave,
    });
  }, [dirty, update.isPending, updateEmail.isPending, fullName, phone, avatarUrl, email]);

  return (
    <div className="space-y-3">
      <div className="flex items-start gap-3">
        <AvatarUpload
          userId={member.id}
          avatarUrl={avatarUrl || null}
          fallback={(fullName || member?.email || '?')[0]?.toUpperCase()}
          removing={removingAvatar}
          onChange={handleAvatarChange}
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label className="text-xs">Nome completo</Label>
          <Input value={fullName} onChange={(e) => setFullName(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Telefone</Label>
          <Input
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="+55 11 99999-9999"
          />
        </div>
      </div>

      <div className="space-y-1.5">
        <Label className="text-xs">E-mail</Label>
        <Input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          disabled={!canEditEmail}
        />
        {!canEditEmail && (
          <p className="text-[11px] text-muted-foreground">
            Apenas administradores podem alterar o e-mail.
          </p>
        )}
      </div>

      {!onStateChange && (
        <div className="flex justify-end">
          <Button
            size="sm"
            variant="glow"
            onClick={handleSave}
            disabled={!dirty || update.isPending}
          >
            {update.isPending && <Loader2 className="w-3.5 h-3.5 mr-2 animate-spin" />}
            Salvar alterações
          </Button>
        </div>
      )}

      <Accordion type="single" collapsible className="w-full">
        <AccordionItem value="status" className="border border-border rounded-lg px-3">
          <AccordionTrigger className="py-2.5 text-sm hover:no-underline">
            <div className="flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-muted-foreground" />
              <span>Status do acesso</span>
              <span className={`text-xs px-1.5 py-0.5 rounded ${isActive ? 'bg-primary/10 text-primary' : 'bg-destructive/10 text-destructive'}`}>
                {isActive ? 'Ativo' : 'Desativado'}
              </span>
            </div>
          </AccordionTrigger>
          <AccordionContent>
            <div className="flex items-center justify-between rounded-md border border-border bg-card/40 p-3">
              <div>
                <p className="text-sm font-medium">
                  {isActive ? 'Usuário ativo' : 'Usuário desativado'}
                </p>
                <p className="text-xs text-muted-foreground">
                  {isActive
                    ? 'Pode acessar o sistema normalmente.'
                    : 'Não consegue fazer login.'}
                </p>
              </div>
              <Switch
                checked={isActive}
                disabled={isSelf || toggleActive.isPending}
                onCheckedChange={(v) =>
                  toggleActive.mutate({ userId: member.id, isActive: v })
                }
              />
            </div>
            {isSelf && (
              <p className="text-xs text-muted-foreground mt-2">
                Você não pode desativar a própria conta.
              </p>
            )}
          </AccordionContent>
        </AccordionItem>

        <AccordionItem value="actions" className="border border-border rounded-lg px-3 mt-2">
          <AccordionTrigger className="py-2.5 text-sm hover:no-underline">
            <div className="flex items-center gap-2">
              <Settings2 className="w-4 h-4 text-muted-foreground" />
              <span>Outras ações</span>
            </div>
          </AccordionTrigger>
          <AccordionContent>
            <div className="grid gap-2">
              <Button
                size="sm"
                variant="outline"
                className="justify-start"
                onClick={() => reset.mutate(member.email)}
                disabled={reset.isPending}
              >
                <KeyRound className="w-4 h-4 mr-2" />
                Enviar e-mail de redefinição de senha
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="justify-start"
                onClick={() => window.open(`mailto:${member.email}`)}
              >
                <Mail className="w-4 h-4 mr-2" />
                Enviar e-mail direto
              </Button>
              {!isSelf && (
                <Button
                  size="sm"
                  variant="outline"
                  className="justify-start text-destructive hover:text-destructive"
                  onClick={() => setConfirmRemove(true)}
                >
                  <Trash2 className="w-4 h-4 mr-2" />
                  Remover membro da equipe
                </Button>
              )}
            </div>
          </AccordionContent>
        </AccordionItem>
      </Accordion>

      <AlertDialog open={confirmRemove} onOpenChange={(o) => {
        if (!o) setConfirmName('');
        setConfirmRemove(o);
      }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-destructive" />
              Remover {member?.name}?
            </AlertDialogTitle>
            <AlertDialogDescription className="space-y-3">
              <p>O membro perderá o acesso à empresa. Esta ação não pode ser desfeita.</p>
              <div className="space-y-2">
                <Label htmlFor="confirm-name-drawer" className="text-muted-foreground text-xs">
                  Digite o nome do membro para confirmar
                </Label>
                <Input
                  id="confirm-name-drawer"
                  value={confirmName}
                  onChange={(e) => setConfirmName(e.target.value)}
                  placeholder={member?.name || ''}
                  disabled={remove.isPending}
                  autoComplete="off"
                />
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setConfirmName('')}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() =>
                remove.mutate(member.id, {
                  onSuccess: () => {
                    setConfirmRemove(false);
                    setConfirmName('');
                    onClose();
                  },
                })
              }
              disabled={remove.isPending || confirmName.trim().toLowerCase() !== (member?.name || '').trim().toLowerCase()}
            >
              {remove.isPending ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                'Remover'
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
