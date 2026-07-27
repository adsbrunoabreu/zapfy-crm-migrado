import { supabase } from '@/integrations/supabase/client';

/**
 * Versão atual dos Termos de Uso + Política de Privacidade.
 * Bate com a data exibida nas páginas /termos e /privacidade.
 * Bump aqui quando o conteúdo for atualizado para forçar novo aceite.
 */
export const CURRENT_TERMS_VERSION = '2026-05-11';

const PENDING_OAUTH_KEY = 'zapfy_pending_consent_oauth';

export type ConsentContext = 'signup' | 'login' | 'oauth';

/** Registra o consentimento do usuário autenticado (no-op se falhar — apenas log). */
export async function recordTermsConsent(
  userId: string,
  context: ConsentContext,
): Promise<void> {
  try {
    await (supabase as any).from('user_consents').insert({
      user_id: userId,
      kind: 'terms_privacy',
      version: CURRENT_TERMS_VERSION,
      context,
      user_agent: typeof navigator !== 'undefined' ? navigator.userAgent.slice(0, 500) : null,
    });
  } catch (err) {
    // não bloqueia login/signup
    console.warn('[consent] falha ao registrar consentimento', err);
  }
}

/** Marca um aceite pendente para ser registrado após o redirect do OAuth. */
export function markPendingOAuthConsent() {
  try {
    sessionStorage.setItem(PENDING_OAUTH_KEY, CURRENT_TERMS_VERSION);
  } catch {
    /* ignore */
  }
}

/** Consome o aceite pendente do OAuth, se houver. */
export function consumePendingOAuthConsent(): string | null {
  try {
    const v = sessionStorage.getItem(PENDING_OAUTH_KEY);
    if (v) sessionStorage.removeItem(PENDING_OAUTH_KEY);
    return v;
  } catch {
    return null;
  }
}
