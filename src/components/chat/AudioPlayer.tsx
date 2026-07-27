import { useState, useRef, useEffect, useCallback } from 'react';
import { Play, Pause, Loader2, Mic, Volume2, VolumeX, Volume1, RotateCw, Download } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Slider } from '@/components/ui/slider';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { evolutionApi } from '@/services/evolutionApi';
import { getChatMediaUrl, purgeCachedMediaUrl } from '@/lib/mediaUrl';
import { useAudioQueueRegistration } from './AudioQueueContext';

const SPEED_OPTIONS = [1, 1.5, 2] as const;
const RESOLVE_TIMEOUT_MS = 15_000;
const VOLUME_STORAGE_KEY = 'chat:audio:volume';
const SPEED_STORAGE_KEY = 'chat:audio:speed';
const MAX_RETRY_ATTEMPTS = 3;
const RETRY_BACKOFF_MS = [300, 800, 2000];

/**
 * Normaliza mimetype para o atributo `type` do <source>.
 * Remove parâmetros (ex.: `; codecs=opus`) que alguns browsers (Safari/Edge)
 * rejeitam.
 */
function normalizeAudioType(mimetype: string | null | undefined): string {
  if (!mimetype) return 'audio/ogg';
  const base = mimetype.split(';')[0].trim().toLowerCase();
  return base || 'audio/ogg';
}

interface AudioPlayerProps {
  src: string;
  /** Caminho no bucket chat-media — usado para regerar signed URL em caso de erro. */
  storagePath?: string | null;
  mimetype?: string | null;
  duration?: number | null;
  isMe?: boolean;
  messageId?: string;
  /** Ordem cronológica para a fila (timestamp ms da mensagem). */
  queueOrder?: number;
  /** Callback opcional para baixar o áudio quando o player está em erro. */
  onDownload?: () => void;
}

function formatTime(seconds: number) {
  if (!seconds || !isFinite(seconds)) return '0:00';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function isStorageUrl(url: string): boolean {
  return url.includes('supabase.co/storage/') || url.includes('/chat-media/');
}

function needsResolution(url: string): boolean {
  if (!url || isStorageUrl(url)) return false;
  return url.includes('mmg.whatsapp.net') || url.includes('.enc');
}

export default function AudioPlayer({ src, storagePath, mimetype, duration: durationProp, isMe, messageId, queueOrder, onDownload }: AudioPlayerProps) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(durationProp || 0);
  const [speed, setSpeed] = useState<number>(() => {
    if (typeof window === 'undefined') return 1;
    const raw = window.localStorage.getItem(SPEED_STORAGE_KEY);
    const parsed = raw ? parseFloat(raw) : 1;
    return (SPEED_OPTIONS as readonly number[]).includes(parsed) ? parsed : 1;
  });
  const [error, setError] = useState(false);
  const [buffering, setBuffering] = useState(false);
  const [resolving, setResolving] = useState(false);
  const [resolvedSrc, setResolvedSrc] = useState<string | null>(null);
  const [volume, setVolume] = useState<number>(() => {
    if (typeof window === 'undefined') return 1;
    const raw = window.localStorage.getItem(VOLUME_STORAGE_KEY);
    const parsed = raw ? parseFloat(raw) : 1;
    return isFinite(parsed) ? Math.max(0, Math.min(1, parsed)) : 1;
  });
  const [muted, setMuted] = useState(false);
  const resolveAttempted = useRef(false);
  const prevSrcRef = useRef<string>('');
  /** Tentativas de regerar signed URL após erro (máx 2). */
  const retryAttempts = useRef(0);
  /** Timestamp da última troca de src — usado para suprimir error events espúrios durante swap. */
  const lastSrcChangeAt = useRef<number>(Date.now());
  /** Flag para evitar repetir o seek-hack de descobrir duração em OGG/Opus sem metadata. */
  const didDurationHack = useRef(false);

  const activeSrc = resolvedSrc || src;
  const progress = duration > 0 ? (currentTime / duration) * 100 : 0;
  const effectiveVolume = muted ? 0 : volume;

  // Se o src já é uma URL do storage (ex.: webhook atualizou o media_url
  // depois do download), garante que não fique preso em "resolving".
  useEffect(() => {
    if (isStorageUrl(src) && resolving) {
      setResolving(false);
    }
  }, [src, resolving]);

  // Resolve WhatsApp CDN URLs via proxy (only once)
  useEffect(() => {
    if (!needsResolution(src) || !messageId || resolveAttempted.current) return;

    resolveAttempted.current = true;
    let cancelled = false;
    setResolving(true);

    const timeout = setTimeout(() => {
      if (!cancelled) {
        cancelled = true;
        setResolving(false);
        setError(true);
      }
    }, RESOLVE_TIMEOUT_MS);

    (async () => {
      try {
        const res: any = await evolutionApi.downloadMedia(messageId, mimetype || undefined, 'audio');
        const url = res?.mediaUrl;
        if (!cancelled && url) {
          setResolvedSrc(url);
          setError(false);
        } else if (!cancelled) {
          setError(true);
        }
      } catch {
        if (!cancelled) setError(true);
      } finally {
        clearTimeout(timeout);
        // Sempre resetar resolving — mesmo após cleanup — para não travar o
        // spinner caso o src tenha sido atualizado para uma URL de storage
        // enquanto o download estava em voo.
        setResolving(false);
      }
    })();

    return () => { cancelled = true; clearTimeout(timeout); };
  }, [src, messageId, mimetype]);

  // Audio element event listeners
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const onLoaded = () => {
      const d = audio.duration;
      if (d && isFinite(d)) {
        setDuration(d);
      } else if ((d === Infinity || isNaN(d)) && !didDurationHack.current) {
        // Bug Chromium/Firefox: OGG/Opus do WhatsApp não traz duração no header.
        // Seek para um valor absurdo força o browser a escanear o stream até o fim;
        // então `durationchange` dispara com o valor real e fazemos reset.
        didDurationHack.current = true;
        try {
          audio.currentTime = 1e101;
        } catch { /* alguns browsers lançam — ignorar */ }
      }
    };
    const onDurationChange = () => {
      const d = audio.duration;
      if (d && isFinite(d)) {
        setDuration(d);
        if (didDurationHack.current) {
          // Reset após hack: volta para o início sem alterar play state.
          didDurationHack.current = false;
          try { audio.currentTime = 0; } catch { /* noop */ }
          setCurrentTime(0);
        }
      }
    };
    const onTimeUpdate = () => {
      // Durante o seek-hack, `currentTime` pode pular para valores absurdos —
      // ignorar até `durationchange` resetar.
      if (didDurationHack.current) return;
      setCurrentTime(audio.currentTime);
    };
    const onEnded = () => {
      setPlaying(false);
      setCurrentTime(0);
      if (messageId) queueRef.current?.notifyEnded(messageId);
    };
    const onError = () => {
      const errCode = audio.error?.code;
      const errMessage = audio.error?.message;
      const sinceSwap = Date.now() - lastSrcChangeAt.current;

      if (import.meta.env.DEV) {
        // eslint-disable-next-line no-console
        console.warn('[AudioPlayer] error', {
          code: errCode,
          message: errMessage,
          src: activeSrc,
          mimetype,
          isStorage: isStorageUrl(activeSrc),
          sinceSrcSwapMs: sinceSwap,
          retryAttempts: retryAttempts.current,
        });
      }

      // Suprime error espúrio durante swap de src (ex.: blob revogado).
      if (sinceSwap < 300) return;

      // Recuperação principal: regerar signed URL sempre que houver storagePath,
      // independentemente da URL atual ter vindo do storage ou de um fallback.
      if (storagePath && retryAttempts.current < MAX_RETRY_ATTEMPTS) {
        const attempt = retryAttempts.current;
        retryAttempts.current += 1;
        setResolving(true);
        const delay = RETRY_BACKOFF_MS[Math.min(attempt, RETRY_BACKOFF_MS.length - 1)];
        setTimeout(() => {
          purgeCachedMediaUrl(storagePath);
          getChatMediaUrl(storagePath, null)
            .then((url) => {
              if (url) {
                setResolvedSrc(url);
                setError(false);
                lastSrcChangeAt.current = Date.now();
              } else {
                setError(true);
              }
            })
            .catch(() => setError(true))
            .finally(() => setResolving(false));
        }, delay);
        return;
      }

      // Fallback antigo: para URLs do CDN WhatsApp, tenta downloadMedia.
      if (!resolveAttempted.current && messageId && !isStorageUrl(activeSrc)) {
        resolveAttempted.current = true;
        setResolving(true);
        evolutionApi.downloadMedia(messageId, mimetype || undefined, 'audio')
          .then((res: any) => {
            const url = res?.mediaUrl;
            if (url) {
              setResolvedSrc(url);
              setError(false);
            } else {
              setError(true);
            }
          })
          .catch(() => setError(true))
          .finally(() => setResolving(false));
      } else {
        setError(true);
      }
    };

    const onWaiting = () => setBuffering(true);
    const onPlaying = () => setBuffering(false);
    const onCanPlay = () => setBuffering(false);
    const onStalled = () => setBuffering(true);
    const onPause = () => setBuffering(false);

    audio.addEventListener('loadedmetadata', onLoaded);
    audio.addEventListener('durationchange', onDurationChange);
    audio.addEventListener('timeupdate', onTimeUpdate);
    audio.addEventListener('ended', onEnded);
    audio.addEventListener('error', onError);
    audio.addEventListener('waiting', onWaiting);
    audio.addEventListener('playing', onPlaying);
    audio.addEventListener('canplay', onCanPlay);
    audio.addEventListener('stalled', onStalled);
    audio.addEventListener('pause', onPause);

    return () => {
      audio.removeEventListener('loadedmetadata', onLoaded);
      audio.removeEventListener('durationchange', onDurationChange);
      audio.removeEventListener('timeupdate', onTimeUpdate);
      audio.removeEventListener('ended', onEnded);
      audio.removeEventListener('error', onError);
      audio.removeEventListener('waiting', onWaiting);
      audio.removeEventListener('playing', onPlaying);
      audio.removeEventListener('canplay', onCanPlay);
      audio.removeEventListener('stalled', onStalled);
      audio.removeEventListener('pause', onPause);
    };
  }, [activeSrc, messageId, mimetype, storagePath]);

  // Reset de estado ao mudar a src (ex.: blob → signed URL, retry manual).
  useEffect(() => {
    lastSrcChangeAt.current = Date.now();
    retryAttempts.current = 0;
    resolveAttempted.current = false;
    didDurationHack.current = false;
    setError(false);
  }, [src]);

  // Preserva posição/play ao trocar de src (ex.: blob otimista → signed URL confirmada)
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    if (!prevSrcRef.current) {
      prevSrcRef.current = activeSrc;
      return;
    }
    if (prevSrcRef.current === activeSrc) return;

    const prevTime = audio.currentTime;
    const wasPlaying = !audio.paused;
    prevSrcRef.current = activeSrc;

    // Com <source> filho, o elemento precisa de load() explícito para
    // reprocessar a nova URL.
    audio.load();

    const onLoaded = () => {
      if (prevTime > 0 && audio.duration && prevTime < audio.duration) {
        audio.currentTime = prevTime;
      }
      if (wasPlaying) {
        audio.playbackRate = speed;
        audio.play().catch(() => {});
      }
      audio.removeEventListener('loadedmetadata', onLoaded);
    };
    audio.addEventListener('loadedmetadata', onLoaded);

    return () => audio.removeEventListener('loadedmetadata', onLoaded);
  }, [activeSrc, speed]);

  const togglePlay = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;

    if (playing) {
      audio.pause();
      setPlaying(false);
    } else {
      audio.playbackRate = speed;
      audio.play().catch(() => setError(true));
      setPlaying(true);
      if (messageId) queueRef.current?.notifyPlay(messageId);
    }
  }, [playing, speed, messageId]);

  // Registro na fila de reprodução de áudio (autoplay sequencial)
  const queue = useAudioQueueRegistration(messageId, queueOrder ?? 0, {
    play: () => {
      const audio = audioRef.current;
      if (!audio) return;
      audio.playbackRate = speed;
      audio.currentTime = 0;
      audio.play().then(() => {
        setPlaying(true);
        if (messageId) queueRef.current?.notifyPlay(messageId);
      }).catch(() => setError(true));
    },
    pause: () => {
      const audio = audioRef.current;
      if (!audio || audio.paused) return;
      audio.pause();
      setPlaying(false);
    },
  });
  const queueRef = useRef(queue);
  useEffect(() => { queueRef.current = queue; });

  const cycleSpeed = useCallback(() => {
    const idx = SPEED_OPTIONS.indexOf(speed as typeof SPEED_OPTIONS[number]);
    const next = SPEED_OPTIONS[(idx + 1) % SPEED_OPTIONS.length];
    setSpeed(next);
    if (audioRef.current) {
      audioRef.current.playbackRate = next;
    }
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(SPEED_STORAGE_KEY, String(next));
    }
  }, [speed]);

  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.playbackRate = speed;
    }
  }, [speed, activeSrc]);

  const handleProgressClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const audio = audioRef.current;
    if (!audio || !duration) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    audio.currentTime = ratio * duration;
    setCurrentTime(audio.currentTime);
  }, [duration]);

  const handleProgressKeyDown = useCallback((e: React.KeyboardEvent<HTMLDivElement>) => {
    const audio = audioRef.current;
    if (!audio || !duration) return;
    const SMALL_STEP = 5;
    const LARGE_STEP = Math.max(10, duration * 0.1);
    let next = audio.currentTime;
    switch (e.key) {
      case 'ArrowRight':
      case 'ArrowUp':
        next = Math.min(duration, audio.currentTime + SMALL_STEP);
        break;
      case 'ArrowLeft':
      case 'ArrowDown':
        next = Math.max(0, audio.currentTime - SMALL_STEP);
        break;
      case 'PageUp':
        next = Math.min(duration, audio.currentTime + LARGE_STEP);
        break;
      case 'PageDown':
        next = Math.max(0, audio.currentTime - LARGE_STEP);
        break;
      case 'Home':
        next = 0;
        break;
      case 'End':
        next = duration;
        break;
      default:
        return;
    }
    e.preventDefault();
    audio.currentTime = next;
    setCurrentTime(next);
  }, [duration]);

  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.volume = effectiveVolume;
    }
  }, [effectiveVolume]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(VOLUME_STORAGE_KEY, String(volume));
  }, [volume]);

  const handleVolumeChange = useCallback((vals: number[]) => {
    const v = Math.max(0, Math.min(1, (vals[0] ?? 0) / 100));
    setVolume(v);
    if (v > 0 && muted) setMuted(false);
  }, [muted]);

  const toggleMute = useCallback(() => {
    setMuted((prev) => {
      if (prev && volume === 0) setVolume(0.5);
      return !prev;
    });
  }, [volume]);

  const VolumeIcon = effectiveVolume === 0 ? VolumeX : effectiveVolume < 0.5 ? Volume1 : Volume2;

  // Cor herdada do bubble (currentColor) — usamos opacidades para criar hierarquia,
  // garantindo legibilidade tanto em light (texto escuro) quanto dark (texto claro).
  // Tracks: bg-current/40 (faint) e bg-current/80 (filled).
  // Botões secundários: bg-current/10 hover:bg-current/20.

  if (resolving) {
    return (
      <div
        className="flex items-center gap-2.5 w-full min-w-0 sm:min-w-[240px] max-w-full sm:max-w-[320px] py-1"
        role="status"
        aria-live="polite"
        aria-label="Carregando áudio"
      >
        <div className="w-10 h-10 shrink-0 rounded-full flex items-center justify-center bg-current/15">
          <Loader2 className="w-5 h-5 animate-spin opacity-60" />
        </div>
        <div className="flex-1 flex flex-col gap-1.5 min-w-0">
          <div className="h-1.5 rounded-full overflow-hidden relative bg-current/30">
            <div
              className="absolute inset-y-0 w-1/3 rounded-full bg-current/60"
              style={{ animation: 'audio-shimmer 1.4s ease-in-out infinite' }}
            />
          </div>
          <div className="flex items-center gap-1.5 opacity-70">
            <Mic className="w-3 h-3 shrink-0" aria-hidden="true" />
            <span className="text-[11px] font-medium">áudio</span>
          </div>
        </div>
        <style>{`
          @keyframes audio-shimmer {
            0% { left: -33%; }
            100% { left: 100%; }
          }
        `}</style>
      </div>
    );
  }

  if (error) {
    const handleManualRetry = () => {
      retryAttempts.current = 0;
      resolveAttempted.current = false;
      setError(false);
      if (storagePath) {
        setResolving(true);
        purgeCachedMediaUrl(storagePath);
        getChatMediaUrl(storagePath, null)
          .then((url) => {
            if (url) {
              setResolvedSrc(url);
              lastSrcChangeAt.current = Date.now();
            } else {
              setError(true);
            }
          })
          .catch(() => setError(true))
          .finally(() => setResolving(false));
      } else {
        // Sem storagePath, força reload do elemento.
        lastSrcChangeAt.current = Date.now();
        audioRef.current?.load();
      }
    };

    return (
      <div className="flex flex-col gap-1.5 text-xs" role="alert">
        <div className="flex items-center gap-1.5 opacity-80">
          <span aria-hidden="true">⚠️</span>
          <span>Áudio indisponível</span>
        </div>
        <div className="flex items-center gap-1.5">
          <Button
            type="button"
            size="sm"
            variant="secondary"
            className="h-6 px-2 text-[11px] gap-1"
            onClick={handleManualRetry}
          >
            <RotateCw className="w-3 h-3" />
            Tentar novamente
          </Button>
          {onDownload && (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="h-6 px-2 text-[11px] gap-1"
              onClick={onDownload}
            >
              <Download className="w-3 h-3" />
              Baixar
            </Button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div
      className="flex items-center gap-2.5 w-full min-w-0 sm:min-w-[240px] max-w-full sm:max-w-[320px] py-1"
      role="group"
      aria-label={`Mensagem de áudio${duration ? ` de ${formatTime(duration)}` : ''}`}
    >
      <audio ref={audioRef} preload="none">
        <source src={activeSrc} type={normalizeAudioType(mimetype)} />
      </audio>

      {/* Botão Play/Pause — herda cor do bubble via currentColor */}
      <button
        type="button"
        onClick={togglePlay}
        className={cn(
          'w-10 h-10 shrink-0 rounded-full flex items-center justify-center transition-colors active:scale-95',
          'bg-current/15 hover:bg-current/25',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-current/40 focus-visible:ring-offset-1 focus-visible:ring-offset-transparent'
        )}
        aria-label={
          buffering
            ? 'Carregando áudio'
            : playing
              ? `Pausar áudio em ${formatTime(currentTime)}`
              : `Reproduzir áudio${duration ? `, duração ${formatTime(duration)}` : ''}`
        }
        aria-pressed={playing}
      >
        {buffering ? (
          <Loader2 className="w-5 h-5 animate-spin opacity-80" aria-hidden="true" />
        ) : playing ? (
          <Pause className="w-5 h-5 fill-current" aria-hidden="true" />
        ) : (
          <Play className="w-5 h-5 fill-current ml-0.5" aria-hidden="true" />
        )}
      </button>

      {/* Barra de progresso (inline, ocupa espaço disponível) */}
      <div
        className={cn(
          'relative flex-1 h-1.5 rounded-full cursor-pointer group/track ring-1 ring-inset ring-current/10 bg-current/25 border-0',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-current/40 focus-visible:ring-offset-1 focus-visible:ring-offset-transparent'
        )}
        onClick={handleProgressClick}
        onKeyDown={handleProgressKeyDown}
        role="slider"
        tabIndex={0}
        aria-label="Posição do áudio"
        aria-valuemin={0}
        aria-valuemax={duration || 0}
        aria-valuenow={Math.floor(currentTime)}
        aria-valuetext={`${formatTime(currentTime)} de ${formatTime(duration)}`}
        aria-orientation="horizontal"
      >
        <div
          className="absolute inset-y-0 left-0 rounded-full transition-[width] duration-100 bg-current border-0"
          style={{ width: `${progress}%` }}
          aria-hidden="true"
        />
        <div
          className="absolute top-1/2 -translate-y-1/2 w-3 h-3 rounded-full shadow-sm bg-current opacity-100 border-0"
          style={{ left: `calc(${Math.max(progress, 0)}% - 6px)` }}
          aria-hidden="true"
        />
      </div>

      {/* Tempo (atual durante play, duração em idle) */}
      <div className="flex items-center gap-1 shrink-0 opacity-70">
        <Mic className="w-3 h-3 shrink-0" aria-hidden="true" />
        <span className="text-[11px] font-medium tabular-nums" aria-hidden="true">
          {playing || currentTime > 0 ? formatTime(currentTime) : formatTime(duration)}
        </span>
        <span className="sr-only" aria-live="off">
          {formatTime(currentTime)} de {formatTime(duration)}
        </span>
      </div>

      {/* Volume */}
      <Popover>
        <PopoverTrigger asChild>
          <button
            type="button"
            className={cn(
              'rounded-full w-7 h-7 flex items-center justify-center shrink-0 transition-colors',
              'bg-current/10 hover:bg-current/20',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-current/40 focus-visible:ring-offset-1 focus-visible:ring-offset-transparent'
            )}
            aria-label={`Volume${muted ? ' silenciado' : ` em ${Math.round(effectiveVolume * 100)} por cento`}. Abrir controle de volume`}
            aria-haspopup="dialog"
            title={`Volume: ${Math.round(effectiveVolume * 100)}%`}
          >
            <VolumeIcon className="w-3.5 h-3.5" aria-hidden="true" />
          </button>
        </PopoverTrigger>
        <PopoverContent side="top" align="center" className="w-48 p-3 flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              Volume
            </span>
            <span className="text-[11px] font-medium tabular-nums text-foreground">
              {Math.round(effectiveVolume * 100)}%
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={toggleMute}
              className="text-muted-foreground hover:text-foreground transition-colors shrink-0"
              aria-label={muted ? 'Reativar som' : 'Silenciar'}
            >
              <VolumeIcon className="w-4 h-4" />
            </button>
            <Slider
              value={[Math.round(effectiveVolume * 100)]}
              onValueChange={handleVolumeChange}
              min={0}
              max={100}
              step={1}
              aria-label="Ajustar volume"
            />
          </div>
        </PopoverContent>
      </Popover>

      {/* Velocidade */}
      <button
        type="button"
        onClick={cycleSpeed}
        className={cn(
          'text-[11px] font-bold rounded-full w-9 h-6 flex items-center justify-center shrink-0 transition-colors tabular-nums',
          'bg-current/10 hover:bg-current/20',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-current/40 focus-visible:ring-offset-1 focus-visible:ring-offset-transparent'
        )}
        aria-label={`Velocidade de reprodução: ${speed}x. Clique para alterar`}
        title={`Velocidade: ${speed}x (clique para alternar)`}
      >
        <span aria-hidden="true">{speed}x</span>
      </button>
    </div>
  );
}
