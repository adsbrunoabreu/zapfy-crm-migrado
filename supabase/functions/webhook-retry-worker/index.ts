import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { downloadCloudMedia } from './handlers/cloudHandler.ts'

// Worker idempotente (claim_webhook_retries usa FOR UPDATE SKIP LOCKED + attempts).
// Chamado pelo cron com apikey anon — sem guard interno para não bloquear ticks.
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface RetryItem {
  id: string
  company_id: string
  kind: 'persist_message' | 'status_update' | 'download_media'
  payload: Record<string, unknown>
  message_id: string | null
  provider: string | null
  attempts: number
}

async function processItem(supabase: any, item: RetryItem): Promise<{ ok: boolean; error?: string }> {
  try {
    if (item.kind === 'persist_message') {
      const row = item.payload as Record<string, unknown>
      const { error } = await supabase
        .from('chat_messages')
        .upsert([row], { onConflict: 'company_id,message_id' })
      if (error) return { ok: false, error: error.message }
      return { ok: true }
    }

    if (item.kind === 'status_update') {
      const messageId = String((item.payload as Record<string, unknown>).message_id ?? item.message_id ?? '')
      const status = String((item.payload as Record<string, unknown>).status ?? '')
      if (!messageId || !status) return { ok: false, error: 'invalid_payload' }

      const { data, error } = await supabase.rpc('set_chat_message_status', {
        _message_id: messageId,
        _company_id: item.company_id,
        _status: status,
      })
      if (error) return { ok: false, error: error.message }
      if (data === null) return { ok: false, error: 'message_not_found_yet' }
      return { ok: true }
    }

    if (item.kind === 'download_media') {
      const p = item.payload as Record<string, unknown>
      const mediaId = String(p.media_id ?? '')
      const messageId = String(item.message_id ?? '')
      const mediaType = String(p.media_type ?? 'document')
      const fallbackMime = (p.media_mimetype as string | null) ?? null
      const instanceId = String(p.instance_id ?? '')
      if (!mediaId || !messageId || !instanceId) return { ok: false, error: 'invalid_payload' }

      const { data: inst } = await supabase
        .from('whatsapp_instances')
        .select('config')
        .eq('id', instanceId)
        .maybeSingle()
      const accessToken = (inst?.config?.accessToken as string | undefined) ?? null
      if (!accessToken) return { ok: false, error: 'no_access_token' }

      const downloaded = await downloadCloudMedia(supabase, {
        accessToken,
        mediaId,
        companyId: item.company_id,
        messageId,
        mediaType,
        fallbackMime,
      })
      if (!downloaded) return { ok: false, error: 'download_failed' }

      const { error: upErr } = await supabase
        .from('chat_messages')
        .update({ media_storage_path: downloaded.path, media_mimetype: downloaded.mime })
        .eq('company_id', item.company_id)
        .eq('message_id', messageId)
      if (upErr) return { ok: false, error: upErr.message }
      return { ok: true }
    }

    return { ok: false, error: `unknown_kind:${item.kind}` }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) }
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders })




  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )

  const BATCH_SIZE = 200
  const MAX_ITERATIONS = 5
  const TIME_BUDGET_MS = 50_000
  const startedAt = Date.now()

  let totalClaimed = 0
  let success = 0
  let failed = 0
  let dead = 0

  try {
    for (let iter = 0; iter < MAX_ITERATIONS; iter++) {
      if (Date.now() - startedAt > TIME_BUDGET_MS) break

      const { data: items, error } = await supabase.rpc('claim_webhook_retries', { _limit: BATCH_SIZE })
      if (error) throw error

      const list = (items ?? []) as RetryItem[]
      if (list.length === 0) break
      totalClaimed += list.length

      for (const item of list) {
        const result = await processItem(supabase, item)
        if (result.ok) {
          await supabase.rpc('mark_webhook_retry_done', { _id: item.id })
          success++
          await supabase.from('message_sync_log').insert({
            company_id: item.company_id,
            provider: item.provider,
            event: 'retry.success',
            status: 'success',
            metadata: { message_id: item.message_id, kind: item.kind, attempts: item.attempts + 1 },
          })
        } else {
          const { data: newStatus } = await supabase.rpc('mark_webhook_retry_failed', {
            _id: item.id,
            _error: result.error ?? 'unknown',
          })
          if (newStatus === 'dead') {
            dead++
            await supabase.from('message_sync_log').insert({
              company_id: item.company_id,
              provider: item.provider,
              event: 'retry.dead',
              status: 'error',
              error_message: result.error,
              metadata: { message_id: item.message_id, kind: item.kind, attempts: item.attempts + 1 },
            })
            try {
              const { data: admins } = await supabase
                .from('user_roles')
                .select('user_id')
                .in('role', ['admin', 'master'])
                .limit(20)
              const targets = (admins ?? [])
                .map((r: { user_id: string }) => r.user_id)
                .filter(Boolean)
              if (targets.length) {
                await supabase.from('app_notifications').insert(
                  targets.map((uid: string) => ({
                    user_id: uid,
                    company_id: item.company_id,
                    type: 'webhook_retry_dead',
                    severity: 'error',
                    title: 'Falha persistente em webhook de mensagem',
                    message: `Mensagem ${item.message_id ?? '?'} (${item.kind}) não pôde ser processada após várias tentativas: ${result.error}`,
                    metadata: { retry_id: item.id, kind: item.kind, message_id: item.message_id },
                  })),
                )
              }
            } catch (_) {
              // ignore
            }
          } else {
            failed++
          }
        }
      }
    }

    return new Response(
      JSON.stringify({ claimed: totalClaimed, success, failed, dead, ms: Date.now() - startedAt }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )

  } catch (e) {
    console.error('[webhook-retry-worker] error', e)
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : String(e) }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  }
})
