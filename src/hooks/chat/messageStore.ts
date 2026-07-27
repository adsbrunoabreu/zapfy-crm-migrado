/**
 * Store incremental e normalizado para `ChatMessage`.
 *
 * Substitui o pipeline antigo `sort(collapse(dedupe(...)))` — que era
 * O(n²) por causa do `collapseOptimisticOrphans` e re-rodava a cada
 * evento realtime — por operações incrementais:
 *
 *   - `mergeMessage`   : O(n) cópia + O(log n) busca binária
 *   - `mergeBatch`     : O(n) reindex + O(b·log n) para batch grande
 *   - `normalizeFull`  : O(n) — usado apenas em carregamentos iniciais
 *
 * O array retornado é sempre uma nova referência (imutável) e já está
 * ordenado pelo comparador canônico. Consumidores podem ler em O(1)
 * sem precisar reordenar.
 */
import type { ChatMessage } from '@/hooks/useChatMessages';

const STATUS_PRIORITY: Record<string, number> = {
  uploading: 0, sending: 1, pending: 1, queued: 1,
  error: 2, failed: 2, sent: 3, delivered: 4, read: 5, played: 5,
};

export const pickHigherStatus = (a?: string | null, b?: string | null): string => {
  const av = STATUS_PRIORITY[a || ''] ?? -1;
  const bv = STATUS_PRIORITY[b || ''] ?? -1;
  return av >= bv ? (a || b || '') : (b || a || '');
};

export const isOutgoingPending = (m: ChatMessage): boolean =>
  m.from_me && (
    m.status === 'uploading' ||
    m.status === 'sending' ||
    m.status === 'pending' ||
    m.status === 'queued'
  );

const isOptimistic = (m: ChatMessage): boolean =>
  !!m.id?.startsWith('optimistic-') || typeof m.seq !== 'number';

const tsOf = (m: ChatMessage): number =>
  new Date(m.timestamp || m.created_at).getTime();

/**
 * Normaliza conteúdo para comparação fuzzy entre bolha otimista e eco real.
 * Remove assinatura do agente (linhas com `*Nome*`, `Nome — Suporte`,
 * `Atendido por: Nome`) e colapsa whitespace. Mantém comparação razoavelmente
 * estrita: só serve para casar a mesma mensagem em representações ligeiramente
 * diferentes (com/sem signature, com/sem newlines extras).
 */
export const normalizeContentForMatch = (raw: string | null | undefined): string => {
  if (!raw) return '';
  return raw
    .replace(/^\s*Atendido por:[^\n]*\n+/i, '')
    .replace(/\n+\s*Atendido por:[^\n]*\s*$/i, '')
    .replace(/^\s*[^\n]+\s—\sSuporte\s*\n+/u, '')
    .replace(/\n+\s*[^\n]+\s—\sSuporte\s*$/u, '')
    .replace(/^\s*\*[^*\n]+\*\s*\n+/, '')
    .replace(/\n+\s*\*[^*\n]+\*\s*$/, '')
    .replace(/\s+/g, ' ')
    .trim();
};

/**
 * Comparador canônico. Mensagens otimistas pendentes vão para o fim;
 * o restante é ordenado por timestamp do provider, com `seq` e
 * `created_at` como desempates.
 */
export const compareMessages = (a: ChatMessage, b: ChatMessage): number => {
  const ap = isOutgoingPending(a) ? 1 : 0;
  const bp = isOutgoingPending(b) ? 1 : 0;
  if (ap !== bp) return ap - bp;

  const at = tsOf(a);
  const bt = tsOf(b);
  if (at !== bt) return at - bt;

  const aSeq = typeof a.seq === 'number' ? a.seq : null;
  const bSeq = typeof b.seq === 'number' ? b.seq : null;
  if (aSeq !== null && bSeq !== null) return aSeq - bSeq;
  if (aSeq !== null) return -1;
  if (bSeq !== null) return 1;

  const ac = new Date(a.created_at || a.timestamp).getTime();
  const bc = new Date(b.created_at || b.timestamp).getTime();
  return ac - bc;
};

const keysFor = (m: ChatMessage): string[] => {
  const ks: string[] = [];
  if (m.message_id && !m.message_id.startsWith('optimistic-')) ks.push(`m:${m.message_id}`);
  // provider_message_id é a chave canônica de ACK; pode chegar antes do row real.
  const pmid = (m as unknown as { provider_message_id?: string | null }).provider_message_id;
  if (pmid) ks.push(`p:${pmid}`);
  if (m.client_id) ks.push(`c:${m.client_id}`);
  if (m.id) ks.push(`i:${m.id}`);
  return ks;
};

/** O(n) — constrói mapa de chaves → índice. */
export const buildIndex = (list: ChatMessage[]): Map<string, number> => {
  const map = new Map<string, number>();
  for (let i = 0; i < list.length; i++) {
    for (const k of keysFor(list[i])) map.set(k, i);
  }
  return map;
};

/** O(log n) — posição de inserção mantendo o array ordenado. */
const binaryInsertPos = (list: ChatMessage[], msg: ChatMessage): number => {
  let lo = 0, hi = list.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (compareMessages(list[mid], msg) <= 0) lo = mid + 1;
    else hi = mid;
  }
  return lo;
};

const mergeOne = (prev: ChatMessage, incoming: ChatMessage): ChatMessage => {
  // Prefere a entrada "real" como base; preserva client_id original e
  // quoted_message_id quando o realtime vier sem ele.
  // Quando ambas são reais (caso típico de UPDATE via realtime), incoming
  // vence — é a versão mais recente da linha (ex.: edited_at/content).
  const prevOpt = isOptimistic(prev);
  const newOpt = isOptimistic(incoming);
  const bothReal = !prevOpt && !newOpt;
  const base = bothReal ? incoming : ((!newOpt && prevOpt) ? incoming : prev);
  const other = base === prev ? incoming : prev;
  return {
    ...base,
    status: pickHigherStatus(prev.status, incoming.status),
    client_id: prev.client_id ?? incoming.client_id ?? base.client_id ?? other.client_id,
    quoted_message_id: base.quoted_message_id ?? other.quoted_message_id ?? null,
  };
};

/**
 * Insere ou faz merge incremental de uma única mensagem.
 * Não recria/reordena toda a lista — usa binary insert.
 */
export const mergeMessage = (list: ChatMessage[], msg: ChatMessage): ChatMessage[] => {
  if (list.length === 0) return [msg];

  // 1) Match por chave estável (id, client_id, message_id, provider_message_id).
  //    Varre de trás pra frente porque otimistas pendentes ficam no fim.
  let foundIdx: number | undefined;
  const incomingPmid = (msg as unknown as { provider_message_id?: string | null }).provider_message_id ?? null;
  for (let i = list.length - 1; i >= 0; i--) {
    const cur = list[i];
    const curPmid = (cur as unknown as { provider_message_id?: string | null }).provider_message_id ?? null;
    if (
      (cur.id && cur.id === msg.id) ||
      (cur.message_id && msg.message_id && !msg.message_id.startsWith('optimistic-') && cur.message_id === msg.message_id) ||
      (cur.client_id && msg.client_id && cur.client_id === msg.client_id) ||
      (curPmid && incomingPmid && curPmid === incomingPmid)
    ) {
      foundIdx = i;
      break;
    }
  }

  // 2) Fallback: incoming real sem chave correspondente pode ser a
  //    confirmação de uma otimista órfã (envio externo, ai-agent-runner)
  //    OU uma re-entrega do mesmo evento recebido (webhook reprocessado,
  //    catchUp pegando linha já no cache sob outra identidade) OU eco
  //    do provider com signature aplicada/removida. Colapsa por conteúdo
  //    normalizado (sem assinatura/whitespace) numa janela curta.
  if (foundIdx === undefined && !isOptimistic(msg)) {
    const ts = tsOf(msg);
    const content = normalizeContentForMatch(msg.content);
    for (let i = list.length - 1; i >= 0; i--) {
      const cur = list[i];
      if (cur.from_me !== msg.from_me) continue;
      if (cur.message_type !== msg.message_type) continue;
      // Janela: from_me 120s (signature/echo do provider podem demorar),
      // received 5s.
      if (Math.abs(tsOf(cur) - ts) > (msg.from_me ? 120_000 : 5_000)) continue;
      const curContent = normalizeContentForMatch(cur.content);
      if (!content && !curContent) {
        // Mídia sem caption: dedupe somente se o tipo bater e a janela for
        // bem curta (2s) para não fundir áudios distintos.
        if (Math.abs(tsOf(cur) - ts) > 2_000) continue;
      } else if (content !== curContent) {
        continue;
      }
      // Para from_me com message_id real diferente: só colapsa contra
      // otimista pendente OU contra uma linha sem provider_message_id
      // (eco webhook escrito antes do persist do outbound-dispatch).
      if (msg.from_me && cur.message_id && msg.message_id &&
          cur.message_id !== msg.message_id &&
          !cur.message_id.startsWith('optimistic-') &&
          !msg.message_id.startsWith('optimistic-')) {
        const curHasPmid = !!(cur as { provider_message_id?: string | null }).provider_message_id;
        const msgHasPmid = !!(msg as { provider_message_id?: string | null }).provider_message_id;
        if (curHasPmid && msgHasPmid) continue;
      }
      foundIdx = i;
      break;
    }
  }



  if (foundIdx !== undefined) {
    const merged = mergeOne(list[foundIdx], msg);
    const sortKeyChanged =
      isOutgoingPending(list[foundIdx]) !== isOutgoingPending(merged) ||
      list[foundIdx].timestamp !== merged.timestamp ||
      list[foundIdx].seq !== merged.seq;
    const next = list.slice();
    next[foundIdx] = merged;
    if (!sortKeyChanged) return next;
    next.splice(foundIdx, 1);
    const pos = binaryInsertPos(next, merged);
    next.splice(pos, 0, merged);
    return next;
  }

  // Inserção nova — caminho rápido: append se já vem no fim (caso comum).
  if (list.length === 0 || compareMessages(list[list.length - 1], msg) <= 0) {
    return [...list, msg];
  }
  const pos = binaryInsertPos(list, msg);
  const next = list.slice();
  next.splice(pos, 0, msg);
  return next;
};

/**
 * Batch merge: O(n + b log n). Usa índice para localizar matches em O(1).
 * Faz uma única ordenação final apenas se necessário.
 */
export const mergeBatch = (list: ChatMessage[], incoming: ChatMessage[]): ChatMessage[] => {
  if (incoming.length === 0) return list;
  if (list.length === 0) return normalizeFull(incoming);
  const index = buildIndex(list);
  const out = list.slice();
  const newOnes: ChatMessage[] = [];
  for (const msg of incoming) {
    const ks = keysFor(msg);
    let idx: number | undefined;
    for (const k of ks) {
      const i = index.get(k);
      if (typeof i === 'number') { idx = i; break; }
    }
    if (idx !== undefined) {
      out[idx] = mergeOne(out[idx], msg);
    } else {
      newOnes.push(msg);
    }
  }
  if (newOnes.length === 0) {
    // Pode ter alterado sort keys pontualmente — checa rapidamente.
    return needsResort(out) ? out.sort(compareMessages) : out;
  }
  // Estratégia: se a maioria das novas é "no fim", append+sort. Caso
  // contrário, splice por binary insert. Aqui simplificamos com um sort
  // final O((n+b) log (n+b)), já que batches são raros (catchUp/loadOlder).
  const merged = out.concat(newOnes);
  merged.sort(compareMessages);
  return merged;
};

const needsResort = (list: ChatMessage[]): boolean => {
  for (let i = 1; i < list.length; i++) {
    if (compareMessages(list[i - 1], list[i]) > 0) return true;
  }
  return false;
};

/**
 * Colapsa bolhas otimistas órfãs em O(n) via bucket por
 * `from_me|content|floor(ts/30s)`. Confere buckets vizinhos para cobrir
 * janelas que cruzam a fronteira do bucket.
 */
const collapseOrphansFast = (list: ChatMessage[]): ChatMessage[] => {
  if (list.length < 2) return list;
  const BUCKET = 30_000;
  // Para cada bucket: { hasReal, firstOptimisticIdx }
  type Bucket = { hasReal: boolean; firstOptimisticIdx: number };
  const buckets = new Map<string, Bucket>();
  const bucketKey = (m: ChatMessage, k: number) =>
    `${m.from_me ? 1 : 0}|${m.content || ''}|${k}`;
  const ts = list.map(tsOf);

  for (let i = 0; i < list.length; i++) {
    const m = list[i];
    const k = Math.floor(ts[i] / BUCKET);
    const key = bucketKey(m, k);
    let b = buckets.get(key);
    if (!b) { b = { hasReal: false, firstOptimisticIdx: -1 }; buckets.set(key, b); }
    if (!isOptimistic(m)) b.hasReal = true;
    else if (b.firstOptimisticIdx === -1) b.firstOptimisticIdx = i;
  }

  const checkBucket = (m: ChatMessage, k: number, i: number): boolean => {
    const b = buckets.get(bucketKey(m, k));
    if (!b) return false;
    if (b.hasReal) return true;
    if (b.firstOptimisticIdx !== -1 && b.firstOptimisticIdx !== i) return true;
    return false;
  };

  return list.filter((m, i) => {
    const isOrphanCandidate = isOptimistic(m) && (
      m.status === 'queued' || m.status === 'sending' ||
      m.status === 'pending' || m.status === 'uploading'
    );
    if (!isOrphanCandidate) return true;
    const k = Math.floor(ts[i] / BUCKET);
    // Bucket atual + vizinhos cobrem janela ~±30s.
    if (checkBucket(m, k, i)) return false;
    if (checkBucket(m, k - 1, i)) return false;
    if (checkBucket(m, k + 1, i)) return false;
    return true;
  });
};

/** O(n) — dedupe por chaves, mantendo merge de status. */
const dedupeMessages = (list: ChatMessage[]): ChatMessage[] => {
  const byKey = new Map<string, number>();
  const out: ChatMessage[] = [];
  for (const msg of list) {
    const ks = keysFor(msg);
    let existingIdx: number | undefined;
    for (const k of ks) {
      const i = byKey.get(k);
      if (typeof i === 'number') { existingIdx = i; break; }
    }
    if (typeof existingIdx === 'number') {
      const merged = mergeOne(out[existingIdx], msg);
      out[existingIdx] = merged;
      for (const k of keysFor(merged)) byKey.set(k, existingIdx);
    } else {
      const idx = out.push(msg) - 1;
      for (const k of ks) byKey.set(k, idx);
    }
  }
  return out;
};

/**
 * Pipeline completo de normalização — uso restrito a carregamentos
 * iniciais (initial query, catchUp em massa, loadOlder).
 * Não chamar em handlers realtime.
 */
export const normalizeFull = (list: ChatMessage[]): ChatMessage[] => {
  const deduped = dedupeMessages(list);
  const collapsed = collapseOrphansFast(deduped);
  collapsed.sort(compareMessages);
  return collapsed;
};
