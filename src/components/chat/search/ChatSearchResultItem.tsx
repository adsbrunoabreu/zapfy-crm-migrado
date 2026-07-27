import { memo } from 'react';
import { format, isToday, isYesterday } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Image as ImageIcon, Video, FileText, Mic, MapPin, MessageSquare } from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatPhoneBR } from '@/lib/phoneFormat';
import type { ChatSearchResultRow, ChatSearchSnippet } from '@/hooks/chat/useChatSearch';

interface Props {
  row: ChatSearchResultRow;
  query: string;
  onJump: (conversationId: string, snippet: ChatSearchSnippet) => void;
}

const STATUS_LABEL: Record<string, { label: string; className: string }> = {
  closed: { label: 'Encerrada', className: 'bg-muted text-muted-foreground' },
  in_progress: { label: 'Em atendimento', className: 'bg-primary/15 text-primary' },
  waiting: { label: 'Aguardando', className: 'bg-amber-500/15 text-amber-500' },
};

function snippetIcon(type: string) {
  if (type === 'image') return <ImageIcon className="w-3 h-3" />;
  if (type === 'video') return <Video className="w-3 h-3" />;
  if (type === 'audio') return <Mic className="w-3 h-3" />;
  if (type === 'document') return <FileText className="w-3 h-3" />;
  if (type === 'location') return <MapPin className="w-3 h-3" />;
  return null;
}

function highlight(text: string, q: string) {
  if (!q || !text) return text;
  const idx = text.toLowerCase().indexOf(q.toLowerCase());
  if (idx < 0) return text;
  const start = Math.max(0, idx - 30);
  const end = Math.min(text.length, idx + q.length + 60);
  const head = start > 0 ? '…' : '';
  const tail = end < text.length ? '…' : '';
  const before = text.slice(start, idx);
  const match = text.slice(idx, idx + q.length);
  const after = text.slice(idx + q.length, end);
  return (
    <>
      {head}
      {before}
      <mark className="bg-primary/30 text-foreground rounded px-0.5">{match}</mark>
      {after}
      {tail}
    </>
  );
}

function formatStamp(iso: string) {
  const d = new Date(iso);
  if (isToday(d)) return format(d, 'HH:mm', { locale: ptBR });
  if (isYesterday(d)) return `Ontem ${format(d, 'HH:mm', { locale: ptBR })}`;
  return format(d, "dd/MM/yy HH:mm", { locale: ptBR });
}

export const ChatSearchResultItem = memo(function ChatSearchResultItem({ row, query, onJump }: Props) {
  const status = row.conv_closed_at ? 'closed' : row.ticket_status === 'closed' ? 'closed' : row.ticket_assigned_to ? 'in_progress' : 'waiting';
  const badge = STATUS_LABEL[status];
  const initials = (row.contact_name || row.phone || '?').slice(0, 2).toUpperCase();

  return (
    <div className="rounded-lg border border-border/50 bg-card/40 hover:bg-card/70 transition-colors overflow-hidden">
      <button
        type="button"
        onClick={() => onJump(row.conversation_id, row.snippets[0] ?? ({} as ChatSearchSnippet))}
        className="w-full flex items-center gap-2.5 px-3 py-2 text-left"
      >
        <div className="w-8 h-8 rounded-full bg-primary/10 text-primary flex items-center justify-center text-xs font-semibold shrink-0 overflow-hidden">
          {row.contact_photo_url ? (
            <img src={row.contact_photo_url} alt="" className="w-full h-full object-cover" />
          ) : initials}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium truncate">{row.contact_name || formatPhoneBR(row.phone)}</span>
            {row.unread_count > 0 && (
              <span className="text-[10px] bg-primary text-primary-foreground rounded-full px-1.5 py-0.5 font-semibold tabular-nums">
                {row.unread_count}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
            <span className="truncate">{formatPhoneBR(row.phone)}</span>
            <span className={cn('px-1.5 py-0.5 rounded-full text-[10px]', badge.className)}>{badge.label}</span>
            {row.match_count > 0 && (
              <span className="ml-auto tabular-nums">{row.match_count} {row.match_count === 1 ? 'mensagem' : 'mensagens'}</span>
            )}
          </div>
        </div>
      </button>

      {row.snippets.length > 0 && (
        <div className="border-t border-border/40">
          {row.snippets.map((s) => {
            const icon = snippetIcon(s.message_type);
            const text = s.content || s.file_name || (s.message_type === 'audio' ? 'Áudio' : s.message_type === 'image' ? 'Imagem' : s.message_type);
            return (
              <button
                key={s.id}
                type="button"
                onClick={() => onJump(row.conversation_id, s)}
                className="w-full text-left px-3 py-1.5 text-xs hover:bg-accent/40 border-t first:border-t-0 border-border/30 flex items-start gap-2"
              >
                {icon && <span className="mt-0.5 text-muted-foreground shrink-0">{icon}</span>}
                <span className="flex-1 min-w-0 text-muted-foreground">
                  <span className="text-foreground/90">{s.from_me ? 'Você: ' : ''}</span>
                  {highlight(text, query)}
                </span>
                <span className="shrink-0 text-[10px] text-muted-foreground/70 tabular-nums whitespace-nowrap">
                  {formatStamp(s.timestamp)}
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
});
