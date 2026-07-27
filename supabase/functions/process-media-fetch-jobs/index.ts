/**
 * process-media-fetch-jobs — baixa de forma assíncrona as mídias da
 * Cloud API (Meta) referenciadas em `media_fetch_jobs` e atualiza
 * `chat_messages.media_storage_path` / `media_mimetype`.
 *
 * Acionado por cron (1/min). Reusa `downloadCloudMedia` do cloudHandler.
 */
import { createClient, type SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { denyIfNotInternal } from '../_shared/cron-guard.ts'

const GRAPH_BASE = 'https://graph.facebook.com/v18.0'

function getExtFromMime(mime: string): string {
  const map: Record<string, string> = {
    'audio/ogg; codecs=opus': 'ogg', 'audio/ogg': 'ogg', 'audio/mpeg': 'mp3',
    'audio/mp4': 'm4a', 'audio/aac': 'aac', 'audio/webm': 'webm',
    'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif',
    'video/mp4': 'mp4', 'video/3gpp': '3gp', 'application/pdf': 'pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
  }
  return map[mime] || mime.split('/')[1]?.split(';')[0] || 'bin'
}

async function downloadCloudMedia(
  supabase: SupabaseClient,
  args: { accessToken: string; mediaId: string; companyId: string; messageId: string; mediaType: string; fallbackMime: string | null },
): Promise<{ path: string; mime: string } | null> {
  const { accessToken, mediaId, companyId, messageId, mediaType, fallbackMime } = args
  try {
    const metaResp = await fetch(`${GRAPH_BASE}/${mediaId}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
      signal: AbortSignal.timeout(15000),
    })
    if (!metaResp.ok) { console.error('[media] meta fetch failed', metaResp.status); return null }
    const meta = await metaResp.json() as { url?: string; mime_type?: string }
    if (!meta.url) return null
    const mime = meta.mime_type || fallbackMime || 'application/octet-stream'
    const binResp = await fetch(meta.url, {
      headers: { Authorization: `Bearer ${accessToken}` },
      signal: AbortSignal.timeout(45000),
    })
    if (!binResp.ok) { console.error('[media] binary fetch failed', binResp.status); return null }
    const buf = new Uint8Array(await binResp.arrayBuffer())
    const ext = getExtFromMime(mime)
    const path = `${companyId}/${mediaType}/${messageId}.${ext}`
    // Normaliza content-type (sem `; codecs=opus` etc.) para o Storage.
    const normalizedMime = mime.split(';')[0].trim() || 'application/octet-stream'
    const { error: upErr } = await supabase.storage
      .from('chat-media')
      .upload(path, buf, { contentType: normalizedMime, upsert: true })
    if (upErr) { console.error('[media] upload failed', upErr.message); return null }
    return { path, mime: normalizedMime }
  } catch (e) {
    console.error('[media] error', (e as Error)?.message)
    return null
  }
}

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface MediaJob {
  id: string
  company_id: string
  instance_id: string
  message_id: string
  media_id: string
  media_type: string
  media_mimetype: string | null
  attempts: number
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders })
  const denied = denyIfNotInternal(req, corsHeaders); if (denied) return denied


  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )

  try {
    const { data: items, error } = await supabase.rpc('claim_media_fetch_jobs', { _limit: 10 })
    if (error) throw error

    const list = (items ?? []) as MediaJob[]
    let success = 0
    let failed = 0
    let dead = 0

    for (const job of list) {
      try {
        const { data: inst } = await supabase
          .from('whatsapp_instances')
          .select('config')
          .eq('id', job.instance_id)
          .maybeSingle()
        const accessToken = (inst?.config?.accessToken as string | undefined) ?? null
        if (!accessToken) throw new Error('no_access_token')

        const downloaded = await downloadCloudMedia(supabase, {
          accessToken,
          mediaId: job.media_id,
          companyId: job.company_id,
          messageId: job.message_id,
          mediaType: job.media_type,
          fallbackMime: job.media_mimetype,
        })
        if (!downloaded) throw new Error('download_failed')

        const { error: upErr } = await supabase
          .from('chat_messages')
          .update({ media_storage_path: downloaded.path, media_mimetype: downloaded.mime })
          .eq('company_id', job.company_id)
          .eq('message_id', job.message_id)
        if (upErr) throw new Error(upErr.message)

        await supabase.rpc('mark_media_fetch_done', { _id: job.id, _path: downloaded.path })
        success++
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e)
        const { data: status } = await supabase.rpc('mark_media_fetch_failed', {
          _id: job.id,
          _error: msg.slice(0, 500),
        })
        if (status === 'dead') dead++
        else failed++
        console.error('[process-media-fetch-jobs] failed', job.id, msg)
      }
    }

    return new Response(
      JSON.stringify({ claimed: list.length, success, failed, dead }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  } catch (e) {
    console.error('[process-media-fetch-jobs] error', e)
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : String(e) }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  }
})
