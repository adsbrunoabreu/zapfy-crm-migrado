/**
 * Normaliza erros vindos de edge functions / chamadas remotas em um formato
 * consistente para a UI e a camada de serviços.
 *
 * Esta versão é síncrona e trata `unknown`. Para extrair o body JSON de uma
 * Response (Supabase Functions retorna em `error.context`), use
 * `extractFunctionErrorAsync` que faz o parse com fallback seguro.
 */

export interface EdgeFunctionError {
  code: string;
  message: string;
  details?: unknown;
}

export function extractFunctionError(error: unknown): EdgeFunctionError {
  if (error instanceof Error) {
    return { code: 'UNKNOWN', message: error.message };
  }
  if (typeof error === 'object' && error !== null) {
    const e = error as Record<string, unknown>;
    return {
      code: String(e.code ?? 'UNKNOWN'),
      message: String(e.message ?? 'Unexpected error'),
      details: e.details,
    };
  }
  return { code: 'UNKNOWN', message: String(error) };
}

/**
 * Versão assíncrona — lê o body JSON de `error.context` (Response do
 * supabase.functions.invoke) e retorna a mensagem mais informativa.
 */
export async function extractFunctionErrorAsync(error: unknown): Promise<string> {
  const base = extractFunctionError(error);
  const fallback = base.message;
  const ctx = (error as { context?: Response } | null)?.context;
  if (!ctx || typeof ctx.clone !== 'function') return fallback;
  try {
    const text = await ctx.clone().text();
    if (!text) return fallback;
    const parsed = JSON.parse(text) as { error?: string; message?: string };
    return parsed.error || parsed.message || fallback;
  } catch {
    return fallback;
  }
}
