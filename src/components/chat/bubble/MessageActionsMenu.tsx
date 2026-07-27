import { memo, useState } from 'react';
import { ChevronDown, Reply, Copy, Download, Trash2, Smile, Pencil } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { QUICK_REACTIONS, EXTRA_EMOJIS } from '../chatHelpers';
import type { ChatMessage } from '@/hooks/useChatMessages';

interface Props {
  msg: ChatMessage;
  isMe: boolean;
  hasMedia: boolean;
  canEdit?: boolean;
  onReply?: (msg: ChatMessage) => void;
  onReact?: (msg: ChatMessage, emoji: string) => void;
  onDelete?: (msg: ChatMessage) => void;
  onEdit?: (msg: ChatMessage) => void;
  onCopy: () => void;
  onDownload: () => void;
}

export const MessageActionsMenu = memo(function MessageActionsMenu({
  msg, isMe, hasMedia, canEdit, onReply, onReact, onDelete, onEdit, onCopy, onDownload,
}: Props) {
  const [open, setOpen] = useState(false);
  const [showMore, setShowMore] = useState(false);

  return (
    <DropdownMenu open={open} onOpenChange={(v) => { setOpen(v); if (!v) setShowMore(false); }}>
      <DropdownMenuTrigger asChild>
        <button
          aria-label="Ações da mensagem"
          className={cn(
            'absolute top-1 z-10 w-6 h-6 flex items-center justify-center rounded-full transition-opacity',
            'opacity-0 group-hover:opacity-100 focus:opacity-100',
            'md:opacity-0 max-md:opacity-70',
            isMe
              ? 'right-1 bg-[hsl(var(--chat-bubble-out))]/80 hover:bg-[hsl(var(--chat-bubble-out))]'
              : 'right-1 bg-[hsl(var(--chat-bubble-in))]/80 hover:bg-[hsl(var(--chat-bubble-in))]'
          )}
        >
          <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align={isMe ? 'end' : 'start'} className="w-auto min-w-[200px]" onCloseAutoFocus={(e) => e.preventDefault()}>
        <div className="flex items-center gap-0.5 px-2 py-1.5 border-b border-border/50 flex-wrap">
          {QUICK_REACTIONS.map((emoji) => (
            <button
              key={emoji}
              className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-accent transition-colors text-lg"
              onClick={() => { onReact?.(msg, emoji); setOpen(false); }}
            >
              {emoji}
            </button>
          ))}
          <button
            className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-accent transition-colors text-sm text-muted-foreground"
            onClick={(e) => { e.preventDefault(); e.stopPropagation(); setShowMore(!showMore); }}
          >
            <Smile className="w-4 h-4" />
          </button>
        </div>
        {showMore && (
          <div className="grid grid-cols-6 gap-0.5 px-2 py-1.5 border-b border-border/50 max-h-32 overflow-y-auto">
            {EXTRA_EMOJIS.map((emoji) => (
              <button
                key={emoji}
                className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-accent transition-colors text-lg"
                onClick={() => { onReact?.(msg, emoji); setOpen(false); }}
              >
                {emoji}
              </button>
            ))}
          </div>
        )}
        <DropdownMenuItem onClick={() => onReply?.(msg)}>
          <Reply className="w-4 h-4 mr-2" />
          Responder
        </DropdownMenuItem>
        {msg.content && (
          <DropdownMenuItem onClick={onCopy}>
            <Copy className="w-4 h-4 mr-2" />
            Copiar
          </DropdownMenuItem>
        )}
        {canEdit && onEdit && (
          <DropdownMenuItem onClick={() => onEdit(msg)}>
            <Pencil className="w-4 h-4 mr-2" />
            Editar
          </DropdownMenuItem>
        )}
        {hasMedia && (
          <DropdownMenuItem onClick={onDownload}>
            <Download className="w-4 h-4 mr-2" />
            Baixar
          </DropdownMenuItem>
        )}
        {isMe && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              className="text-destructive focus:text-destructive"
              onClick={() => onDelete?.(msg)}
            >
              <Trash2 className="w-4 h-4 mr-2" />
              Apagar
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
});
