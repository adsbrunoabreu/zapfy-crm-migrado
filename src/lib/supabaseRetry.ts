import { supabase } from '@/integrations/supabase/client';

/**
 * Detecta erros de sessão expirada vindos do PostgREST / GoTrue.
 */
export function isJwtExpiredError(err: any): boolean {
  if (!err) return false;
  const msg = String(err?.message ?? err?.error_description ?? err?.error ?? '').toLowerCase();
  const code = String(err?.code ?? err?.status ?? '').toLowerCase();
  return (
    msg.includes('jwt expired') ||
    msg.includes('jwt is expired') ||
    msg.includes('invalid jwt') ||
    msg.includes('token is expired') ||
    code === 'pgrst301' ||
    code === '401'
  );
}

/**
 * Executa `fn`. Se falhar por JWT expirado, força refresh da sessão e tenta de novo.
 * Use em mutações sensíveis (Ganho/Perdido, salvar pagamento, etc.).
 */
export async function withJwtRetry<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (err: any) {
    if (!isJwtExpiredError(err)) throw err;
    const { error: refreshErr } = await supabase.auth.refreshSession();
    if (refreshErr) throw refreshErr;
    return await fn();
  }
}
