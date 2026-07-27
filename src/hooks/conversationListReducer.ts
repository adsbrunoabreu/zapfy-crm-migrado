// Lógica pura de mutação do cache de conversas (sem dependências de runtime).
// Mantida fora de useConversations.ts para permitir testes em ambiente Node
// sem precisar carregar o client Supabase (que exige localStorage).

export interface ConversationLite {
  id: string;
  last_message_at: string | null;
  updated_at: string;
  created_at: string;
  is_archived: boolean;
  last_message_text: string | null;
}

export const conversationRecencyTs = (
  c: Pick<ConversationLite, 'last_message_at' | 'updated_at' | 'created_at'>,
) => {
  const v = c.last_message_at || c.updated_at || c.created_at;
  return v ? new Date(v).getTime() : 0;
};

export const sortByLastMessage = <T extends ConversationLite>(list: T[]): T[] =>
  [...list].sort((a, b) => conversationRecencyTs(b) - conversationRecencyTs(a));

/**
 * Aplica um UPDATE realtime preservando referências sempre que possível.
 *
 * Regras:
 *  - Saiu do filtro (archived mismatch): remove.
 *  - Entrou agora: insere ordenado.
 *  - Posição não muda: substitui in-place (mesma identidade dos vizinhos
 *    → o item da barra lateral não remonta/pisca).
 *  - last_message_at NUNCA regride: sempre preserva o MAIOR entre existing
 *    e updated (protege previews otimistas locais quando a Evolution está
 *    lenta e o servidor demora para confirmar).
 */
export function applyConversationUpdate<T extends ConversationLite>(
  old: T[] | undefined,
  updated: T,
  archived: boolean,
): T[] | undefined {
  if (!old) return old;
  const matches = (c: T) => !!c.is_archived === archived;
  const idx = old.findIndex((c) => c.id === updated.id);
  const existing = idx >= 0 ? old[idx] : undefined;
  let merged = { ...(existing || ({} as T)), ...updated } as T;

  // Anti-regressão: se o cache local tem last_message_at mais novo que o
  // payload do servidor, preserva o local + o preview de texto local.
  if (existing?.last_message_at && updated?.last_message_at) {
    const te = new Date(existing.last_message_at).getTime();
    const tu = new Date(updated.last_message_at).getTime();
    if (te > tu) {
      merged = {
        ...merged,
        last_message_at: existing.last_message_at,
        last_message_text: existing.last_message_text,
      };
    }
  }

  if (!matches(merged)) {
    if (idx < 0) return old;
    const next = old.slice();
    next.splice(idx, 1);
    return next;
  }

  if (idx < 0) {
    return sortByLastMessage([merged, ...old]);
  }

  const mergedTs = conversationRecencyTs(merged);
  let newIdx = 0;
  for (let i = 0; i < old.length; i++) {
    if (i === idx) continue;
    if (conversationRecencyTs(old[i]) > mergedTs) newIdx++;
    else break;
  }

  if (newIdx === idx) {
    const next = old.slice();
    next[idx] = merged;
    return next;
  }

  const without = old.slice();
  without.splice(idx, 1);
  without.splice(newIdx, 0, merged);
  return without;
}
