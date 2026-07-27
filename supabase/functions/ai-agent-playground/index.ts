// Playground do Agente IA - dry run, sem persistência nem envio WhatsApp
// Usa as mesmas instruções/persona/RAG do agente real, mas só responde o tester.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { chatCompletion } from '../_shared/ai-router.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface PlaygroundMessage {
  role: 'user' | 'assistant'
  content: string
}

interface Payload {
  agent_id: string
  // Permite testar overrides sem salvar
  overrides?: {
    persona?: string
    system_prompt?: string
    model?: string
    collect_fields?: string[]
  }
  history?: PlaygroundMessage[]
  use_kb?: boolean
  // Modo "envio real": dispara mensagem aprovada via Evolution
  action?: 'generate' | 'send_test'
  send_to_phone?: string
  send_text?: string
  instance_name?: string
}

const normalizeUrl = (raw: string) => raw.trim().replace(/\/+$/, '')
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
  const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!
  const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY')

  if (!LOVABLE_API_KEY) {
    return new Response(JSON.stringify({ error: 'LOVABLE_API_KEY missing' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  // JWT obrigatório - usa o usuário autenticado para validar acesso ao agente
  const authHeader = req.headers.get('Authorization') || ''
  if (!authHeader.startsWith('Bearer ')) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
  const userClient = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
  })
  const { data: userData, error: userErr } = await userClient.auth.getUser()
  if (userErr || !userData?.user) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  const admin = createClient(SUPABASE_URL, SERVICE_KEY)
  const startedAt = Date.now()

  try {
    const payload = (await req.json()) as Payload
    if (!payload?.agent_id) throw new Error('agent_id obrigatório')

    // Carrega agente + valida tenant (ambos os modos)
    const { data: agent, error: agentErr } = await admin
      .from('ai_agents').select('*').eq('id', payload.agent_id).maybeSingle()
    if (agentErr || !agent) throw new Error('agente não encontrado')

    const { data: profile } = await admin
      .from('profiles').select('company_id').eq('id', userData.user.id).maybeSingle()
    if (!profile || profile.company_id !== agent.company_id) {
      return new Response(JSON.stringify({ error: 'Forbidden' }), {
        status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // ─── Modo SEND_TEST: envia mensagem aprovada via Evolution ─────
    if (payload.action === 'send_test') {
      const text = (payload.send_text || '').trim().slice(0, 1500)
      const phoneRaw = (payload.send_to_phone || '').replace(/\D/g, '')
      if (!text) throw new Error('send_text obrigatório')
      if (!phoneRaw || phoneRaw.length < 10) throw new Error('Número inválido')

      // Apenas company_admin/master pode enviar mensagens reais a partir do playground
      // (autorização baseada em user_roles, não em profiles.role)
      const { data: roleRows } = await admin
        .from('user_roles').select('role').eq('user_id', userData.user.id)
        .in('role', ['admin', 'master'])
      if (!roleRows || roleRows.length === 0) {
        return new Response(JSON.stringify({ error: 'Apenas administradores podem enviar do playground' }), {
          status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      // Resolve instância: usa a fornecida ou a primeira conectada da empresa
      let instanceName = payload.instance_name || ''
      if (!instanceName) {
        const { data: inst } = await admin
          .from('whatsapp_instances')
          .select('instance_name')
          .eq('company_id', agent.company_id)
          .eq('status', 'connected')
          .limit(1).maybeSingle()
        instanceName = inst?.instance_name || ''
      } else {
        // valida que a instância pertence à empresa
        const { data: inst } = await admin
          .from('whatsapp_instances')
          .select('instance_name')
          .eq('company_id', agent.company_id)
          .eq('instance_name', instanceName)
          .maybeSingle()
        if (!inst) {
          return new Response(JSON.stringify({ error: 'Instância não pertence à sua empresa' }), {
            status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          })
        }
      }
      if (!instanceName) throw new Error('Nenhuma instância WhatsApp conectada')

      const EVO_URL = normalizeUrl(
        Deno.env.get('EVOLUTION_MASTER_URL') || Deno.env.get('EVOLUTION_API_URL') || ''
      )
      const EVO_KEY = Deno.env.get('EVOLUTION_MASTER_API_KEY') || Deno.env.get('EVOLUTION_API_KEY') || ''
      if (!EVO_URL || !EVO_KEY) throw new Error('Evolution API não configurada')

      // Presence "composing" + delay humanizado
      const typingMs = Math.min(4000, Math.max(800, text.length * 40))
      await fetch(`${EVO_URL}/chat/sendPresence/${instanceName}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', apikey: EVO_KEY },
        body: JSON.stringify({ number: phoneRaw, presence: 'composing', delay: typingMs }),
      }).catch(() => undefined)
      await sleep(typingMs)

      const r = await fetch(`${EVO_URL}/message/sendText/${instanceName}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', apikey: EVO_KEY },
        body: JSON.stringify({ number: phoneRaw, text, delay: 300 }),
      })
      const respText = await r.text()
      if (!r.ok) {
        return new Response(JSON.stringify({
          error: 'Falha no envio', status: r.status, detail: respText.slice(0, 500),
        }), { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
      }

      // Auditoria
      await admin.from('system_logs').insert({
        company_id: agent.company_id,
        level: 'info',
        source: 'ai-agent-playground',
        message: `Envio real de teste para ${phoneRaw} via ${instanceName}`,
        metadata: { agent_id: agent.id, user_id: userData.user.id, text_preview: text.slice(0, 100) },
      }).catch(() => undefined)

      return new Response(JSON.stringify({ sent: true, instance: instanceName, phone: phoneRaw }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // ─── Modo GENERATE (padrão) ────────────────────────────────────
    if (!Array.isArray(payload.history) || payload.history.length === 0) {
      throw new Error('history obrigatório')
    }
    if (payload.history.length > 30) {
      throw new Error('history muito longo (máx 30)')
    }

    // (agent + profile já carregados acima)

    const persona = payload.overrides?.persona ?? agent.persona
    const systemPromptBase = payload.overrides?.system_prompt ?? agent.system_prompt
    const model = payload.overrides?.model ?? agent.model
    const collectFields = (payload.overrides?.collect_fields ?? agent.collect_fields ?? []) as string[]

    // RAG opcional - busca a partir da última mensagem do usuário
    let kbContext = ''
    let kbCitations: any[] = []
    if (payload.use_kb !== false) {
      const lastUser = [...payload.history].reverse().find((m) => m.role === 'user')
      const queryText = (lastUser?.content || '').slice(0, 1000)
      if (queryText && queryText.length > 5) {
        try {
          const embResp = await fetch('https://ai.gateway.lovable.dev/v1/embeddings', {
            method: 'POST',
            headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ model: 'google/text-embedding-004', input: [queryText] }),
          })
          if (embResp.ok) {
            const embJson = await embResp.json()
            const qVec = embJson.data?.[0]?.embedding
            if (Array.isArray(qVec) && qVec.length === 768) {
              // Filtro de docs: payload tem prioridade sobre o do agente
              const overrideDocs = Array.isArray((payload as any).kb_document_ids)
                ? (payload as any).kb_document_ids as string[]
                : null
              const agentDocs = Array.isArray((agent as any).kb_document_ids) && (agent as any).kb_document_ids.length > 0
                ? (agent as any).kb_document_ids
                : null
              const docFilter = overrideDocs !== null
                ? (overrideDocs.length > 0 ? overrideDocs : null)
                : agentDocs
              const { data: matches } = await admin.rpc('match_ai_knowledge', {
                _agent_id: agent.id,
                _query_embedding: qVec,
                _match_count: 4,
                _min_similarity: 0.55,
                _document_ids: docFilter,
              })
              if (matches && matches.length > 0) {
                kbCitations = matches.map((m: any) => ({
                  chunk_id: m.chunk_id,
                  document_id: m.document_id,
                  file_name: m.file_name,
                  similarity: Number((m.similarity ?? 0).toFixed(3)),
                  snippet: String(m.content || '').slice(0, 240),
                }))
                kbContext = `\n\n## Base de conhecimento (use APENAS se relevante)\n${
                  matches.map((m: any, i: number) => `[${i + 1}] (${m.file_name || 'doc'}) ${m.content}`).join('\n\n')
                }`
              }
            }
          }
        } catch (e) {
          console.warn('RAG playground failed', (e as Error)?.message)
        }
      }
    }

    const sysPrompt = `${systemPromptBase}

## Persona
${persona}

## Modo PLAYGROUND
Você está em um ambiente de TESTE. Responda como faria para um cliente real no WhatsApp.

## Campos a coletar (faça 1 pergunta por vez)
${collectFields.join(', ') || '—'}
${kbContext}

## Regras
- Responda em 1-3 mensagens curtas (máx 200 chars cada). Use "\\n\\n" para separá-las.
- Português brasileiro informal mas profissional. Sem emojis em excesso.
- Não use markdown, bullets ou cabeçalhos.
- Se a pergunta puder ser respondida pela base de conhecimento acima, USE EXATAMENTE essa informação.`

    const aiMessages = [
      { role: 'system', content: sysPrompt },
      ...payload.history.map((m) => ({ role: m.role, content: m.content })),
    ]

    const aiResult = await chatCompletion({
      messages: aiMessages,
      modelOverride: model,
    })

    if (aiResult.error === 'rate_limited') {
      return new Response(JSON.stringify({ error: 'rate_limited', message: 'Muitas requisições, aguarde alguns segundos.' }), {
        status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }
    if (aiResult.error === 'no_credits') {
      return new Response(JSON.stringify({ error: 'no_credits', message: 'Créditos de IA esgotados.' }), {
        status: 402, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }
    if (aiResult.error) {
      throw new Error(`AI gateway ${aiResult.status} (${aiResult.provider})`)
    }

    const text = (aiResult.text || '').trim()
    const messages = text.split(/\n{2,}/).map((s: string) => s.trim()).filter(Boolean).slice(0, 4)

    return new Response(JSON.stringify({
      messages,
      raw: text,
      kb_citations: kbCitations,
      model,
      latency_ms: Date.now() - startedAt,
      usage: aiJson.usage || null,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (e: any) {
    console.error('playground error', e)
    return new Response(JSON.stringify({ error: e.message || 'unknown' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
