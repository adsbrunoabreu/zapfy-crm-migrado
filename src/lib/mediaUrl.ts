import { supabase } from '@/integrations/supabase/client';

/**
 * Resolve uma URL exibível para mídia no bucket privado `chat-media`.
 *
 * - Se houver `storagePath`, gera signed URL (TTL 1h) e cacheia em memória.
 * - Caso contrário, retorna `fallbackUrl`.
 *
 * Otimizações:
 * 1. Cache em memória por path.
 * 2. Dedup de chamadas concorrentes (mesma promise para o mesmo path).
 * 3. Batch automático: múltiplos paths pedidos no mesmo tick são agrupados em
 *    uma única chamada `createSignedUrls` para evitar rate-limit (429) no Storage.
 */

const SIGNED_URL_TTL_SECONDS = 60 * 60; // 1h
const BATCH_WINDOW_MS = 30;
const MAX_BATCH = 50;

const cache = new Map<string, { url: string; expiresAt: number }>();
const inflight = new Map<string, Promise<string | null>>();

interface PendingItem {
  path: string;
  resolve: (url: string | null) => void;
}
let pendingQueue: PendingItem[] = [];
let flushTimer: ReturnType<typeof setTimeout> | null = null;

function scheduleFlush() {
  if (flushTimer) return;
  flushTimer = setTimeout(flushBatch, BATCH_WINDOW_MS);
}

async function flushBatch() {
  flushTimer = null;
  const batch = pendingQueue;
  pendingQueue = [];
  if (batch.length === 0) return;

  // Deduplica paths dentro do batch (vários callers no mesmo path)
  const pathToCallers = new Map<string, Array<(url: string | null) => void>>();
  for (const item of batch) {
    if (!pathToCallers.has(item.path)) pathToCallers.set(item.path, []);
    pathToCallers.get(item.path)!.push(item.resolve);
  }

  const uniquePaths = Array.from(pathToCallers.keys());

  // Processa em chunks de MAX_BATCH para não estourar URL/payload
  for (let i = 0; i < uniquePaths.length; i += MAX_BATCH) {
    const chunk = uniquePaths.slice(i, i + MAX_BATCH);
    try {
      const { data, error } = await supabase.storage
        .from('chat-media')
        .createSignedUrls(chunk, SIGNED_URL_TTL_SECONDS);

      if (error || !data) {
        for (const p of chunk) {
          pathToCallers.get(p)?.forEach((cb) => cb(null));
          inflight.delete(p);
        }
        continue;
      }

      for (const entry of data) {
        const callers = pathToCallers.get(entry.path) || [];
        if (entry.signedUrl) {
          cache.set(entry.path, {
            url: entry.signedUrl,
            expiresAt: Date.now() + SIGNED_URL_TTL_SECONDS * 1000,
          });
          callers.forEach((cb) => cb(entry.signedUrl));
        } else {
          callers.forEach((cb) => cb(null));
        }
        inflight.delete(entry.path);
      }
    } catch {
      for (const p of chunk) {
        pathToCallers.get(p)?.forEach((cb) => cb(null));
        inflight.delete(p);
      }
    }
  }
}

function enqueueSignedUrl(path: string): Promise<string | null> {
  const existing = inflight.get(path);
  if (existing) return existing;

  const promise = new Promise<string | null>((resolve) => {
    pendingQueue.push({ path, resolve });
    scheduleFlush();
  });
  inflight.set(path, promise);
  return promise;
}

export async function getChatMediaUrl(
  storagePath: string | null | undefined,
  fallbackUrl?: string | null,
): Promise<string | null> {
  if (!storagePath) return fallbackUrl ?? null;

  const cached = cache.get(storagePath);
  if (cached && cached.expiresAt > Date.now() + 60_000) {
    return cached.url;
  }

  const signed = await enqueueSignedUrl(storagePath);
  if (signed) return signed;
  return fallbackUrl ?? null;
}

/** Versão síncrona: retorna URL cacheada ou null. Útil em renders iniciais. */
export function getCachedMediaUrl(storagePath: string | null | undefined): string | null {
  if (!storagePath) return null;
  const cached = cache.get(storagePath);
  if (cached && cached.expiresAt > Date.now() + 60_000) return cached.url;
  return null;
}

/** Invalida a entrada de cache para forçar regeneração de signed URL no próximo fetch. */
export function purgeCachedMediaUrl(storagePath: string | null | undefined): void {
  if (!storagePath) return;
  cache.delete(storagePath);
  inflight.delete(storagePath);
}
