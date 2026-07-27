/**
 * Auditoria de visualização de conversas/mensagens.
 * Chama a RPC SECURITY DEFINER `log_conversation_access`, que resolve
 * company_id e valida o usuário/conversa server-side.
 *
 * Para evitar flood (StrictMode, refetches), aplicamos throttle local
 * por (access_type + conversation_id).
 */
import { supabase } from '@/integrations/supabase/client';

type AccessType = 'view_conversation' | 'view_messages' | 'list_conversations';

const THROTTLE_MS = 30_000;
const lastSent = new Map<string, number>();

export async function logConversationAccess(
  accessType: AccessType,
  opts: {
    conversationId?: string | null;
    messageCount?: number | null;
    metadata?: Record<string, unknown>;
  } = {},
): Promise<void> {
  try {
    const key = `${accessType}:${opts.conversationId ?? 'none'}`;
    const now = Date.now();
    const prev = lastSent.get(key) ?? 0;
    if (now - prev < THROTTLE_MS) return;
    lastSent.set(key, now);

    await supabase.rpc('log_conversation_access', {
      _access_type: accessType,
      _conversation_id: opts.conversationId ?? null,
      _message_count: opts.messageCount ?? null,
      _metadata: (opts.metadata ?? {}) as any,
    });
  } catch {
    // Auditoria nunca deve quebrar o fluxo do usuário.
  }
}
