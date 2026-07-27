import { useRef, useState, useEffect } from 'react';
import { Upload, Loader2, X, User, FileWarning } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { optimizeAvatarImage } from '@/lib/imageOptimize';

const ALLOWED_TYPES = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
const MAX_BYTES = 2 * 1024 * 1024; // 2 MB

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function validateAvatarFile(file: File): { ok: boolean; message?: string } {
  if (file.size === 0) {
    return { ok: false, message: 'O arquivo selecionado está vazio. Escolha outro arquivo.' };
  }
  if (!ALLOWED_TYPES.includes(file.type)) {
    return {
      ok: false,
      message: `Formato não permitido. Aceitamos apenas JPG, PNG ou WEBP. Tipo recebido: ${file.type || 'desconhecido'}.`,
    };
  }
  if (file.size > MAX_BYTES) {
    return {
      ok: false,
      message: `Arquivo muito grande. Limite para avatar: 2 MB. Este arquivo tem ${formatBytes(file.size)}.`,
    };
  }
  return { ok: true };
}

interface Props {
  userId: string;
  avatarUrl: string | null;
  fallback?: string;
  removing?: boolean;
  onChange: (url: string | null) => void;
}

export function AvatarUpload({ userId, avatarUrl, fallback, removing, onChange }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [statusText, setStatusText] = useState<string>('');
  const progressTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  const clearProgressTimer = () => {
    if (progressTimer.current) {
      clearInterval(progressTimer.current);
      progressTimer.current = null;
    }
  };

  const simulateProgress = () => {
    setProgress(0);
    clearProgressTimer();
    progressTimer.current = setInterval(() => {
      setProgress((prev) => {
        if (prev >= 90) return prev;
        const increment = prev < 30 ? 12 : prev < 60 ? 8 : 4;
        return Math.min(prev + increment, 90);
      });
    }, 120);
  };

  useEffect(() => {
    return () => clearProgressTimer();
  }, []);

  const handleFile = async (file: File) => {
    setError(null);
    setStatusText('');
    const validation = validateAvatarFile(file);
    if (!validation.ok) {
      setError(validation.message);
      toast.error(validation.message);
      if (inputRef.current) inputRef.current.value = '';
      return;
    }

    setUploading(true);
    setStatusText('Otimizando imagem...');
    setProgress(5);

    try {
      // 1) Otimização local (resize 512px + compressão WebP)
      let toUpload: File = file;
      try {
        const result = await optimizeAvatarImage(file, {
          maxDimension: 512,
          quality: 0.85,
          mimeType: 'image/webp',
        });
        toUpload = result.file;
        if (!result.skipped) {
          const saved = Math.max(0, result.originalBytes - result.finalBytes);
          const pct = Math.round((saved / result.originalBytes) * 100);
          if (pct > 0) {
            setStatusText(`Otimizada (-${pct}%) · enviando...`);
          }
        }
      } catch (optErr) {
        console.warn('Falha ao otimizar imagem, enviando original:', optErr);
        setStatusText('Enviando imagem...');
      }

      simulateProgress();

      // 2) Upload
      const ext = toUpload.name.split('.').pop()?.toLowerCase() || 'webp';
      const path = `${userId}/avatar-${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from('avatars')
        .upload(path, toUpload, {
          upsert: true,
          cacheControl: '3600',
          contentType: toUpload.type,
        });
      if (upErr) throw upErr;

      clearProgressTimer();
      setProgress(100);
      setStatusText('Finalizando...');

      const { data } = supabase.storage.from('avatars').getPublicUrl(path);
      onChange(data.publicUrl);
      toast.success('Avatar atualizado');
    } catch (err: any) {
      clearProgressTimer();
      const msg = err?.message || 'Erro desconhecido no upload.';
      setError(msg);
      setStatusText('');
      toast.error('Erro no upload', { description: msg });
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = '';
      setTimeout(() => {
        setProgress(0);
        setStatusText('');
      }, 1500);
    }
  };

  const isBusy = uploading || removing;

  return (
    <div className="flex items-center gap-4">
      <div className="relative w-20 h-20 rounded-full border border-border/50 bg-secondary/30 flex items-center justify-center overflow-hidden shrink-0">
        {avatarUrl ? (
          <img src={avatarUrl} alt="Avatar" className="w-full h-full object-cover" />
        ) : fallback ? (
          <span className="font-semibold text-primary text-2xl">{fallback}</span>
        ) : (
          <User className="w-8 h-8 text-muted-foreground" />
        )}
        {uploading && (
          <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
            <Loader2 className="w-6 h-6 text-white animate-spin" />
          </div>
        )}
      </div>

      <div className="flex flex-col gap-2 min-w-0 flex-1">
        <input
          ref={inputRef}
          type="file"
          accept="image/jpeg,image/jpg,image/png,image/webp"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) handleFile(f);
          }}
        />
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => inputRef.current?.click()}
          disabled={isBusy}
        >
          {uploading ? (
            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
          ) : (
            <Upload className="w-4 h-4 mr-2" />
          )}
          {uploading ? 'Enviando...' : avatarUrl ? 'Alterar avatar' : 'Enviar avatar'}
        </Button>
        {avatarUrl && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="text-destructive hover:text-destructive justify-start"
            onClick={() => onChange(null)}
            disabled={isBusy}
          >
            {removing ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <X className="w-4 h-4 mr-2" />
            )}
            {removing ? 'Removendo...' : 'Remover avatar'}
          </Button>
        )}

        {uploading && (
          <div className="space-y-1">
            <Progress value={progress} className="h-1.5" />
            <p className="text-[11px] text-muted-foreground">{statusText}</p>
          </div>
        )}

        {error && (
          <p className="text-xs text-destructive flex items-center gap-1">
            <FileWarning className="w-3.5 h-3.5 shrink-0" />
            {error}
          </p>
        )}
        {!uploading && (
          <p className="text-[11px] text-muted-foreground">
            JPG, PNG ou WEBP · Máx. 2 MB
          </p>
        )}
      </div>
    </div>
  );
}
