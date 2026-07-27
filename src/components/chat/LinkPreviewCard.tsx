import { useEffect, useState } from 'react';
import { ExternalLink } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { LinkPreview } from '@/hooks/useChatMessages';

interface Props {
  preview: LinkPreview;
  isMe: boolean;
  onLoaded?: () => void;
}

/**
 * Card grande de preview de link, exibido acima do texto do bubble (estilo WhatsApp/Telegram).
 * Renderiza somente se houver pelo menos título ou descrição.
 */
export function LinkPreviewCard({ preview, isMe, onLoaded }: Props) {
  const [imgError, setImgError] = useState(false);

  if (!preview || preview.error) return null;
  if (!preview.title && !preview.description && !preview.image) return null;

  const host = (() => {
    try {
      return new URL(preview.url).hostname.replace(/^www\./, '');
    } catch {
      return preview.site_name || '';
    }
  })();

  useEffect(() => {
    const frame = requestAnimationFrame(() => onLoaded?.());
    const timer = window.setTimeout(() => onLoaded?.(), 120);
    return () => {
      cancelAnimationFrame(frame);
      window.clearTimeout(timer);
    };
  }, [onLoaded, preview.url, preview.title, preview.description, preview.image]);

  return (
    <a
      href={preview.url}
      target="_blank"
      rel="noopener noreferrer"
      className={cn(
        'group block mb-2 -mx-1 max-w-full min-w-0 rounded-md overflow-hidden border transition-colors',
        isMe
          ? 'border-[hsl(var(--chat-bubble-out-foreground))]/15 hover:border-[hsl(var(--chat-bubble-out-foreground))]/30 bg-[hsl(var(--chat-bubble-quote-out))]'
          : 'border-border/40 hover:border-border bg-[hsl(var(--chat-bubble-quote-in))]'
      )}
    >
      {preview.image && !imgError && (
        <div className="w-full aspect-[1.91/1] overflow-hidden bg-muted/30">
          <img
            src={preview.image}
            alt={preview.title || preview.url}
            loading="lazy"
            onLoad={onLoaded}
            onError={() => setImgError(true)}
            className="w-full h-full object-cover transition-transform group-hover:scale-[1.02]"
          />
        </div>
      )}
      <div className="px-2.5 py-2 space-y-0.5 min-w-0 overflow-hidden">
        <div className="flex items-center gap-1 text-[10px] uppercase tracking-wide opacity-70 min-w-0">
          {preview.favicon && (
            <img
              src={preview.favicon}
              alt=""
              className="w-3 h-3 rounded-sm"
              onLoad={onLoaded}
              onError={(e) => ((e.currentTarget.style.display = 'none'))}
            />
          )}
          <span className="truncate">{preview.site_name || host}</span>
          <ExternalLink className="w-2.5 h-2.5 ml-auto opacity-60 shrink-0" />
        </div>
        {preview.title && (
          <p className="text-[13px] font-semibold leading-snug line-clamp-2 break-words [overflow-wrap:anywhere]">
            {preview.title}
          </p>
        )}
        {preview.description && (
          <p className="text-[11.5px] leading-snug opacity-80 line-clamp-2 break-words [overflow-wrap:anywhere]">
            {preview.description}
          </p>
        )}
      </div>
    </a>
  );
}
