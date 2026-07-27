import { supabase } from '@/integrations/supabase/client';

type Level = 'info' | 'warn' | 'error';

interface LogChatErrorArgs {
  companyId?: string | null;
  event: string;
  message: string;
  level?: Level;
  metadata?: Record<string, unknown>;
}

/**
 * Telemetria leve do chat → grava em system_logs (source='chat-frontend').
 * Falhas no log nunca propagam.
 */
export async function logChatEvent({
  companyId,
  event,
  message,
  level = 'error',
  metadata,
}: LogChatErrorArgs): Promise<void> {
  if (!companyId) return;
  try {
    await supabase.from('system_logs').insert([
      {
        company_id: companyId,
        source: 'chat-frontend',
        level,
        event,
        message: message.slice(0, 500),
        metadata: (metadata ?? {}) as never,
      },
    ]);
  } catch (e) {
    // silencioso — telemetria nunca quebra UX
    console.warn('[chat-telemetry] failed to log', e);
  }
}
