// Helper de circuit breaker + token-bucket por (empresa, provedor).
// Usa as RPCs SQL try_consume_provider_token / record_provider_outcome.
// Uso: const gate = await provGate(admin, companyId, 'shopify'); if (!gate.allowed) return 429;
//      try { ... await gate.success() } catch (e) { await gate.failure(e.message); throw e }

import type { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

export type ProviderName = 'whatsapp' | 'shopify'

export interface GateAllowed {
  allowed: true
  status: string
  success: () => Promise<void>
  failure: (err?: string) => Promise<void>
}
export interface GateBlocked {
  allowed: false
  reason: 'circuit_open' | 'rate_limited' | 'half_open_busy'
  retry_after_sec: number
  status: string
  /** HTTP-friendly response payload */
  body: Record<string, unknown>
  http_status: 429 | 503
}

export async function provGate(
  admin: ReturnType<typeof createClient>,
  companyId: string,
  provider: ProviderName,
  cost = 1,
): Promise<GateAllowed | GateBlocked> {
  if (!companyId) {
    // sem tenant não há rate-limit por empresa; deixa passar
    return {
      allowed: true, status: 'no_tenant',
      success: async () => {}, failure: async () => {},
    }
  }
  const { data, error } = await admin.rpc('try_consume_provider_token', {
    p_company_id: companyId, p_provider: provider, p_cost: cost,
  })
  if (error) {
    console.warn('[provGate] rpc error:', error.message)
    return {
      allowed: true, status: 'rpc_error',
      success: async () => {}, failure: async () => {},
    }
  }
  const r = data as { allowed: boolean; reason?: string; retry_after_sec?: number; status?: string }
  if (!r?.allowed) {
    const reason = (r?.reason ?? 'rate_limited') as GateBlocked['reason']
    const retry = Math.max(1, Math.ceil(Number(r?.retry_after_sec ?? 1)))
    return {
      allowed: false,
      reason,
      retry_after_sec: retry,
      status: r?.status ?? 'unknown',
      http_status: reason === 'circuit_open' ? 503 : 429,
      body: {
        error: reason === 'circuit_open'
          ? 'Provedor temporariamente bloqueado (circuit breaker aberto)'
          : 'Limite de requisições por empresa atingido',
        provider, retry_after_sec: retry, reason,
      },
    }
  }
  return {
    allowed: true,
    status: r.status ?? 'closed',
    success: async () => {
      await admin.rpc('record_provider_outcome', {
        p_company_id: companyId, p_provider: provider, p_success: true, p_error: null,
      })
    },
    failure: async (err?: string) => {
      await admin.rpc('record_provider_outcome', {
        p_company_id: companyId, p_provider: provider, p_success: false, p_error: err ?? null,
      })
    },
  }
}

export function gateBlockedResponse(g: GateBlocked, corsHeaders: Record<string, string>) {
  return new Response(JSON.stringify(g.body), {
    status: g.http_status,
    headers: {
      ...corsHeaders, 'Content-Type': 'application/json',
      'Retry-After': String(g.retry_after_sec),
    },
  })
}
