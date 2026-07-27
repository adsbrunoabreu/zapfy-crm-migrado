import { useCallback, useEffect, useState } from 'react';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { ChevronLeft, ChevronRight, Download, X, ZoomIn, ZoomOut } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useChatMediaUrl } from '@/hooks/useChatMediaUrl';

export interface LightboxImage {
  id: string;
  src: string;
  alt?: string;
  /** Optional metadata para baixar com nome */
  fileName?: string;
  /** Storage path para gerar signed URL no download */
  storagePath?: string | null;
}

interface Props {
  open: boolean;
  images: LightboxImage[];
  startIndex?: number;
  onClose: () => void;
  onDownload?: (image: LightboxImage) => void;
}

export function ImageLightbox({ open, images, startIndex = 0, onClose, onDownload }: Props) {
  const [index, setIndex] = useState(startIndex);
  const [zoomed, setZoomed] = useState(false);

  useEffect(() => {
    if (open) {
      setIndex(Math.min(Math.max(0, startIndex), Math.max(0, images.length - 1)));
      setZoomed(false);
    }
  }, [open, startIndex, images.length]);

  const goPrev = useCallback(() => {
    setIndex((i) => (images.length ? (i - 1 + images.length) % images.length : 0));
    setZoomed(false);
  }, [images.length]);

  const goNext = useCallback(() => {
    setIndex((i) => (images.length ? (i + 1) % images.length : 0));
    setZoomed(false);
  }, [images.length]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft') goPrev();
      else if (e.key === 'ArrowRight') goNext();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, goPrev, goNext]);

  if (!open || images.length === 0) return null;
  const current = images[index];
  if (!current) return null;
  return (
    <ImageLightboxBody
      open={open}
      images={images}
      index={index}
      current={current}
      zoomed={zoomed}
      setZoomed={setZoomed}
      goPrev={goPrev}
      goNext={goNext}
      onClose={onClose}
      onDownload={onDownload}
    />
  );
}

interface BodyProps {
  open: boolean;
  images: LightboxImage[];
  index: number;
  current: LightboxImage;
  zoomed: boolean;
  setZoomed: (fn: (z: boolean) => boolean) => void;
  goPrev: () => void;
  goNext: () => void;
  onClose: () => void;
  onDownload?: (image: LightboxImage) => void;
}

function ImageLightboxBody({ open, images, index, current, zoomed, setZoomed, goPrev, goNext, onClose, onDownload }: BodyProps) {
  const resolvedSrc = useChatMediaUrl(current.storagePath ?? null, current.src);
  const src = resolvedSrc || current.src;
  const hasMany = images.length > 1;

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-[95vw] max-h-[95vh] p-0 overflow-hidden bg-background/95 border-border/50">
        <div className="relative flex items-center justify-center w-full h-full min-h-[60vh]">
          <div
            className={cn(
              'flex items-center justify-center w-full h-full overflow-auto',
              zoomed ? 'cursor-zoom-out' : 'cursor-zoom-in',
            )}
            onClick={() => setZoomed((z) => !z)}
          >
            {src ? (
              <img
                src={src}
                alt={current.alt || 'Imagem'}
                className={cn(
                  'object-contain transition-transform select-none',
                  zoomed ? 'max-w-none max-h-none scale-[1.6]' : 'max-w-full max-h-[90vh]',
                )}
                draggable={false}
              />
            ) : (
              <div className="text-sm text-muted-foreground">Carregando…</div>
            )}
          </div>


          {hasMany && (
            <>
              <Button
                size="icon"
                variant="secondary"
                className="absolute left-2 top-1/2 -translate-y-1/2 rounded-full"
                onClick={(e) => { e.stopPropagation(); goPrev(); }}
                aria-label="Imagem anterior"
              >
                <ChevronLeft className="w-5 h-5" />
              </Button>
              <Button
                size="icon"
                variant="secondary"
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full"
                onClick={(e) => { e.stopPropagation(); goNext(); }}
                aria-label="Próxima imagem"
              >
                <ChevronRight className="w-5 h-5" />
              </Button>
              <div className="absolute bottom-3 left-1/2 -translate-x-1/2 px-2.5 py-1 rounded-full bg-background/80 border border-border/50 text-xs tabular-nums text-foreground/80">
                {index + 1} / {images.length}
              </div>
            </>
          )}

          <div className="absolute top-2 right-2 flex gap-2">
            <Button
              size="icon"
              variant="secondary"
              className="rounded-full"
              onClick={(e) => { e.stopPropagation(); setZoomed((z) => !z); }}
              aria-label={zoomed ? 'Diminuir zoom' : 'Aumentar zoom'}
            >
              {zoomed ? <ZoomOut className="w-4 h-4" /> : <ZoomIn className="w-4 h-4" />}
            </Button>
            {onDownload && (
              <Button
                size="icon"
                variant="secondary"
                className="rounded-full"
                onClick={(e) => { e.stopPropagation(); onDownload(current); }}
                aria-label="Baixar imagem"
              >
                <Download className="w-4 h-4" />
              </Button>
            )}
            <Button
              size="icon"
              variant="secondary"
              className="rounded-full"
              onClick={(e) => { e.stopPropagation(); onClose(); }}
              aria-label="Fechar"
            >
              <X className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
