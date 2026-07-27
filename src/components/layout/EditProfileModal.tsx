import { useState, useRef, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Camera, Loader2, Save, X } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';

interface EditProfileModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const MIME_TO_EXT: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/webp': 'webp',
  'image/gif': 'gif',
};

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`${label} (timeout após ${ms / 1000}s)`)), ms)
    ),
  ]);
}

function friendlyError(err: any, fallback: string): string {
  const msg = String(err?.message || err || '');
  if (/Unexpected token|not valid JSON|<!DOCTYPE/i.test(msg)) {
    return 'Servidor indisponível no momento. Tente novamente em alguns segundos.';
  }
  if (/Failed to fetch|NetworkError|network/i.test(msg)) {
    return 'Falha de conexão. Verifique sua internet e tente novamente.';
  }
  if (/timeout/i.test(msg)) return msg;
  if (/row-level security|permission/i.test(msg)) {
    return 'Sem permissão para atualizar o perfil.';
  }
  return msg || fallback;
}

async function uploadWithRetry(fileName: string, file: File, attempts = 2): Promise<void> {
  let lastErr: any;
  for (let i = 0; i < attempts; i++) {
    try {
      const { error } = await withTimeout(
        supabase.storage.from('avatars').upload(fileName, file, {
          upsert: true,
          contentType: file.type,
          cacheControl: '3600',
        }),
        20000,
        'Falha ao enviar imagem'
      );
      if (error) throw error;
      return;
    } catch (e) {
      lastErr = e;
      if (i < attempts - 1) await new Promise(r => setTimeout(r, 800));
    }
  }
  throw lastErr;
}

export function EditProfileModal({ open, onOpenChange }: EditProfileModalProps) {
  const { user, profile, refreshProfile } = useAuth();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [fullName, setFullName] = useState(profile?.full_name || '');
  const [phone, setPhone] = useState(profile?.phone || '');
  const [avatarUrl, setAvatarUrl] = useState(profile?.avatar_url || '');
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);

  // Sync local state when profile changes / modal reopens
  useEffect(() => {
    if (open) {
      setFullName(profile?.full_name || '');
      setPhone(profile?.phone || '');
      setAvatarUrl(profile?.avatar_url || '');
      setAvatarFile(null);
      setPreviewUrl(null);
    }
  }, [open, profile]);

  // Revoke object URL when changed/unmounted
  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      toast.error('Selecione uma imagem');
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      toast.error('A imagem deve ter no máximo 2MB');
      return;
    }
    setAvatarFile(file);
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(URL.createObjectURL(file));
  };

  const handlePhoneChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    // Permitir apenas dígitos, espaços, parênteses, hífen e +
    const cleaned = e.target.value.replace(/[^\d\s()+-]/g, '');
    setPhone(cleaned);
  };

  const handleSave = async () => {
    if (!user) return;
    if (saving) return;
    setSaving(true);

    try {
      let finalAvatarUrl = avatarUrl;

      if (avatarFile) {
        const ext = MIME_TO_EXT[avatarFile.type] || 'jpg';
        const fileName = `${user.id}/avatar.${ext}`;

        try {
          await uploadWithRetry(fileName, avatarFile);
        } catch (uploadErr: any) {
          console.error('[EditProfile] upload error:', uploadErr);
          toast.error(friendlyError(uploadErr, 'Erro ao enviar a imagem'));
          setSaving(false);
          return;
        }

        const { data } = supabase.storage.from('avatars').getPublicUrl(fileName);
        finalAvatarUrl = `${data.publicUrl}?t=${Date.now()}`;
      }

      const { error } = await withTimeout(
        Promise.resolve(
          supabase
            .from('profiles')
            .update({
              full_name: fullName.trim() || null,
              phone: phone.trim() || null,
              avatar_url: finalAvatarUrl || null,
            })
            .eq('id', user.id)
        ),
        15000,
        'Falha ao salvar perfil'
      );

      if (error) throw error;

      await refreshProfile().catch(() => undefined);
      toast.success('Perfil atualizado!');
      onOpenChange(false);
    } catch (err: any) {
      console.error('[EditProfile] save error:', err);
      toast.error(friendlyError(err, 'Erro ao salvar'));
    } finally {
      setSaving(false);
    }
  };

  const displayUrl = previewUrl || avatarUrl;
  const initials = fullName
    ? fullName.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()
    : 'U';

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!saving) onOpenChange(v); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Editar Perfil</DialogTitle>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Avatar */}
          <div className="flex flex-col items-center gap-3">
            <div className="relative">
              <Avatar className="w-20 h-20 cursor-pointer" onClick={() => fileInputRef.current?.click()}>
                <AvatarImage src={displayUrl || undefined} />
                <AvatarFallback className="text-xl bg-primary/20 text-primary">
                  {initials}
                </AvatarFallback>
              </Avatar>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="absolute bottom-0 right-0 p-1.5 rounded-full bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
              >
                <Camera className="w-3.5 h-3.5" />
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/png,image/jpeg,image/webp,image/gif"
                className="hidden"
                onChange={handleFileChange}
              />
            </div>
            <p className="text-xs text-muted-foreground">Clique para alterar</p>
          </div>

          {/* Name */}
          <div className="space-y-2">
            <Label htmlFor="edit-name">Nome completo</Label>
            <Input
              id="edit-name"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="Seu nome"
              disabled={saving}
            />
          </div>

          {/* Phone */}
          <div className="space-y-2">
            <Label htmlFor="edit-phone">Telefone</Label>
            <Input
              id="edit-phone"
              value={phone}
              onChange={handlePhoneChange}
              placeholder="(11) 99999-9999"
              inputMode="tel"
              disabled={saving}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            <X className="w-4 h-4 mr-2" />
            Cancelar
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
            {saving ? 'Salvando...' : 'Salvar'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
