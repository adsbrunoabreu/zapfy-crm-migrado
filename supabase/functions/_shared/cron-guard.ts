/**
 * cron-guard — gate compartilhado para workers cron / internos.
 *
 * Aceita a requisição apenas quando:
 *   - `Authorization: Bearer <SUPABASE_SERVICE_ROLE_KEY>` (caminho usado por
 *     `pg_cron` via `net.http_post` e por `supabase.functions.invoke()` quando
 *     o cliente está autenticado com a service role).
 *   - OU `x-internal-key: <SUPABASE_SERVICE_ROLE_KEY>` (compat com workers
 *     antigos como ai-agent-runner / trial-reminders).
 *
 * Uso típico no início do handler:
 *
 *   const denied = denyIfNotInternal(req)
 *   if (denied) return denied
 */

const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''

function constantTimeEquals(a: string, b: string): boolean {
  if (!a || !b) return false
  if (a.length !== b.length) return false
  let mismatch = 0
  for (let i = 0; i < a.length; i++) mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return mismatch === 0
}

export function isInternalRequest(req: Request): boolean {
  if (!SERVICE_ROLE_KEY) return false
  const auth = req.headers.get('Authorization') || req.headers.get('authorization') || ''
  if (auth.toLowerCase().startsWith('bearer ')) {
    const token = auth.slice(7).trim()
    if (constantTimeEquals(token, SERVICE_ROLE_KEY)) return true
  }
  const internal = req.headers.get('x-internal-key') || req.headers.get('X-Internal-Key') || ''
  if (constantTimeEquals(internal, SERVICE_ROLE_KEY)) return true
  return false
}

/**
 * Retorna um `Response` 401 se a requisição não for interna, ou `null` se ok.
 * `corsHeaders` é injetado para preservar os cabeçalhos CORS do worker chamador.
 */
export function denyIfNotInternal(
  req: Request,
  corsHeaders: Record<string, string> = {},
): Response | null {
  if (isInternalRequest(req)) return null
  return new Response(
    JSON.stringify({ error: 'unauthorized', detail: 'internal-only endpoint' }),
    { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
  )
}
