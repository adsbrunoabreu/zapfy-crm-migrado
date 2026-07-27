import { supabase } from '@/integrations/supabase/client';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;

interface UploadOptions {
  bucket: string;
  path: string;
  file: File;
  onProgress?: (percent: number) => void;
  signal?: AbortSignal;
}

/**
 * Upload via XMLHttpRequest contra a REST API do Supabase Storage para obter
 * progresso real (o SDK supabase-js não expõe onUploadProgress).
 *
 * Retorna uma signed URL (validade 7 dias) + o storage path. Buckets privados
 * (como chat-media) exigem signed URLs para acesso/entrega externa.
 */
export async function uploadFileWithProgress({
  bucket,
  path,
  file,
  onProgress,
  signal,
}: UploadOptions): Promise<{ signedUrl: string; storagePath: string; publicUrl: string }> {
  // Pega o token do usuário atual para autorizar contra Storage
  const { data: sessionData } = await supabase.auth.getSession();
  const token = sessionData.session?.access_token;
  if (!token) throw new Error('Sessão expirada. Faça login novamente.');

  const url = `${SUPABASE_URL}/storage/v1/object/${encodeURIComponent(bucket)}/${path
    .split('/')
    .map(encodeURIComponent)
    .join('/')}`;

  await new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', url, true);
    xhr.setRequestHeader('Authorization', `Bearer ${token}`);
    xhr.setRequestHeader('x-upsert', 'false');
    xhr.setRequestHeader('Cache-Control', '3600');
    if (file.type) xhr.setRequestHeader('Content-Type', file.type);

    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable && onProgress) {
        onProgress(Math.round((event.loaded / event.total) * 100));
      }
    };

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        onProgress?.(100);
        resolve();
      } else {
        let msg = `Falha no upload (HTTP ${xhr.status})`;
        try {
          const parsed = JSON.parse(xhr.responseText);
          if (parsed?.message) msg = parsed.message;
        } catch {
          /* ignore */
        }
        reject(new Error(msg));
      }
    };

    xhr.onerror = () => reject(new Error('Erro de rede durante o upload'));
    xhr.onabort = () => reject(new DOMException('Upload cancelado', 'AbortError'));

    if (signal) {
      if (signal.aborted) {
        xhr.abort();
      } else {
        signal.addEventListener('abort', () => xhr.abort(), { once: true });
      }
    }

    xhr.send(file);
  });

  // Generate a signed URL (7 days). Required for private buckets and for the
  // Evolution API to fetch the media file when sending to WhatsApp.
  const { data: signed, error: signedErr } = await supabase.storage
    .from(bucket)
    .createSignedUrl(path, 60 * 60 * 24 * 7);

  if (signedErr || !signed?.signedUrl) {
    throw new Error(signedErr?.message || 'Falha ao gerar URL assinada');
  }

  const { data: pub } = supabase.storage.from(bucket).getPublicUrl(path);
  return { signedUrl: signed.signedUrl, storagePath: path, publicUrl: pub.publicUrl };
}
