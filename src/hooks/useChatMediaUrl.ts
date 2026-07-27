import { useEffect, useState } from 'react';
import { getCachedMediaUrl, getChatMediaUrl, purgeCachedMediaUrl } from '@/lib/mediaUrl';

const RETRY_DELAYS_MS = [300, 800, 2000];

/**
 * Hook que resolve uma URL exibível para mídia em chat-media (bucket privado).
 *
 * Estratégia:
 * 1. Se houver `storagePath`, usa cache em memória ou gera signed URL fresca.
 *    Tenta até 3x com backoff antes de desistir — NUNCA cai em `fallbackUrl`,
 *    pois `media_url` salvo no DB pode ser uma signed URL expirada que
 *    confunde o `<audio>`/`<img>` e dispara erro imediato.
 * 2. Sem `storagePath`, retorna `fallbackUrl` (ex.: mensagens antigas sem
 *    download para o bucket).
 */
export function useChatMediaUrl(
  storagePath: string | null | undefined,
  fallbackUrl: string | null | undefined,
): string | null {
  const initial = (storagePath && getCachedMediaUrl(storagePath)) || null;
  const [url, setUrl] = useState<string | null>(initial ?? (storagePath ? null : fallbackUrl ?? null));

  useEffect(() => {
    let alive = true;

    if (!storagePath) {
      setUrl(fallbackUrl || null);
      return () => { alive = false; };
    }

    const cached = getCachedMediaUrl(storagePath);
    if (cached) {
      setUrl(cached);
      return () => { alive = false; };
    }

    (async () => {
      for (let attempt = 0; attempt < RETRY_DELAYS_MS.length; attempt++) {
        if (!alive) return;
        const resolved = await getChatMediaUrl(storagePath, null);
        if (!alive) return;
        if (resolved) {
          setUrl(resolved);
          return;
        }
        // Falhou — purga cache (pode ter entrada negativa) e espera backoff
        purgeCachedMediaUrl(storagePath);
        await new Promise((r) => setTimeout(r, RETRY_DELAYS_MS[attempt]));
      }
      if (alive) setUrl(null);
    })();

    return () => { alive = false; };
  }, [storagePath, fallbackUrl]);

  return url;
}
