import { memo, useState, useEffect, useCallback } from 'react';
import { Loader2, Image as ImageIcon, Download, FileText, Play } from 'lucide-react';
import { cn } from '@/lib/utils';
import { linkifyText } from '@/lib/linkify';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import AudioPlayer from '@/components/chat/AudioPlayer';
import { ensureEvolutionMedia, resetEvolutionMediaFailure } from '@/lib/ensureEvolutionMedia';
import type { ChatMessage } from '@/hooks/useChatMessages';

interface Props {
  msg: ChatMessage;
  displayMediaUrl: string | null;
  isMe: boolean;
  onOpenLightbox: () => void;
  onDownload: () => void;
  onDeferredContentLoaded?: () => void;
  onQuickReply?: (text: string, buttonId?: string | null) => void;
}

export const MediaContent = memo(function MediaContent({
  msg, displayMediaUrl, isMe, onOpenLightbox, onDownload, onDeferredContentLoaded, onQuickReply,
}: Props) {
  const [imgError, setImgError] = useState(false);
  const [imgLoading, setImgLoading] = useState(true);
  const [videoError, setVideoError] = useState(false);
  const [retryKey, setRetryKey] = useState(0);
  const [fetching, setFetching] = useState(false);

  useEffect(() => {
    setImgError(false);
    setImgLoading((msg.message_type === 'image' || msg.message_type === 'sticker') && !!displayMediaUrl);
    setVideoError(false);
  }, [displayMediaUrl, msg.message_type, retryKey]);

  // IMPORTANTE: o download de mídia inbound Evolution NÃO é mais automático.
  // Antes causava OOM/travamento ao abrir conversas com muitas mídias .enc.
  // Agora o usuário clica em "Carregar mídia" para baixar sob demanda.
  const handleFetchMedia = useCallback(async () => {
    if (fetching) return;
    setFetching(true);
    resetEvolutionMediaFailure(msg.message_id);
    try {
      await ensureEvolutionMedia(msg);
    } finally {
      setFetching(false);
    }
  }, [msg, fetching]);

  const handleRetryImage = useCallback(async () => {
    if (!msg.media_storage_path) {
      await handleFetchMedia();
    } else {
      try {
        await supabase.storage.from('chat-media').createSignedUrl(msg.media_storage_path, 3600);
      } catch {}
    }
    setImgError(false);
    setImgLoading(true);
    setRetryKey(k => k + 1);
  }, [msg.media_storage_path, handleFetchMedia]);

  const needsManualFetch = !msg.media_storage_path && !displayMediaUrl &&
    (msg.message_type === 'image' || msg.message_type === 'video' ||
     msg.message_type === 'sticker' || msg.message_type === 'document');

  // Quando o backend ainda não classificou como `interactive` mas o
  // `link_preview` já carrega botões/lista/template, forçamos o renderizador
  // interativo para o usuário ver as opções.
  const lpType = (msg as any)?.link_preview?.type as string | undefined;
  const effectiveType =
    msg.message_type !== 'interactive' &&
    (lpType === 'buttons' || lpType === 'list' || lpType === 'template')
      ? 'interactive'
      : msg.message_type;

  if (needsManualFetch) {
    const labels: Record<string, string> = {
      image: 'imagem', video: 'vídeo', sticker: 'figurinha', document: 'documento',
    };
    const label = labels[effectiveType] || 'mídia';
    return (
      <div className="flex flex-col gap-2 p-3 rounded-lg bg-muted/30 border border-border/40 max-w-full sm:max-w-[260px]">
        <div className="flex items-center gap-2">
          {effectiveType === 'document' ? (
            <FileText className="w-4 h-4 text-muted-foreground" />
          ) : effectiveType === 'video' ? (
            <Play className="w-4 h-4 text-muted-foreground" />
          ) : (
            <ImageIcon className="w-4 h-4 text-muted-foreground" />
          )}
          <span className="text-xs text-muted-foreground">
            {fetching ? `Carregando ${label}…` : `${label[0].toUpperCase() + label.slice(1)} disponível`}
          </span>
        </div>
        <Button
          size="sm"
          variant="secondary"
          className="h-7 text-xs self-start"
          onClick={handleFetchMedia}
          disabled={fetching}
        >
          {fetching ? (
            <><Loader2 className="w-3 h-3 mr-1 animate-spin" /> Carregando…</>
          ) : (
            <><Download className="w-3 h-3 mr-1" /> Carregar {label}</>
          )}
        </Button>
        {msg.content && <p className="text-sm whitespace-pre-wrap break-words [overflow-wrap:anywhere]">{linkifyText(msg.content)}</p>}
      </div>
    );
  }

  switch (effectiveType) {
    case 'image':
      return (
        <div className="max-w-full min-w-0 overflow-hidden">
          {displayMediaUrl && !imgError ? (
            <div className="relative max-w-full overflow-hidden">
              {imgLoading && (
                <div className="absolute inset-0 flex items-center justify-center rounded-lg bg-muted/40 backdrop-blur-sm pointer-events-none">
                  <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
                </div>
              )}
              <img
                key={retryKey}
                src={displayMediaUrl}
                alt="Imagem"
                loading="lazy"
                decoding="async"
                className={cn(
                  'rounded-lg max-w-full sm:max-w-[280px] max-h-[300px] object-cover mb-1 cursor-pointer block bg-muted/30',
                  imgLoading ? 'min-h-[180px] w-full sm:w-[220px] max-w-full aspect-[4/3] opacity-0' : '',
                )}
                onLoad={() => { setImgLoading(false); onDeferredContentLoaded?.(); }}
                onError={() => { setImgError(true); setImgLoading(false); }}
                onClick={() => !imgLoading && onOpenLightbox()}
              />
            </div>
          ) : displayMediaUrl && imgError ? (
            <div className="flex flex-col gap-2 p-3 rounded-lg bg-muted/30 border border-border/40 max-w-full sm:max-w-[280px]">
              <div className="flex items-center gap-2">
                <ImageIcon className="w-4 h-4 text-muted-foreground" />
                <span className="text-xs text-muted-foreground">Não foi possível carregar a imagem</span>
              </div>
              <div className="flex items-center gap-2">
                <Button size="sm" variant="secondary" className="h-7 text-xs" onClick={handleRetryImage}>
                  <Loader2 className={cn('w-3 h-3 mr-1', imgLoading && 'animate-spin')} />
                  Tentar novamente
                </Button>
                {(msg.media_storage_path || msg.media_url) && (
                  <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={onDownload}>
                    <Download className="w-3 h-3 mr-1" />
                    Baixar
                  </Button>
                )}
              </div>
            </div>
          ) : null}
          {msg.content && <p className="text-sm whitespace-pre-wrap break-words [overflow-wrap:anywhere]">{linkifyText(msg.content)}</p>}
        </div>
      );

    case 'audio':
      return displayMediaUrl ? (
        <AudioPlayer
          src={displayMediaUrl}
          storagePath={msg.media_storage_path ?? null}
          mimetype={msg.media_mimetype}
          duration={msg.duration}
          isMe={isMe}
          messageId={msg.message_id}
          queueOrder={msg.timestamp ? new Date(msg.timestamp).getTime() : 0}
          onDownload={onDownload}
        />
      ) : (
        <span className="text-sm">🎵 Áudio{msg.duration ? ` (${msg.duration}s)` : ''}</span>
      );

    case 'video':
      return (
        <div className="max-w-full min-w-0 overflow-hidden">
          {displayMediaUrl && !videoError ? (
            <video
              controls
              className="rounded-lg max-w-full sm:max-w-[280px] max-h-[300px] mb-1"
              preload="metadata"
              onLoadedMetadata={onDeferredContentLoaded}
              onLoadedData={onDeferredContentLoaded}
              onError={() => setVideoError(true)}
            >
              <source src={displayMediaUrl} type={msg.media_mimetype || 'video/mp4'} />
            </video>
          ) : displayMediaUrl && videoError ? (
            <a
              href={displayMediaUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 p-3 rounded-lg bg-muted/30"
            >
              <Play className="w-5 h-5 text-muted-foreground" />
              <span className="text-xs text-muted-foreground">Baixar vídeo</span>
            </a>
          ) : null}
          {msg.content && <p className="text-sm whitespace-pre-wrap break-words [overflow-wrap:anywhere]">{linkifyText(msg.content)}</p>}
        </div>
      );

    case 'document': {
      const handleOpen = async () => {
        if (msg.media_storage_path) {
          try {
            const { data } = await supabase.storage
              .from('chat-media')
              .createSignedUrl(msg.media_storage_path, 3600);
            if (data?.signedUrl) {
              window.open(data.signedUrl, '_blank', 'noopener,noreferrer');
              return;
            }
          } catch {/* fall through */}
        }
        if (displayMediaUrl) window.open(displayMediaUrl, '_blank', 'noopener,noreferrer');
      };
      return (
        <div
          className={cn(
            'flex items-center gap-3 p-2.5 rounded-lg w-full max-w-full min-w-0 overflow-hidden',
            isMe ? 'bg-primary-foreground/10' : 'bg-muted/50',
          )}
        >
          <FileText className="w-8 h-8 shrink-0 text-primary" />
          <div className="min-w-0 flex-1 overflow-hidden">
            <p className="text-sm font-medium truncate">{msg.file_name || 'Documento'}</p>
            <p className={cn('text-xs truncate', isMe ? 'text-primary-foreground/60' : 'text-muted-foreground')}>
              {msg.media_mimetype || 'Arquivo'}
            </p>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="h-7 px-2 text-xs"
              onClick={handleOpen}
              disabled={!displayMediaUrl && !msg.media_storage_path}
            >
              Abrir
            </Button>
            <Button
              type="button"
              size="icon"
              variant="ghost"
              className="h-7 w-7"
              onClick={onDownload}
              aria-label="Baixar arquivo"
            >
              <Download className="w-4 h-4" />
            </Button>
          </div>
        </div>
      );
    }

    case 'location':
      return (
        <div className="flex items-center gap-2">
          <span className="text-2xl">📍</span>
          <div>
            <p className="text-sm">{msg.content || 'Localização'}</p>
            {msg.latitude && msg.longitude && (
              <a
                href={`https://maps.google.com/?q=${msg.latitude},${msg.longitude}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-primary underline"
              >
                Abrir no mapa
              </a>
            )}
          </div>
        </div>
      );

    case 'sticker':
      return (
        <div className="relative w-32 h-32">
          {displayMediaUrl && !imgError ? (
            <>
              {imgLoading && (
                <div className="absolute inset-0 flex items-center justify-center rounded-md bg-muted/30 pointer-events-none">
                  <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
                </div>
              )}
              <img
                key={retryKey}
                src={displayMediaUrl}
                alt="Sticker"
                loading="lazy"
                decoding="async"
                className={cn('w-32 h-32 object-contain', imgLoading && 'opacity-0')}
                onLoad={() => { setImgLoading(false); onDeferredContentLoaded?.(); }}
                onError={() => { setImgError(true); setImgLoading(false); }}
              />
            </>
          ) : displayMediaUrl && imgError ? (
            <button
              type="button"
              onClick={handleRetryImage}
              className="w-32 h-32 flex flex-col items-center justify-center gap-1 rounded-md bg-muted/40 border border-border/40 text-muted-foreground"
              aria-label="Recarregar sticker"
            >
              <ImageIcon className="w-5 h-5" />
              <span className="text-[10px]">Recarregar</span>
            </button>
          ) : (
            <div className="w-32 h-32 flex items-center justify-center text-2xl">🏷️</div>
          )}
        </div>
      );

    case 'interactive': {
      const lp = (msg as any).link_preview as
        | {
            type: 'buttons';
            body?: string;
            footer?: string | null;
            buttons: Array<{ type: string; display_text: string; url?: string | null; phone_number?: string | null; id?: string | null }>;
            header?: { format: string; text?: string; url?: string | null } | null;
          }
        | {
            type: 'list';
            body?: string;
            footer?: string | null;
            button_text?: string;
            sections?: Array<{ title: string; rows: Array<{ id: string; title: string; description?: string | null }> }>;
            options?: Array<{ id: string; title: string; description?: string }>;
            header?: { format: string; text?: string; url?: string | null } | null;
          }
        | {
            type: 'template';
            name?: string;
            language?: string | null;
            header?: { format: string; text?: string; url?: string | null } | null;
            footer?: string | null;
            buttons?: Array<{ type: string; display_text: string; url?: string | null; phone_number?: string | null }>;
          }
        | null;

      const header = lp?.header ?? null;
      const footer = (lp as any)?.footer ?? null;
      const buttons = (lp as any)?.buttons as
        | Array<{ type: string; display_text: string; url?: string | null; phone_number?: string | null; id?: string | null }>
        | undefined;
      const isTemplate = lp?.type === 'template';

      const handleCopyCode = (text: string) => {
        try {
          navigator.clipboard.writeText(text);
        } catch {}
      };

      return (
        <div className="space-y-2 max-w-full min-w-0 overflow-hidden">
          {isTemplate && (lp as any)?.name && (
            <div className="text-[10px] uppercase tracking-wide text-muted-foreground/80">
              Template · {(lp as any).name}
            </div>
          )}
          {header?.format === 'text' && header.text && (
            <div className="font-semibold text-sm break-words [overflow-wrap:anywhere]">
              {header.text}
            </div>
          )}
          {header && header.format !== 'text' && (header.url || displayMediaUrl) && (
            <>
              {header.format === 'image' && (
                <img
                  src={(header.url || displayMediaUrl) as string}
                  alt="Imagem"
                  loading="lazy"
                  className="rounded-lg max-w-full sm:max-w-[280px] max-h-[260px] object-cover bg-muted/30"
                  onLoad={() => onDeferredContentLoaded?.()}
                />
              )}
              {header.format === 'video' && (
                <video
                  controls
                  preload="metadata"
                  className="rounded-lg max-w-full sm:max-w-[280px] max-h-[260px]"
                >
                  <source src={(header.url || displayMediaUrl) as string} />
                </video>
              )}
              {header.format === 'document' && (
                <a
                  href={(header.url || displayMediaUrl) as string}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={cn(
                    'flex items-center gap-3 p-2.5 rounded-lg w-full max-w-full min-w-0 overflow-hidden text-left',
                    isMe ? 'bg-primary-foreground/10 hover:bg-primary-foreground/20' : 'bg-muted/50 hover:bg-muted/80',
                  )}
                >
                  <FileText className="w-7 h-7 shrink-0 text-primary" />
                  <span className="text-sm truncate flex-1">Documento</span>
                  <Download className="w-4 h-4 shrink-0 opacity-60" />
                </a>
              )}
            </>
          )}
          {msg.content && (
            <p className="text-sm whitespace-pre-wrap break-words [overflow-wrap:anywhere]">
              {linkifyText(msg.content)}
            </p>
          )}
          {footer && (
            <p className="text-[11px] text-muted-foreground italic break-words [overflow-wrap:anywhere]">
              {footer}
            </p>
          )}
          {Array.isArray(buttons) && buttons.length > 0 && (
            <div className="flex flex-col gap-1.5 pt-1.5 border-t border-border/30 mt-1.5">
              {buttons.map((btn, i) => {
                const isUrl = (btn.type === 'cta_url' || btn.type === 'url') && !!btn.url;
                const phoneNum = btn.phone_number || (btn.type === 'call' ? (btn as any).id : null);
                const isPhone = (btn.type === 'phone_number' || btn.type === 'call') && !!phoneNum;
                const isCopy = btn.type === 'copy_code';
                const isQuickReply = !isUrl && !isPhone && !isCopy;
                const activeCls = 'text-xs px-3 py-1.5 rounded-md border text-center transition-colors border-primary/40 text-primary hover:bg-primary/10';
                if (isUrl) {
                  return (
                    <a
                      key={i}
                      href={btn.url!}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={activeCls}
                    >
                      {btn.display_text}
                    </a>
                  );
                }
                if (isPhone) {
                  return (
                    <a
                      key={i}
                      href={`tel:${phoneNum}`}
                      className={activeCls}
                    >
                      📞 {btn.display_text}
                    </a>
                  );
                }
                if (isCopy) {
                  return (
                    <button
                      key={i}
                      type="button"
                      onClick={() => handleCopyCode(btn.display_text)}
                      className={activeCls}
                    >
                      📋 {btn.display_text}
                    </button>
                  );
                }
                // quick_reply (ou tipo desconhecido com texto): clicar envia o texto como mensagem
                if (isQuickReply && onQuickReply && !msg.from_me) {
                  return (
                    <button
                      key={i}
                      type="button"
                      onClick={() => onQuickReply(btn.display_text, (btn as any).id ?? null)}
                      className={activeCls}
                    >
                      {btn.display_text}
                    </button>
                  );
                }
                return (
                  <button
                    key={i}
                    type="button"
                    disabled
                    className="text-xs px-3 py-1.5 rounded-md border text-center border-border/40 text-muted-foreground cursor-default"
                  >
                    {btn.display_text}
                  </button>
                );
              })}
            </div>
          )}
          {lp?.type === 'list' && (
            <div className="flex flex-col gap-1 pt-1.5 border-t border-border/30 mt-1.5">
              {(lp as any).button_text && (
                <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
                  {(lp as any).button_text}
                </span>
              )}
              {Array.isArray((lp as any).sections) &&
                (lp as any).sections.map((sec: any, si: number) => (
                  <div key={si} className="flex flex-col gap-1">
                    {sec.title && (
                      <div className="text-[10px] uppercase tracking-wide text-muted-foreground/80 mt-1">
                        {sec.title}
                      </div>
                    )}
                    {(sec.rows || []).map((row: any, ri: number) => (
                      <div key={ri} className="text-xs px-2 py-1 rounded bg-muted/40">
                        <p className="font-medium">{row.title}</p>
                        {row.description && (
                          <p className="text-muted-foreground text-[11px]">{row.description}</p>
                        )}
                      </div>
                    ))}
                  </div>
                ))}
              {Array.isArray((lp as any).options) &&
                (lp as any).options.map((opt: any, i: number) => (
                  <div key={`o${i}`} className="text-xs px-2 py-1 rounded bg-muted/40">
                    <p className="font-medium">{opt.title}</p>
                    {opt.description && (
                      <p className="text-muted-foreground text-[11px]">{opt.description}</p>
                    )}
                  </div>
                ))}
            </div>
          )}
          <span aria-hidden className={cn('inline-block align-bottom', isMe ? 'w-[72px]' : 'w-[52px]')} />
        </div>
      );
    }

    default:
      return (
        <p className="text-sm whitespace-pre-wrap break-words [overflow-wrap:anywhere]">
          {linkifyText(msg.content || '')}
          <span
            aria-hidden
            className={cn('inline-block align-bottom', isMe ? 'w-[72px]' : 'w-[52px]')}
          />
        </p>
      );
  }
});
