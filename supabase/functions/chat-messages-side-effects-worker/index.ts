/**
 * chat-messages-side-effects-worker
 *
 * Worker da fila `chat_message_side_effects_queue`.
 *
 * Para cada item claimed, chama o RPC `run_chat_side_effect(effect_type, msg_id)`
 * que replica a lógica das 5 trigger functions (webhook, link_preview,
 * ai_agent, set_lead_responded, capture_rating).
 *
 * Fase 1b: cron NÃO ativado ainda. Esta função pode ser disparada manualmente
 * via supabase--curl_edge_functions ou via Admin para validação.
 *
 * Backoff via mark_chat_side_effect_failed (5/30/120/600s, max_attempts=5).
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { denyIfNotInternal } from '../_shared/cron-guard.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const BATCH_LIMIT = 50
const CONCURRENCY = 8

interface QueueItem {
  id: string
  chat_message_id: string
  effect_type: string
  retry_count: number
}

async function processOne(supabase: any, item: QueueItem): Promise<'success' | 'failed' | 'dead' | 'skipped'> {
  try {
    const { error } = await supabase.rpc('run_chat_side_effect', {
      _effect_type: item.effect_type,
      _chat_message_id: item.chat_message_id,
    })
    if (error) {
      const msg = (error.message ?? String(error)).slice(0, 1000)
      // Erros estruturais (effect desconhecido, msg deletada) → skip definitivo, sem retry
      if (/unknown_effect_type/.test(msg)) {
        await supabase.rpc('mark_chat_side_effect_skipped', { _id: item.id, _reason: msg })
        return 'skipped'
      }
      const { data: status } = await supabase.rpc('mark_chat_side_effect_failed', { _id: item.id, _error: msg })
      return status === 'dead' ? 'dead' : 'failed'
    }
    await supabase.rpc('mark_chat_side_effect_done', { _id: item.id })
    return 'success'
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    const { data: status } = await supabase.rpc('mark_chat_side_effect_failed', { _id: item.id, _error: msg.slice(0, 1000) })
    return status === 'dead' ? 'dead' : 'failed'
  }
}

async function runWithConcurrency(items: QueueItem[], limit: number, fn: (it: QueueItem) => Promise<'success' | 'failed' | 'dead' | 'skipped'>) {
  let success = 0, failed = 0, dead = 0, skipped = 0
  let cursor = 0
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const idx = cursor++
      const r = await fn(items[idx])
      if (r === 'success') success++
      else if (r === 'dead') dead++
      else if (r === 'skipped') skipped++
      else failed++
    }
  })
  await Promise.all(workers)
  return { success, failed, dead, skipped }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders })
  const denied = denyIfNotInternal(req, corsHeaders); if (denied) return denied

  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)

  try {
    const { data: items, error } = await supabase.rpc('claim_chat_side_effects', { _limit: BATCH_LIMIT })
    if (error) throw error
    const list = (items ?? []) as QueueItem[]
    if (list.length === 0) {
      return new Response(JSON.stringify({ claimed: 0 }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }
    const stats = await runWithConcurrency(list, CONCURRENCY, (it) => processOne(supabase, it))
    return new Response(
      JSON.stringify({ claimed: list.length, ...stats }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  } catch (e) {
    console.error('[chat-side-effects-worker] error', e)
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : String(e) }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  }
})
