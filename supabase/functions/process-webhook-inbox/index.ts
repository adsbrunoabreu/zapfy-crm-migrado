/**
 * process-webhook-inbox — worker que consome a fila `webhook_inbox`
 * e executa os handlers de Evolution e Cloud API.
 *
 * Estratégia:
 *   1. `claim_webhook_inbox(_limit)` reserva itens (FOR UPDATE SKIP LOCKED).
 *   2. Para cada item, despacha ao handler correto.
 *   3. Sucesso → `mark_webhook_inbox_done`.
 *   4. Falha   → `mark_webhook_inbox_failed` (backoff exponencial; vira `dead`
 *               após `max_attempts`).
 *
 * Acionado por cron (1/min) e também invocável manualmente para drenar fila.
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { handleEvolution } from './handlers/evolutionHandler.ts'
import { handleCloudApi } from './handlers/cloudHandler.ts'
import { denyIfNotInternal } from '../_shared/cron-guard.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface InboxRow {
  id: string
  provider: 'evolution' | 'cloud_api' | 'unknown'
  payload: Record<string, unknown>
  headers: Record<string, string>
  retry_count: number
}

async function logSafely(supabase: any, row: any) {
  try {
    await supabase.from('message_sync_log').insert(row)
  } catch (_) {
    /* ignore */
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders })
  const denied = denyIfNotInternal(req, corsHeaders); if (denied) return denied


  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )

  try {
    const { data: items, error } = await supabase.rpc('claim_webhook_inbox', { _limit: 25 })
    if (error) throw error

    const list = (items ?? []) as InboxRow[]
    let success = 0
    let failed = 0
    let dead = 0

    for (const item of list) {
      const startedAt = Date.now()
      // Stamp processing_started_at (best-effort, não bloqueia o pipeline)
      try {
        await supabase
          .from('webhook_inbox')
          .update({ processing_started_at: new Date(startedAt).toISOString() })
          .eq('id', item.id)
      } catch (_) { /* ignore */ }

      try {
        // Reconstrói Headers a partir do snapshot
        const headers = new Headers()
        for (const [k, v] of Object.entries(item.headers ?? {})) headers.set(k, v)

        // Extrai rawBody preservado pelo router
        const rawBody = (item.payload as Record<string, unknown>)._raw_body as string ?? ''
        const payload = { ...item.payload }
        delete (payload as Record<string, unknown>)._raw_body

        const ctx = {
          supabase,
          headers,
          rawBody,
          payload,
          log: async (_s: any, row: any) => logSafely(supabase, row),
        }

        if (item.provider === 'cloud_api') {
          await handleCloudApi(ctx as any)
        } else if (item.provider === 'evolution') {
          await handleEvolution(ctx as any)
        } else {
          throw new Error(`unsupported_provider:${item.provider}`)
        }

        const duration = Date.now() - startedAt
        await supabase.rpc('mark_webhook_inbox_done', { _id: item.id })
        // Stamp duração (best-effort)
        try {
          await supabase
            .from('webhook_inbox')
            .update({ processing_duration_ms: duration })
            .eq('id', item.id)
        } catch (_) { /* ignore */ }
        success++
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e)
        const duration = Date.now() - startedAt
        const { data: status } = await supabase.rpc('mark_webhook_inbox_failed', {
          _id: item.id,
          _error: msg.slice(0, 1000),
        })
        try {
          await supabase
            .from('webhook_inbox')
            .update({ processing_duration_ms: duration })
            .eq('id', item.id)
        } catch (_) { /* ignore */ }
        if (status === 'dead') dead++
        else failed++
        console.error('[process-webhook-inbox] item failed:', item.id, msg)
      }
    }

    return new Response(
      JSON.stringify({ claimed: list.length, success, failed, dead }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  } catch (e) {
    console.error('[process-webhook-inbox] error', e)
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : String(e) }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  }
})
