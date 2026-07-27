/**
 * Re-tenta um import dinâmico (rota lazy) algumas vezes antes de falhar.
 * Evita full reload em quedas transitórias de rede / chunks 502/522.
 */
const CHUNK_ERROR_RE = /(Failed to fetch dynamically imported module|Importing a module script failed|ChunkLoadError|Loading chunk \d+ failed)/i;

export function lazyWithRetry<T>(factory: () => Promise<T>, retries = 2, delay = 600): () => Promise<T> {
  return () =>
    new Promise<T>((resolve, reject) => {
      const attempt = (left: number) => {
        factory()
          .then(resolve)
          .catch((err: unknown) => {
            const msg = (err as { message?: string } | undefined)?.message ?? '';
            if (left <= 0 || !CHUNK_ERROR_RE.test(msg)) return reject(err);
            setTimeout(() => attempt(left - 1), delay);
          });
      };
      attempt(retries);
    });
}
