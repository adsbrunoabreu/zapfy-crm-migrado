import { memo, useCallback, useEffect, useRef, useState } from 'react';
import { Ban, Check, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { LinkPreviewCard } from '@/components/chat/LinkPreviewCard';
import { useChatMediaUrl } from '@/hooks/useChatMediaUrl';
import { useUploadProgress } from '@/components/chat/uploadProgressStore';
import { canEditMessage } from '@/hooks/chat/useEditMessage';
import type { ChatMessage } from '@/hooks/useChatMessages';
import { formatMessageTime, StatusIcon } from './chatHelpers';
import { QuotedPreview } from './bubble/QuotedPreview';
import { UploadOverlay } from './bubble/UploadOverlay';
import { MessageActionsMenu } from './bubble/MessageActionsMenu';
import { MediaContent } from './bubble/MediaContent';

interface Props {
  msg: ChatMessage;
  quotedMessage?: ChatMessage | null;
  onDeferredContentLoaded?: () => void;
  onReply?: (msg: ChatMessage) => void;
  onReact?: (msg: ChatMessage, emoji: string) => void;
  onDelete?: (msg: ChatMessage) => void;
  onEdit?: (msg: ChatMessage, newText: string) => Promise<boolean | void> | void;
  onOpenImage?: (messageId: string) => void;
  onQuickReply?: (text: string, buttonId?: string | null) => void;
}

export const MessageBubble = memo(function MessageBubble({
  msg,
  quotedMessage,
  onDeferredContentLoaded,
  onReply,
  onReact,
  onDelete,
  onEdit,
  onOpenImage,
  onQuickReply,
}: Props) {
  const isMe = msg.from_me;
  const uploadPct = useUploadProgress(msg.message_id);
  const { toast } = useToast();

  const displayMediaUrl = useChatMediaUrl(msg.media_storage_path ?? null, msg.media_url);

  const handleCopy = useCallback(() => {
    if (msg.content) {
      navigator.clipboard.writeText(msg.content);
      toast({ title: 'Copiado', description: 'Mensagem copiada para a área de transferência.' });
    }
  }, [msg.content, toast]);

  const handleDownload = useCallback(async () => {
    const url = displayMediaUrl || msg.media_url;
    if (!url) return;
    try {
      let downloadUrl = url;
      if (msg.media_storage_path) {
        const { data } = await supabase.storage
          .from('chat-media')
          .createSignedUrl(msg.media_storage_path, 3600);
        if (data?.signedUrl) downloadUrl = data.signedUrl;
      }

      const response = await fetch(downloadUrl);
      if (!response.ok) throw new Error('Falha no download');
      const blob = await response.blob();
      const objectUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = objectUrl;
      a.download = msg.file_name || `download_${Date.now()}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(objectUrl);
    } catch {
      window.open(url, '_blank');
    }
  }, [displayMediaUrl, msg.media_url, msg.media_storage_path, msg.file_name]);

  const hasMedia = !!(displayMediaUrl || msg.media_url);
  const editable = !!onEdit && canEditMessage(msg);

  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState('');
  const [savingEdit, setSavingEdit] = useState(false);
  const editTextareaRef = useRef<HTMLTextAreaElement | null>(null);

  const beginEdit = useCallback((m: ChatMessage) => {
    setEditValue(m.content || '');
    setIsEditing(true);
  }, []);

  useEffect(() => {
    if (isEditing) {
      requestAnimationFrame(() => {
        const el = editTextareaRef.current;
        if (el) {
          el.focus();
          const len = el.value.length;
          el.setSelectionRange(len, len);
        }
      });
    }
  }, [isEditing]);

  const cancelEdit = useCallback(() => {
    setIsEditing(false);
    setEditValue('');
  }, []);

  const submitEdit = useCallback(async () => {
    if (!onEdit) return;
    setSavingEdit(true);
    const ok = await onEdit(msg, editValue);
    setSavingEdit(false);
    if (ok !== false) {
      setIsEditing(false);
      setEditValue('');
    }
  }, [editValue, msg, onEdit]);

  const scrollToQuoted = useCallback((messageId: string) => {
    const el = document.querySelector(`[data-message-id="${messageId}"]`);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      el.classList.add('ring-2', 'ring-primary/50', 'rounded-lg');
      setTimeout(() => el.classList.remove('ring-2', 'ring-primary/50', 'rounded-lg'), 1500);
    }
  }, []);

  return (
    <div
      data-message-id={msg.message_id}
      role="article"
      aria-label={`${isMe ? 'Você' : (msg.sender_name || 'Contato')}, ${formatMessageTime(msg.timestamp)}`}
      className={cn('flex group min-w-0 max-w-full px-2 sm:px-3', isMe ? 'justify-end' : 'justify-start', msg.reaction_emoji ? 'mb-4' : 'mb-1')}
    >
      <div className="relative max-w-[85%] sm:max-w-[75%] md:max-w-[70%] lg:max-w-[60%] xl:max-w-[55%] 2xl:max-w-[50%] min-w-0">
        {!msg._deletedLocally && !isEditing && (
          <MessageActionsMenu
            msg={msg}
            isMe={isMe}
            hasMedia={hasMedia}
            canEdit={editable}
            onReply={onReply}
            onReact={onReact}
            onDelete={onDelete}
            onEdit={beginEdit}
            onCopy={handleCopy}
            onDownload={handleDownload}
          />
        )}

        <div
          className={cn(
            'rounded-lg px-3 py-2 sm:px-3.5 sm:py-2.5 relative inline-block max-w-full min-w-0 overflow-hidden',
            isMe
              ? 'bg-[hsl(var(--chat-bubble-out))] text-[hsl(var(--chat-bubble-out-foreground))] rounded-tr-none'
              : 'bg-[hsl(var(--chat-bubble-in))] text-[hsl(var(--chat-bubble-in-foreground))] rounded-tl-none'
          )}
          style={{ boxShadow: 'var(--chat-bubble-shadow)' }}
        >
          {msg.quoted_message_id && quotedMessage && !msg._deletedLocally && !isEditing && (
            <QuotedPreview
              msg={msg}
              quoted={quotedMessage}
              isMe={isMe}
              onClickQuoted={scrollToQuoted}
            />
          )}
          {msg.link_preview && !msg._deletedLocally && !isEditing && <LinkPreviewCard preview={msg.link_preview} isMe={isMe} onLoaded={onDeferredContentLoaded} />}
          <div className="relative">
            {msg._deletedLocally ? (
              <p className="text-sm italic text-foreground/60 flex items-center gap-1.5">
                <Ban className="w-3.5 h-3.5" />
                Mensagem apagada
              </p>
            ) : isEditing ? (
              <div className="min-w-[220px] space-y-2">
                <textarea
                  ref={editTextareaRef}
                  value={editValue}
                  onChange={(e) => setEditValue(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Escape') {
                      e.preventDefault();
                      cancelEdit();
                    } else if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                      e.preventDefault();
                      void submitEdit();
                    }
                  }}
                  rows={Math.min(8, Math.max(2, (editValue.match(/\n/g)?.length || 0) + 1))}
                  className="w-full resize-y rounded-md border border-border/60 bg-background/30 px-2 py-1.5 text-sm leading-snug text-foreground outline-none focus:ring-1 focus:ring-primary"
                  disabled={savingEdit}
                />
                <div className="flex items-center justify-between text-[10px] text-foreground/60">
                  <span>Esc cancela · Ctrl/⌘+Enter salva</span>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={cancelEdit}
                      disabled={savingEdit}
                      className="inline-flex items-center gap-1 px-2 py-1 rounded hover:bg-foreground/10 disabled:opacity-50"
                    >
                      <X className="w-3.5 h-3.5" /> Cancelar
                    </button>
                    <button
                      type="button"
                      onClick={() => void submitEdit()}
                      disabled={savingEdit || !editValue.trim()}
                      className="inline-flex items-center gap-1 px-2 py-1 rounded bg-primary text-primary-foreground hover:opacity-90 disabled:opacity-50"
                    >
                      <Check className="w-3.5 h-3.5" /> {savingEdit ? 'Salvando…' : 'Salvar'}
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              <>
                <MediaContent
                  msg={msg}
                  displayMediaUrl={displayMediaUrl}
                  isMe={isMe}
                  onOpenLightbox={() => onOpenImage?.(msg.message_id)}
                  onDownload={handleDownload}
                  onDeferredContentLoaded={onDeferredContentLoaded}
                  onQuickReply={onQuickReply}
                />
                {(msg.status === 'uploading' || msg.status === 'sending') && hasMedia && (
                  <UploadOverlay status={msg.status} uploadPct={uploadPct} />
                )}
              </>
            )}
          </div>
          {!isEditing && (
            <span
              className={cn(
                'flex items-center justify-end gap-1.5 mt-1 h-3.5 sm:h-4 leading-none whitespace-nowrap',
                hasMedia ? 'pt-0.5' : 'float-right ml-2.5 sm:ml-3 -mb-0.5'
              )}
            >
              {(msg._edited || msg.edited_at) && (
                <span className="text-[10px] italic text-foreground/55 leading-none">editada</span>
              )}
              <span className="text-[10px] sm:text-[10px] font-normal text-foreground/65 leading-none tabular-nums">
                {formatMessageTime(msg.timestamp)}
              </span>
              {isMe && (
                <span className="inline-flex items-center shrink-0 ml-0.5">
                  <StatusIcon status={msg.status} />
                </span>
              )}
            </span>
          )}
        </div>
        {msg.reaction_emoji && !isEditing && (
          <div className="absolute -bottom-3 left-2 bg-card border border-border/50 rounded-full px-1.5 py-0.5 text-xs shadow-sm z-10 leading-none">
            {msg.reaction_emoji}
          </div>
        )}
      </div>
    </div>
  );
});
