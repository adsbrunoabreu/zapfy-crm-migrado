import { memo } from 'react';
import { cn } from '@/lib/utils';
import type { ChatMessage } from '@/hooks/useChatMessages';

interface Props {
  msg: ChatMessage;
  quoted: ChatMessage;
  isMe: boolean;
  onClickQuoted: (id: string) => void;
}

export const QuotedPreview = memo(function QuotedPreview({ msg, quoted, isMe, onClickQuoted }: Props) {
  const quotedPreview = quoted.content
    ? quoted.content.length > 80 ? quoted.content.slice(0, 80) + '…' : quoted.content
    : quoted.message_type === 'image' ? '📷 Imagem'
    : quoted.message_type === 'audio' ? '🎵 Áudio'
    : quoted.message_type === 'video' ? '🎬 Vídeo'
    : quoted.message_type === 'document' ? '📄 Documento'
    : quoted.message_type === 'sticker' ? '🏷️ Sticker'
    : quoted.message_type === 'location' ? '📍 Localização'
    : 'Mensagem';

  return (
    <div
      onClick={() => msg.quoted_message_id && onClickQuoted(msg.quoted_message_id)}
      className={cn(
        'mb-1 p-1.5 rounded border-l-2 border-primary text-xs cursor-pointer hover:opacity-80 transition-opacity',
        isMe ? 'bg-[hsl(var(--chat-bubble-quote-out))]' : 'bg-[hsl(var(--chat-bubble-quote-in))]'
      )}
    >
      <p className="font-semibold mb-0.5 text-primary">
        {quoted.from_me ? 'Você' : (quoted.sender_name || 'Contato')}
      </p>
      <p className="truncate text-muted-foreground">{quotedPreview}</p>
    </div>
  );
});
