// Ingere um documento da KB do Agente IA: lê do bucket privado ai-knowledge,
// extrai texto, divide em chunks, gera embeddings via Lovable AI e persiste.
//
// Auth: usuário autenticado, admin da empresa dona do agente.
// Body: { document_id: uuid }
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const CHUNK_SIZE = 1200
const CHUNK_OVERLAP = 200
const EMBED_MODEL = 'text-embedding-004'
const EMBED_DIM = 768

function chunkText(raw: string): string[] {
  const text = raw.replace(/\s+/g, ' ').trim()
  if (!text) return []
  const out: string[] = []
  let i = 0
  while (i < text.length) {
    const end = Math.min(text.length, i + CHUNK_SIZE)
    let slice = text.slice(i, end)
    if (end < text.length) {
      const lastDot = slice.lastIndexOf('. ')
      if (lastDot > CHUNK_SIZE * 0.6) slice = slice.slice(0, lastDot + 1)
    }
    out.push(slice.trim())
    if (end >= text.length) break
    i += slice.length - CHUNK_OVERLAP
    if (i < 0) i = 0
  }
  return out.filter((c) => c.length > 20)
}

// Extrator simplificado: para PDF tenta extrair streams de texto;
// para TXT/MD usa o conteúdo cru. Para PDFs complexos recomendamos TXT.
function extractFromBytes(bytes: Uint8Array, mime: string): string {
  const decoder = new TextDecoder('utf-8', { fatal: false })
  if (mime.startsWith('text/') || mime.includes('markdown') || mime.includes('plain')) {
    return decoder.decode(bytes)
  }
  // PDF: tenta extrair sequências legíveis
  const raw = decoder.decode(bytes)
  // Pega trechos entre parênteses (comum em streams de texto PDF)
  const matches = raw.match(/\(([^()\\]{2,})\)/g) || []
  const text = matches.map((m) => m.slice(1, -1)).join(' ')
  return text || raw
}

async function embedBatch(texts: string[], apiKey: string): Promise<number[][]> {
  // Google Generative Language API (batchEmbedContents)
  const r = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${EMBED_MODEL}:batchEmbedContents?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        requests: texts.map((t) => ({
          model: `models/${EMBED_MODEL}`,
          content: { parts: [{ text: t }] },
        })),
      }),
    },
  )
  if (!r.ok) {
    const t = await r.text()
    throw new Error(`embed ${r.status}: ${t.slice(0, 200)}`)
  }
  const j = await r.json()
  return (j.embeddings || []).map((e: any) => e.values as number[])
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
  const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!
  const GEMINI_API_KEY = Deno.env.get('GEMINI_API_KEY') || Deno.env.get('GOOGLE_AI_API_KEY')

  try {
    if (!GEMINI_API_KEY) throw new Error('GEMINI_API_KEY not configured')

    // Autentica usuário pelo JWT
    const authHeader = req.headers.get('Authorization') || ''
    const userClient = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    })
    const { data: { user } } = await userClient.auth.getUser()
    if (!user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const { document_id } = await req.json()
    if (!document_id) throw new Error('document_id obrigatório')

    const admin = createClient(SUPABASE_URL, SERVICE_KEY)

    const { data: doc, error: docErr } = await admin
      .from('ai_knowledge_documents')
      .select('*').eq('id', document_id).maybeSingle()
    if (docErr || !doc) throw new Error('document not found')

    // Confere admin da empresa do doc
    const { data: prof } = await admin.from('profiles')
      .select('company_id').eq('id', user.id).maybeSingle()
    const { data: isMaster } = await admin.rpc('is_master', { _user_id: user.id })
    const { data: isCompanyAdmin } = await admin.rpc('has_role', { _user_id: user.id, _role: 'admin' })
    if (!isMaster && (prof?.company_id !== doc.company_id || !isCompanyAdmin)) {
      return new Response(JSON.stringify({ error: 'Forbidden' }), {
        status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    await admin.from('ai_knowledge_documents').update({
      status: 'processing', error: null,
    }).eq('id', doc.id)

    // Baixa arquivo do bucket
    const { data: fileBlob, error: dlErr } = await admin.storage
      .from('ai-knowledge').download(doc.storage_path)
    if (dlErr || !fileBlob) throw new Error(`download falhou: ${dlErr?.message}`)
    const buf = new Uint8Array(await fileBlob.arrayBuffer())

    const text = extractFromBytes(buf, doc.mime_type || '')
    const chunks = chunkText(text)
    if (chunks.length === 0) {
      await admin.from('ai_knowledge_documents').update({
        status: 'error', error: 'Nenhum texto extraível. Use TXT/MD ou PDF com texto selecionável.',
      }).eq('id', doc.id)
      return new Response(JSON.stringify({ error: 'no_text' }), {
        status: 422, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Apaga chunks antigos
    await admin.from('ai_knowledge_chunks').delete().eq('document_id', doc.id)

    // Embeddings em lotes de 50
    const BATCH = 50
    let inserted = 0
    for (let i = 0; i < chunks.length; i += BATCH) {
      const batch = chunks.slice(i, i + BATCH)
      const embeddings = await embedBatch(batch, GEMINI_API_KEY)
      const rows = batch.map((content, j) => ({
        document_id: doc.id,
        company_id: doc.company_id,
        agent_id: doc.agent_id,
        chunk_index: i + j,
        content,
        embedding: embeddings[j] && embeddings[j].length === EMBED_DIM ? embeddings[j] : null,
      }))
      const { error: insErr } = await admin.from('ai_knowledge_chunks').insert(rows)
      if (insErr) throw insErr
      inserted += rows.length
    }

    await admin.from('ai_knowledge_documents').update({
      status: 'ready',
      chunks_count: inserted,
      processed_at: new Date().toISOString(),
    }).eq('id', doc.id)

    return new Response(JSON.stringify({ ok: true, chunks: inserted }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (e: any) {
    const msg = String(e?.message || e)
    try {
      const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
      const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
      const admin = createClient(SUPABASE_URL, SERVICE_KEY)
      const body = await req.clone().json().catch(() => ({}))
      if (body?.document_id) {
        await admin.from('ai_knowledge_documents').update({
          status: 'error', error: msg.slice(0, 500),
        }).eq('id', body.document_id)
      }
    } catch { /* ignore */ }

    return new Response(JSON.stringify({ error: msg }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
