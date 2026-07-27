import { supabase } from '@/integrations/supabase/client';
import type { ProviderType } from '@/types/providers';

export interface SyncEventInput {
  conversationId: string | null;
  companyId: string;
  event: string;
  provider: ProviderType | null;
  status: 'success' | 'error' | 'warning';
  providerEventId?: string | null;
  errorMessage?: string | null;
  messageContent?: string | null;
  metadata?: Record<string, unknown> | null;
}

/** Logging fire-and-forget — nunca pode quebrar o fluxo principal. */
export async function safeLog(input: SyncEventInput): Promise<void> {
  try {
    await supabase.from('message_sync_log').insert({
      company_id: input.companyId,
      conversation_id: input.conversationId,
      event: input.event,
      provider: input.provider,
      provider_event_id: input.providerEventId ?? null,
      status: input.status,
      error_message: input.errorMessage ?? null,
      message_content: input.messageContent?.slice(0, 500) ?? null,
      metadata: (input.metadata ?? null) as never,
    });
  } catch (err) {
    console.warn('[ProviderService] falha ao gravar message_sync_log:', (err as Error)?.message);
  }
}
