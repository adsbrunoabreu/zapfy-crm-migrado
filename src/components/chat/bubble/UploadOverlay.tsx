import { memo } from 'react';
import { Loader2 } from 'lucide-react';

interface Props {
  status: string;
  uploadPct?: number;
}

export const UploadOverlay = memo(function UploadOverlay({ status, uploadPct }: Props) {
  const isUploading = status === 'uploading';
  const showPct = isUploading && typeof uploadPct === 'number' && uploadPct < 100;
  const label = !isUploading
    ? 'Processando…'
    : showPct
      ? `Enviando arquivo ${uploadPct}%`
      : 'Processando…';
  return (
    <div className="absolute inset-0 flex items-center justify-center rounded-lg bg-background/40 backdrop-blur-[1px] pointer-events-none">
      <div className="flex flex-col items-stretch gap-1.5 min-w-[140px] px-3 py-2 rounded-lg bg-background/85 border border-border/50 shadow-sm">
        <div className="flex items-center gap-2">
          <Loader2 className="w-3.5 h-3.5 animate-spin text-foreground/70 shrink-0" />
          <span className="text-[11px] font-medium text-foreground/80 flex-1 truncate">
            {label}
          </span>
        </div>
        {showPct && (
          <div className="h-1 rounded-full bg-foreground/15 overflow-hidden">
            <div
              className="h-full bg-foreground/70 rounded-full transition-[width] duration-150"
              style={{ width: `${uploadPct}%` }}
            />
          </div>
        )}
      </div>
    </div>
  );
});
