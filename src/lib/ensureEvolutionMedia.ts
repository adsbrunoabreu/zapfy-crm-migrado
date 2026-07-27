import { evolutionApi } from '@/services/evolutionApi';
import { purgeCachedMediaUrl } from '@/lib/mediaUrl';
import type { ChatMessage } from '@/hooks/useChatMessages';

/**
 * Baixa mídia inbound Evolution (URL .enc) para o bucket privado `chat-media`
 * via edge function `downloadMedia` e atualiza `chat_messages.media_storage_path`
 * (realtime notifica o front).
 *
 * Disparado APENAS sob demanda (clique do usuário). Nunca chamar automaticamente
 * dentro de useEffect de bubble — pode gerar dezenas/centenas de chamadas
 * concorrentes e travar o navegador (OOM).
 *
 * Proteções:
 * - dedupe por message_id (inflight)
 * - cache de sucesso/falha por message_id
 * - cooldown de 60s após falha
 * - limite global de concorrência (MAX_CONCURRENT)
 */
const inflight = new Map<string, Promise<void>>();
const succeeded = new Set<string>();
const failed = new Map<string, number>();
const FAILURE_COOLDOWN_MS = 60_000;

const MAX_CONCURRENT = 2;
let activeCount = 0;
const waitQueue: Array<() => void> = [];

function acquireSlot(): Promise<void> {
  if (activeCount < MAX_CONCURRENT) {
    activeCount++;
    return Promise.resolve();
  }
  return new Promise<void>((resolve) => {
    waitQueue.push(() => {
      activeCount++;
      resolve();
    });
  });
}

function releaseSlot() {
  activeCount = Math.max(0, activeCount - 1);
  const next = waitQueue.shift();
  if (next) next();
}

type MediaKind = 'image' | 'video' | 'audio' | 'document' | 'sticker';

function mediaTypeFor(msg: ChatMessage): MediaKind | null {
  switch (msg.message_type) {
    case 'image':
    case 'video':
    case 'audio':
    case 'document':
    case 'sticker':
      return msg.message_type;
    default:
      return null;
  }
}

export function ensureEvolutionMedia(msg: ChatMessage): Promise<void> | null {
  if (!msg?.message_id) return null;
  if (msg.media_storage_path) return null;
  if (succeeded.has(msg.message_id)) return null;
  if ((msg.provider ?? 'evolution') !== 'evolution') return null;
  const kind = mediaTypeFor(msg);
  if (!kind) return null;

  const existing = inflight.get(msg.message_id);
  if (existing) return existing;

  const cooldownUntil = failed.get(msg.message_id);
  if (cooldownUntil && Date.now() < cooldownUntil) return null;

  const p = (async () => {
    await acquireSlot();
    try {
      await evolutionApi.downloadMedia(msg.message_id, msg.media_mimetype || undefined, kind);
      succeeded.add(msg.message_id);
      failed.delete(msg.message_id);
      if (msg.media_storage_path) purgeCachedMediaUrl(msg.media_storage_path);
    } catch (err) {
      failed.set(msg.message_id, Date.now() + FAILURE_COOLDOWN_MS);
      console.warn('[ensureEvolutionMedia] failed', msg.message_id, err);
    } finally {
      inflight.delete(msg.message_id);
      releaseSlot();
    }
  })();
  inflight.set(msg.message_id, p);
  return p;
}

/** Verifica se já tentamos e estamos em cooldown. */
export function isEvolutionMediaCooldown(messageId: string): boolean {
  const until = failed.get(messageId);
  return !!until && Date.now() < until;
}

/** Limpa cooldown para retry manual (botão "Recarregar"). */
export function resetEvolutionMediaFailure(messageId: string) {
  failed.delete(messageId);
  succeeded.delete(messageId);
}
