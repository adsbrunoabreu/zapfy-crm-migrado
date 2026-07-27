/**
 * coexistence-history-worker
 * --------------------------
 * Cron 1min — consome `coexistence_history_chunks` pendentes, expande as
 * mensagens do payload em `chat_messages` (preservando timestamps históricos)
 * e cria/atualiza `conversations`. Mídias do histórico vêm sem asset_id na
 * primeira passada — a Meta envia webhooks separados depois com os ids; o
 * worker apenas marca `media_storage_path=NULL` e `media_mimetype` para que
 * o `download_media` futuro complete o asset.
 *
 * Verify JWT: NÃO. Disparado apenas por cron.
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { denyIfNotInternal } from '../_shared/cron-guard.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
};

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const BATCH_SIZE = 5; // chunks por execução
const MAX_ATTEMPTS = 5;

function normalizePhone(p: string): string {
  return (p || '').replace(/[^\d+]/g, '');
}

interface HistoryMessage {
  id?: string;
  from?: string;
  to?: string;
  timestamp?: string | number;
  type?: string;
  text?: { body?: string };
  image?: { id?: string; mime_type?: string; caption?: string };
  video?: { id?: string; mime_type?: string; caption?: string };
  audio?: { id?: string; mime_type?: string };
  document?: { id?: string; mime_type?: string; filename?: string; caption?: string };
  sticker?: { id?: string; mime_type?: string };
}

function parseHistoryMessage(message: HistoryMessage): {
  type: string;
  content: string | null;
  mediaMime: string | null;
  fileName: string | null;
} {
  const t = String(message.type ?? 'unknown');
  switch (t) {
    case 'text':
      return { type: 'text', content: message.text?.body ?? null, mediaMime: null, fileName: null };
    case 'image':
      return { type: 'image', content: message.image?.caption ?? null, mediaMime: message.image?.mime_type ?? null, fileName: null };
    case 'video':
      return { type: 'video', content: message.video?.caption ?? null, mediaMime: message.video?.mime_type ?? null, fileName: null };
    case 'audio':
      return { type: 'audio', content: null, mediaMime: message.audio?.mime_type ?? null, fileName: null };
    case 'document':
      return { type: 'document', content: message.document?.caption ?? null, mediaMime: message.document?.mime_type ?? null, fileName: message.document?.filename ?? null };
    case 'sticker':
      return { type: 'sticker', content: null, mediaMime: message.sticker?.mime_type ?? null, fileName: null };
    default:
      return { type: 'unknown', content: null, mediaMime: null, fileName: null };
  }
}

async function processChunk(supabase: ReturnType<typeof createClient>, chunk: {
  id: string;
  company_id: string;
  instance_id: string;
  payload: Record<string, unknown>;
}): Promise<{ ok: boolean; processed: number; error?: string }> {
  // Resolve display phone do número para detectar from_me
  const { data: inst } = await supabase
    .from('whatsapp_instances')
    .select('instance_name, phone_number, config, coexistence_state')
    .eq('id', chunk.instance_id)
    .maybeSingle();
  if (!inst) return { ok: false, processed: 0, error: 'instance_not_found' };

  const displayPhone = normalizePhone(
    (inst.phone_number as string | null) ??
    ((inst.config as Record<string, unknown> | null)?.phoneNumber as string | undefined) ??
    '',
  );

  // payload contém .messages[]
  const messages = Array.isArray((chunk.payload as Record<string, unknown>).messages)
    ? ((chunk.payload as Record<string, unknown>).messages as HistoryMessage[])
    : [];

  let processed = 0;
  for (const m of messages) {
    if (!m?.id) continue;
    const fromPhone = normalizePhone(String(m.from ?? ''));
    const toPhone = normalizePhone(String(m.to ?? ''));
    const fromMe = displayPhone && fromPhone === displayPhone;
    const peer = fromMe ? toPhone : fromPhone;
    if (!peer) continue;

    const tsSec = typeof m.timestamp === 'string' ? Number(m.timestamp) : Number(m.timestamp ?? 0);
    const timestamp = tsSec ? new Date(tsSec * 1000).toISOString() : new Date().toISOString();
    const parsed = parseHistoryMessage(m);

    const { data: conv, error: convErr } = await supabase
      .from('conversations')
      .upsert(
        {
          company_id: chunk.company_id,
          instance_name: inst.instance_name as string,
          instance_id: chunk.instance_id,
          provider: 'cloud_api',
          remote_jid: peer,
          phone: peer,
          last_message_text: parsed.content,
          last_message_at: timestamp,
        },
        { onConflict: 'company_id,instance_name,remote_jid' },
      )
      .select('id')
      .maybeSingle();
    if (convErr || !conv) continue;

    await supabase.from('chat_messages').upsert(
      [{
        company_id: chunk.company_id,
        conversation_id: conv.id,
        remote_jid: peer,
        message_id: m.id,
        provider: 'cloud_api',
        provider_message_id: m.id,
        provider_raw_payload: { source: 'coexistence_history', message: m },
        webhook_received_at: new Date().toISOString(),
        from_me: !!fromMe,
        message_type: parsed.type,
        content: parsed.content,
        media_url: null,
        media_mimetype: parsed.mediaMime,
        media_storage_path: null,
        file_name: parsed.fileName,
        status: fromMe ? 'sent' : 'received',
        timestamp,
      }],
      { onConflict: 'company_id,message_id' },
    );
    processed++;
  }

  // Atualiza contadores no coexistence_state
  const state = (inst.coexistence_state as Record<string, unknown> | null) ?? {};
  const totalProcessed = Number(state.history_chunks_processed ?? 0) + 1;
  await supabase
    .from('whatsapp_instances')
    .update({
      coexistence_state: {
        ...state,
        history_chunks_processed: totalProcessed,
      },
    })
    .eq('id', chunk.instance_id);

  return { ok: true, processed };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  const denied = denyIfNotInternal(req, corsHeaders); if (denied) return denied;


  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE);

  // Pega chunks pendentes ordenados (FIFO por phase/chunk_index)
  const { data: chunks, error } = await supabase
    .from('coexistence_history_chunks')
    .select('id, company_id, instance_id, phase, chunk_index, payload, attempts')
    .is('processed_at', null)
    .lt('attempts', MAX_ATTEMPTS)
    .order('phase', { ascending: true })
    .order('chunk_index', { ascending: true })
    .limit(BATCH_SIZE);

  if (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  let okCount = 0;
  let totalMessages = 0;
  for (const chunk of (chunks ?? []) as Array<{ id: string; company_id: string; instance_id: string; phase: number; chunk_index: number; payload: Record<string, unknown>; attempts: number }>) {
    const result = await processChunk(supabase, chunk);
    if (result.ok) {
      await supabase
        .from('coexistence_history_chunks')
        .update({ processed_at: new Date().toISOString(), error: null })
        .eq('id', chunk.id);
      okCount++;
      totalMessages += result.processed;
    } else {
      await supabase
        .from('coexistence_history_chunks')
        .update({ attempts: chunk.attempts + 1, error: result.error ?? 'unknown' })
        .eq('id', chunk.id);
    }
  }

  return new Response(
    JSON.stringify({ ok: true, processed_chunks: okCount, total_messages: totalMessages }),
    { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
  );
});
