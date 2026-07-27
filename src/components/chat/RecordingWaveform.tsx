import { memo } from 'react';
import { cn } from '@/lib/utils';

interface Props {
  levels: number[];
  paused?: boolean;
  bars?: number;
  className?: string;
}

/**
 * Waveform leve baseado em divs. `levels` é um buffer circular de valores 0-1
 * (RMS do mic). Renderiza `bars` barras verticais alinhadas ao centro.
 */
function RecordingWaveformImpl({ levels, paused, bars = 48, className }: Props) {
  // Garante array com exatamente `bars` elementos (pad à esquerda).
  const padded: number[] = [];
  const start = Math.max(0, levels.length - bars);
  for (let i = 0; i < bars; i++) {
    const idx = start + i;
    padded.push(idx < levels.length ? levels[idx] : 0);
  }

  return (
    <div
      className={cn(
        'flex items-center gap-[2px] h-6 flex-1 min-w-0 overflow-hidden',
        paused && 'opacity-60',
        className,
      )}
      aria-hidden
    >
      {padded.map((lvl, i) => {
        const h = Math.max(8, Math.min(100, Math.round(lvl * 100)));
        return (
          <span
            key={i}
            className="w-[2px] rounded-full bg-foreground/60 transition-[height] duration-75"
            style={{ height: `${h}%` }}
          />
        );
      })}
    </div>
  );
}

export const RecordingWaveform = memo(RecordingWaveformImpl);
