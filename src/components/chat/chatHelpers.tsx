import { memo, useEffect, useState } from 'react';
import { format, isToday, isYesterday } from 'date-fns';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Check, CheckCheck, Loader2, AlertCircle, Phone } from 'lucide-react';
import { photoQueue } from '@/services/photoQueue';
import type { Conversation } from '@/hooks/useConversations';

export const SELECTED_CONV_STORAGE_KEY = 'chat:selectedConversationId';

export const QUICK_REACTIONS = ['👍', '❤️', '😂', '😮', '🙏', '🙌'];
export const EXTRA_EMOJIS = [
  '😍', '🥰', '😘', '😭', '🤣', '😅', '😎', '🤔', '🙄', '😡',
  '🔥', '💯', '🎉', '👏', '💪', '🤝', '👋', '✅', '❌', '⭐',
  '💔', '💕', '🥳', '😢', '🤗', '😱', '🤩', '👀', '🫡', '🤙',
];

export function formatMessageTime(dateStr: string) {
  const d = new Date(dateStr);
  return format(d, 'HH:mm');
}

export function formatConversationDate(dateStr: string | null) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  if (isToday(d)) return format(d, 'HH:mm');
  if (isYesterday(d)) return 'Ontem';
  return format(d, 'dd/MM/yyyy');
}

export function getInitials(name: string | null | undefined): string {
  const clean = (name ?? '').trim();
  if (clean && /\p{L}/u.test(clean)) {
    const parts = clean.split(/\s+/).filter(Boolean);
    const initials = parts.slice(0, 2).map((w) => w[0]).join('');
    if (initials) return initials.toUpperCase();
  }
  return '';
}


export function StatusIcon({ status }: { status: string }) {
  switch (status) {
    case 'uploading':
    case 'sending':
      return <Loader2 aria-label="Enviando" className="w-3.5 h-3.5 text-muted-foreground animate-spin" />;
    case 'pending':
    case 'queued':
      return <Check aria-label="Na fila" className="w-3.5 h-3.5 text-muted-foreground" />;
    case 'sent':
      return <CheckCheck aria-label="Enviado" className="w-3.5 h-3.5 text-muted-foreground" />;
    case 'delivered':
      return <CheckCheck aria-label="Entregue" className="w-3.5 h-3.5 text-muted-foreground" />;
    case 'read':
    case 'played':
      return <CheckCheck aria-label="Lido" className="w-3.5 h-3.5 text-[hsl(var(--cyan))]" />;
    case 'error':
    case 'failed':
      return <AlertCircle aria-label="Falha no envio" className="w-3.5 h-3.5 text-destructive" />;
    default:
      return null;
  }
}

export function useContactPhoto(phone: string, dbUrl: string | null | undefined, convId: string): string | null {
  if (dbUrl) {
    photoQueue.setCache(phone, dbUrl);
  }

  const cached = photoQueue.getCached(phone);
  const [photoUrl, setPhotoUrl] = useState<string | null>(cached ?? dbUrl ?? null);

  useEffect(() => {
    if (dbUrl) {
      setPhotoUrl(dbUrl);
      return;
    }

    const hit = photoQueue.getCached(phone);
    if (hit !== undefined) {
      setPhotoUrl(hit);
      return;
    }

    // Limpa foto anterior antes do request async, senão o header herda
    // o avatar da conversa anteriormente selecionada.
    setPhotoUrl(null);

    let cancelled = false;
    photoQueue.request(phone).then((url) => {
      if (!cancelled) setPhotoUrl(url);
    });

    return () => { cancelled = true; };
  }, [phone, dbUrl, convId]);

  return photoUrl;
}

export const ConversationAvatar = memo(function ConversationAvatar({
  conv,
  badge,
}: { conv: Conversation; badge?: React.ReactNode }) {
  const photoUrl = useContactPhoto(conv.phone, conv.contact_photo_url, conv.id);
  return (
    <div className="relative shrink-0">
      <Avatar className="w-10 h-10">
        {photoUrl && <AvatarImage src={photoUrl} />}
        <AvatarFallback className="bg-primary/10 text-primary text-sm font-medium">
          {getInitials(conv.contact_name) || <Phone className="w-4 h-4" />}
        </AvatarFallback>
      </Avatar>
      {badge && (
        <span className="absolute -bottom-0.5 -right-0.5 inline-flex rounded-full ring-2 ring-card">
          {badge}
        </span>
      )}
    </div>
  );
});

