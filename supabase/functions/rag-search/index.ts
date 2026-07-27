// Busca semântica (RAG) na base de conhecimento da empresa.
// Body: { agent_id: string, query: string, top_k?: number, document_ids?: string[] }
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const EMBED_MODEL = 'text-embedding-004'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
  const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!
  const GEMINI_API_KEY = Deno.env.get('GEMINI_API_KEY') || Deno.env.get('GOOGLE_AI_API_KEY')

  try {
    if (!GEMINI_API_KEY) throw new Error('GEMINI_API_KEY not configured')

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

    const { agent_id, query, top_k = 5, document_ids } = await req.json()
    if (!agent_id || !query) throw new Error('agent_id e query obrigatórios')

    const admin = createClient(SUPABASE_URL, SERVICE_KEY)

    // Verifica acesso: o usuário precisa ser da mesma empresa do agente (ou master)
    const { data: agent } = await admin.from('ai_agents')
      .select('id, company_id').eq('id', agent_id).maybeSingle()
    if (!agent) throw new Error('agent not found')
    const { data: prof } = await admin.from('profiles')
      .select('company_id').eq('id', user.id).maybeSingle()
    const { data: isMaster } = await admin.rpc('is_master', { _user_id: user.id })
    if (!isMaster && prof?.company_id !== agent.company_id) {
      return new Response(JSON.stringify({ error: 'Forbidden' }), {
        status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const t0 = Date.now()
    const r = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${EMBED_MODEL}:embedContent?key=${GEMINI_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: `models/${EMBED_MODEL}`, content: { parts: [{ text: query }] } }),
      },
    )
    if (!r.ok) {
      const t = await r.text()
      throw new Error(`embed ${r.status}: ${t.slice(0, 200)}`)
    }
    const j = await r.json()
    const qVec = j.embedding?.values
    if (!qVec) throw new Error('embedding vazio')

    const { data: matches, error } = await admin.rpc('match_ai_knowledge', {
      _agent_id: agent_id,
      _query_embedding: qVec,
      _match_count: Math.max(1, Math.min(20, top_k)),
      _min_similarity: 0.3,
      _document_ids: Array.isArray(document_ids) && document_ids.length ? document_ids : null,
    })
    if (error) throw error

    return new Response(JSON.stringify({
      ok: true,
      elapsed_ms: Date.now() - t0,
      matches: matches || [],
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (e: any) {
    return new Response(JSON.stringify({ error: String(e?.message || e) }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
