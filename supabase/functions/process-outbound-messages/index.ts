/**
 * process-outbound-messages — worker da fila `outbound_message_queue`.
 *
 * Acionado por cron 1/min como backstop. O caminho rápido fica em
 * `enqueue-outbound-message`, que despacha inline. Este worker pega:
 *   - itens cujo inline falhou e entraram em backoff;
 *   - itens deixados pelo inline ao estourar orçamento;
 *   - retries normais.
 *
 * A lógica de envio vive em `_shared/outbound-dispatch.ts` (compartilhada).
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { dispatchOutbound, type QueueRow } from '../_shared/outbound-dispatch.ts'
import { denyIfNotInternal } from '../_shared/cron-guard.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const BATCH_LIMIT = 100
const CONCURRENCY = 8

async function runWithConcurrency<T>(items: T[], limit: number, fn: (it: T) => Promise<'success' | 'failed' | 'dead'>) {
  let success = 0, failed = 0, dead = 0
  let cursor = 0
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const idx = cursor++
      const r = await fn(items[idx])
      if (r === 'success') success++
      else if (r === 'dead') dead++
      else failed++
    }
  })
  await Promise.all(workers)
  return { success, failed, dead }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders })
  const denied = denyIfNotInternal(req, corsHeaders); if (denied) return denied


  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)

  try {
    const { data: items, error } = await supabase.rpc('claim_outbound_messages', { _limit: BATCH_LIMIT })
    if (error) throw error
    const list = (items ?? []) as QueueRow[]
    if (list.length === 0) {
      return new Response(JSON.stringify({ claimed: 0 }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }
    const stats = await runWithConcurrency(list, CONCURRENCY, (it) => dispatchOutbound(supabase, it))
    return new Response(
      JSON.stringify({ claimed: list.length, ...stats }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  } catch (e) {
    console.error('[process-outbound-messages] error', e)
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : String(e) }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  }
})
