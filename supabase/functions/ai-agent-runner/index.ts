// Runner do Agente IA de Atendimento
// Chamado pelo trigger ao chegar mensagem do cliente em conversa elegível.
// Auth: x-internal-key === SUPABASE_SERVICE_ROLE_KEY
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { chatCompletion } from '../_shared/ai-router.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-internal-key',
}

const normalizeUrl = (raw: string) => raw.trim().replace(/\/+$/, '')
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

interface Payload {
  conversation_id: string
  trigger_message_id?: string
}

const ECOMMERCE_TOOLS = [
  {
    type: 'function',
    function: {
      name: 'search_products',
      description: 'Busca produtos no catálogo da loja conectada por palavra-chave (nome, categoria, tag). Retorna até 5 resultados com título, preço, estoque e foto.',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Termo de busca (ex: "tênis branco", "presente para mãe")' },
          max_price: { type: 'number' },
        },
        required: ['query'],
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_product',
      description: 'Retorna ficha completa de um produto pelo SKU ou ID externo.',
      parameters: {
        type: 'object',
        properties: { sku: { type: 'string' }, product_id: { type: 'string' } },
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'recommend_upsell',
      description: 'Sugere até 3 produtos complementares ao baseado em SKU.',
      parameters: {
        type: 'object',
        properties: { based_on_sku: { type: 'string' } },
        required: ['based_on_sku'],
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'send_product_image',
      description: 'Envia a foto de um produto para o cliente no WhatsApp com legenda. Use quando recomendar um produto específico.',
      parameters: {
        type: 'object',
        properties: {
          sku: { type: 'string' },
          product_id: { type: 'string' },
          caption: { type: 'string', description: 'Legenda curta (até 200 chars)' },
        },
        required: ['caption'],
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'create_cart',
      description: 'Gera link de checkout/carrinho na loja com os itens informados. Retorna a URL para enviar ao cliente.',
      parameters: {
        type: 'object',
        properties: {
          items: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                sku: { type: 'string' },
                product_id: { type: 'string' },
                quantity: { type: 'number' },
              },
              required: ['quantity'],
              additionalProperties: false,
            },
            minItems: 1, maxItems: 10,
          },
          coupon_code: { type: 'string' },
        },
        required: ['items'],
        additionalProperties: false,
      },
    },
  },
]

const BASE_TOOLS = [
  {
    type: 'function',
    function: {
      name: 'qualify_lead',
      description: 'Atualiza dados coletados do lead (nome, necessidade, orçamento, urgência, etc) e um score 0-100',
      parameters: {
        type: 'object',
        properties: {
          collected_data: { type: 'object', additionalProperties: true, description: 'Campos coletados' },
          score: { type: 'number', description: 'Score 0-100 de qualificação' },
        },
        required: ['collected_data'],
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'transfer_to_human',
      description: 'Encerra a IA e transfere para atendente humano. Use quando o cliente pedir, ficar frustrado, ou quando estiver qualificado.',
      parameters: {
        type: 'object',
        properties: {
          reason: { type: 'string' },
          urgency: { type: 'string', enum: ['low', 'normal', 'high'] },
        },
        required: ['reason'],
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'pause_agent',
      description: 'Pausa a IA por X minutos (ex: cliente disse "depois eu volto")',
      parameters: {
        type: 'object',
        properties: { minutes: { type: 'number' }, reason: { type: 'string' } },
        required: ['minutes'],
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'send_messages',
      description: 'OBRIGATÓRIO: envia uma ou mais mensagens curtas para o cliente. Quebre frases longas em 2-3 mensagens curtas para soar humano.',
      parameters: {
        type: 'object',
        properties: {
          messages: { type: 'array', items: { type: 'string' }, minItems: 1, maxItems: 4 },
        },
        required: ['messages'],
        additionalProperties: false,
      },
    },
  },
]

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
  const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY')

  const internalKey = req.headers.get('x-internal-key') || ''
  if (internalKey !== SERVICE_KEY) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
  if (!LOVABLE_API_KEY) {
    return new Response(JSON.stringify({ error: 'LOVABLE_API_KEY missing' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  const admin = createClient(SUPABASE_URL, SERVICE_KEY)
  const startedAt = Date.now()
  let runId: string | null = null
  let agentId: string | null = null
  let companyId: string | null = null

  try {
    const payload = (await req.json()) as Payload
    if (!payload?.conversation_id) throw new Error('conversation_id obrigatório')

    // 1) Conversa + lead/pipeline
    const { data: conv, error: convErr } = await admin
      .from('conversations')
      .select('id, company_id, phone, instance_name, lead_id')
      .eq('id', payload.conversation_id).maybeSingle()
    if (convErr || !conv) throw new Error('conversation not found')
    companyId = conv.company_id

    // 2) Add-on habilitado?
    const { data: company } = await admin
      .from('companies').select('ai_agent_enabled, ecommerce_enabled, plan_status, name')
      .eq('id', conv.company_id).maybeSingle()
    if (!company?.ai_agent_enabled || !['active', 'trial'].includes(company.plan_status)) {
      return new Response(JSON.stringify({ skipped: 'addon_disabled' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // 2.1) Limites operacionais (governança por empresa)
    {
      const { data: limCheck } = await admin.rpc('check_ai_agent_limits', { _company_id: conv.company_id })
      const lc: any = limCheck || {}
      if (lc.allowed === false && lc.block_when_exceeded !== false) {
        const reason: string = lc.reason || 'limits_exceeded'
        const windowEnd: string | null =
          reason === 'daily_cap' ? lc.window_day_end :
          reason === 'manual_block' ? lc.blocked_until :
          lc.window_month_end

        // Marca/atualiza estado de bloqueio (idempotente)
        await admin.from('ai_agent_limits').upsert({
          company_id: conv.company_id,
          currently_blocked: true,
          blocked_reason: reason,
          blocked_at: new Date().toISOString(),
          blocked_until: windowEnd,
        }, { onConflict: 'company_id' })

        // 2.1.a) Marca conversa como handoff p/ não tentar de novo
        const { data: stCur } = await admin.from('conversation_ai_state')
          .select('id, status, handoff_reason')
          .eq('conversation_id', conv.id).maybeSingle()
        if (stCur) {
          await admin.from('conversation_ai_state').update({
            status: 'handoff', handoff_reason: `limits_exceeded:${reason}`,
          }).eq('id', stCur.id)
        }

        // 2.1.b) Envia mensagem ao cliente UMA vez por janela (controle via blocked_at)
        const sendMsg = lc.send_block_message !== false && !!lc.block_message_to_client
        if (sendMsg) {
          // Verifica se já mandamos algo nesta janela: usa attendance_auto_messages? Não — basta
          // checar se o estado anterior já não estava em handoff por limits_exceeded.
          const alreadyNotified = stCur?.status === 'handoff'
            && (stCur?.handoff_reason || '').startsWith('limits_exceeded:')
          if (!alreadyNotified) {
            try {
              let instanceName = conv.instance_name
              if (!instanceName) {
                const { data: inst } = await admin.from('whatsapp_instances')
                  .select('instance_name').eq('company_id', conv.company_id)
                  .eq('status', 'connected').limit(1).maybeSingle()
                instanceName = inst?.instance_name || null
              }
              if (instanceName) {
                const EVO_URL = normalizeUrl(
                  Deno.env.get('EVOLUTION_MASTER_URL') || Deno.env.get('EVOLUTION_API_URL') || ''
                )
                const EVO_KEY = Deno.env.get('EVOLUTION_MASTER_API_KEY') || Deno.env.get('EVOLUTION_API_KEY') || ''
                await fetch(`${EVO_URL}/message/sendText/${instanceName}`, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json', apikey: EVO_KEY },
                  body: JSON.stringify({
                    number: conv.phone,
                    text: String(lc.block_message_to_client).slice(0, 1500),
                    delay: 300,
                  }),
                }).catch(() => undefined)
              }
            } catch (_) { /* silencioso */ }
          }
        }

        // 2.1.c) Notifica admins por e-mail (idempotente: 1x a cada 24h)
        if (lc.notify_admins_on_block !== false) {
          const { data: limRow } = await admin.from('ai_agent_limits')
            .select('last_block_notified_at').eq('company_id', conv.company_id).maybeSingle()
          const lastNotif = limRow?.last_block_notified_at ? new Date(limRow.last_block_notified_at).getTime() : 0
          if (Date.now() - lastNotif > 24 * 60 * 60 * 1000) {
            const { data: admins } = await admin.from('profiles')
              .select('email').eq('company_id', conv.company_id)
              .in('role', ['admin', 'master']).eq('is_active', true)
            const recipients = (admins || []).map((p: any) => p.email).filter(Boolean) as string[]
            if (recipients.length > 0) {
              const u = lc.usage || {}
              const lim = lc.limits || {}
              const reasonLabel: Record<string, string> = {
                daily_cap: `Limite diário de mensagens (${u.today_msgs}/${lim.daily_message_cap})`,
                monthly_cap: `Limite mensal de mensagens (${u.month_msgs}/${lim.monthly_message_cap})`,
                token_cap: `Limite de tokens/mês (${u.month_tokens}/${lim.monthly_token_cap})`,
                cost_cap: `Teto de custo/mês (R$ ${Number(u.month_cost_brl||0).toFixed(2)} / R$ ${Number(lim.monthly_cost_cap_brl||0).toFixed(2)})`,
                manual_block: 'Bloqueio manual ativo',
              }
              const html = `
                <div style="font-family:system-ui,sans-serif;max-width:560px;margin:0 auto;padding:24px;color:#111">
                  <h2 style="color:#dc2626;margin:0 0 12px">Agente IA bloqueado</h2>
                  <p>Empresa: <strong>${company.name || conv.company_id}</strong></p>
                  <p>Motivo: <strong>${reasonLabel[reason] || reason}</strong></p>
                  <p>O agente parou de responder automaticamente. Conversas em andamento foram marcadas para atendimento humano.</p>
                  <p style="margin-top:16px;font-size:12px;color:#6b7280">Você pode revisar/ajustar os limites nas Configurações &gt; Agente IA &gt; Limites &amp; Bloqueio.</p>
                </div>
              `.trim()
              await fetch(`${SUPABASE_URL}/functions/v1/send-email`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'x-internal-key': SERVICE_KEY },
                body: JSON.stringify({
                  to: recipients,
                  subject: `⛔ Agente IA bloqueado — ${reasonLabel[reason] || reason}`,
                  html, company_id: conv.company_id,
                }),
              }).catch(() => undefined)
              await admin.from('ai_agent_limits').update({
                last_block_notified_at: new Date().toISOString(),
              }).eq('company_id', conv.company_id)
            }
          }
        }

        // 2.1.d) Auditoria mínima
        await admin.from('ai_agent_runs').insert({
          company_id: conv.company_id,
          agent_id: null,
          conversation_id: conv.id,
          status: 'blocked',
          error: `limits_exceeded:${reason}`,
          messages_consumed: 0, cost_brl: 0,
        })

        return new Response(JSON.stringify({ skipped: 'limits_exceeded', reason }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      } else if (lc.allowed === true && lc.currently_blocked) {
        // Janela virou: limpa flag
        await admin.from('ai_agent_limits').update({
          currently_blocked: false, blocked_until: null, blocked_reason: null,
        }).eq('company_id', conv.company_id)
      }
    }

    // Helper: registra skip auditável em ai_agent_runs
    const logSkip = async (reason: string, agentIdForRun: string | null = null) => {
      try {
        await admin.from('ai_agent_runs').insert({
          company_id: conv.company_id,
          agent_id: agentIdForRun,
          conversation_id: conv.id,
          trigger_message_id: payload.trigger_message_id,
          status: 'skipped',
          error: reason,
          latency_ms: Date.now() - startedAt,
        })
      } catch (_) { /* silencioso */ }
    }

    // 3) Resolve agente pela INSTÂNCIA WhatsApp da conversa
    //    a) conversation.instance_name → whatsapp_instances.id → ai_agents.instance_id
    //    b) fallback (config): único agente ativo da empresa
    let agent: any = null
    let instanceId: string | null = null

    if (conv.instance_name) {
      const { data: inst } = await admin
        .from('whatsapp_instances')
        .select('id')
        .eq('company_id', conv.company_id)
        .eq('instance_name', conv.instance_name)
        .maybeSingle()
      instanceId = inst?.id || null
    }

    if (instanceId) {
      const { data } = await admin
        .from('ai_agents').select('*')
        .eq('company_id', conv.company_id)
        .eq('instance_id', instanceId)
        .eq('is_active', true)
        .maybeSingle()
      agent = data || null
    }

    // Fallback: único agente ativo da empresa (controlado por config)
    if (!agent) {
      const { data: limCfg } = await admin
        .from('ai_agent_limits')
        .select('allow_single_agent_fallback')
        .eq('company_id', conv.company_id).maybeSingle()
      const allowFallback = limCfg?.allow_single_agent_fallback ?? true

      if (!allowFallback && !instanceId) {
        await logSkip('no_instance_fallback_disabled')
        return new Response(JSON.stringify({ skipped: 'no_instance_fallback_disabled' }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      if (allowFallback) {
        const { data: activeAgents } = await admin
          .from('ai_agents').select('*')
          .eq('company_id', conv.company_id).eq('is_active', true).limit(2)
        if (activeAgents && activeAgents.length === 1) {
          agent = activeAgents[0]
        } else if (activeAgents && activeAgents.length > 1 && !instanceId) {
          await logSkip('no_instance_multiple_agents')
          return new Response(JSON.stringify({ skipped: 'no_instance_multiple_agents' }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          })
        }
      }
    }

    if (!agent) {
      await logSkip('no_active_agent')
      return new Response(JSON.stringify({ skipped: 'no_active_agent' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }
    agentId = agent.id

    // 3.1) Pause global do agente
    if (agent.paused_until && new Date(agent.paused_until) > new Date()) {
      await logSkip('agent_globally_paused', agent.id)
      return new Response(JSON.stringify({ skipped: 'agent_globally_paused' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // 3.2) Business hours only
    if (agent.business_hours_only) {
      const { data: offHours } = await admin.rpc('is_off_business_hours', { _company_id: conv.company_id })
      if (offHours === true) {
        await logSkip('off_business_hours', agent.id)
        return new Response(JSON.stringify({ skipped: 'off_business_hours' }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }
    }

    // 4) Estado da conversa (cria se não existir)
    let { data: state } = await admin
      .from('conversation_ai_state').select('*').eq('conversation_id', conv.id).maybeSingle()
    if (!state) {
      const { data: created } = await admin.from('conversation_ai_state').insert({
        company_id: conv.company_id, conversation_id: conv.id, agent_id: agent.id,
      }).select('*').single()
      state = created
    } else if (state.agent_id !== agent.id) {
      await admin.from('conversation_ai_state').update({ agent_id: agent.id }).eq('id', state.id)
    }

    // 5) Pré-checks: status, pausa, max_turns, handoff keywords
    if (state.status === 'handoff' || state.status === 'done') {
      return new Response(JSON.stringify({ skipped: `status_${state.status}` }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }
    if (state.status === 'paused' && state.paused_until && new Date(state.paused_until) > new Date()) {
      return new Response(JSON.stringify({ skipped: 'paused' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }
    if (state.turn_count >= agent.max_turns) {
      await admin.from('conversation_ai_state').update({
        status: 'handoff', handoff_reason: 'max_turns_reached',
      }).eq('id', state.id)
      return new Response(JSON.stringify({ skipped: 'max_turns' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // 5.1) BUFFER / DEBOUNCE: agrupa mensagens picadas do cliente
    // Lock leve: apenas a invocação cujo timestamp `lockTs` "vence" segue;
    // as demais detectam pending_since mais novo e abortam silenciosamente.
    const debounceSec = Math.max(0, Math.min(60, (agent as any).debounce_seconds ?? 8))
    if (debounceSec > 0) {
      const nowIso = new Date().toISOString()
      // Define este worker como dono do buffer; se outro já tinha iniciado,
      // mantemos o pending_since original (lock vigente) e abortamos.
      const lockTs = nowIso
      await admin.from('conversation_ai_state').update({
        pending_since: state.pending_since || lockTs,
        last_inbound_at: state.last_inbound_at || lockTs,
      }).eq('id', state.id)

      // Re-lê para saber quem é o dono do buffer
      const { data: refreshed } = await admin
        .from('conversation_ai_state')
        .select('pending_since, last_inbound_at, last_run_at, last_processed_message_id')
        .eq('id', state.id).maybeSingle()

      const ownerTs = refreshed?.pending_since
      // Se o lock atual não é meu E foi setado nos últimos `debounceSec*2` segundos,
      // outro worker está processando; encerro silenciosamente.
      if (ownerTs && ownerTs !== lockTs && state.pending_since) {
        const ownerAge = Date.now() - new Date(ownerTs).getTime()
        if (ownerAge < (debounceSec * 2 * 1000)) {
          return new Response(JSON.stringify({ skipped: 'buffered' }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          })
        }
      }

      // Loop de espera: dorme em pedaços de 1s e reinicia se chegar nova mensagem
      const startWait = Date.now()
      let lastSeen = refreshed?.last_inbound_at || lockTs
      const maxWaitMs = debounceSec * 1000
      // dorme até `debounceSec` desde a última mensagem vista
      // (até no máximo 2x debounceSec no total, como guard rail)
      const hardCap = Date.now() + (debounceSec * 2 * 1000)
      while (Date.now() < hardCap) {
        const sinceLast = Date.now() - new Date(lastSeen).getTime()
        if (sinceLast >= maxWaitMs) break
        const remain = Math.max(500, Math.min(1500, maxWaitMs - sinceLast))
        await sleep(remain)
        const { data: tick } = await admin
          .from('conversation_ai_state')
          .select('last_inbound_at, last_processed_message_id')
          .eq('id', state.id).maybeSingle()
        if (tick?.last_inbound_at && tick.last_inbound_at !== lastSeen) {
          lastSeen = tick.last_inbound_at
        }
      }

      // Verifica se outra resposta foi processada enquanto esperávamos
      const { data: postWait } = await admin
        .from('conversation_ai_state')
        .select('last_processed_message_id, last_run_at')
        .eq('id', state.id).maybeSingle()
      // Carrega a última mensagem inbound atual
      const { data: lastInbound } = await admin
        .from('chat_messages')
        .select('id')
        .eq('conversation_id', conv.id).eq('from_me', false)
        .order('timestamp', { ascending: false }).limit(1).maybeSingle()
      if (postWait?.last_processed_message_id && lastInbound?.id &&
          postWait.last_processed_message_id === lastInbound.id) {
        // já foi respondida por outro worker; libera lock e sai
        await admin.from('conversation_ai_state').update({ pending_since: null }).eq('id', state.id)
        return new Response(JSON.stringify({ skipped: 'superseded' }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }
      console.log(`[buffer] waited ${Date.now() - startWait}ms before responding`)
    }

    // 6) Carrega últimas 20 mensagens
    const { data: msgsRaw } = await admin
      .from('chat_messages')
      .select('id, from_me, content, message_type, timestamp, media_url, media_storage_path, media_mimetype')
      .eq('conversation_id', conv.id)
      .order('timestamp', { ascending: true })
      .limit(20)
    let msgs = msgsRaw || []

    // 6.1) Transcrever áudio recebido (última msg do cliente, se for audio sem content)
    let hadAudio = false
    const lastRaw = msgs[msgs.length - 1]
    if (lastRaw && !lastRaw.from_me && lastRaw.message_type === 'audio' && !lastRaw.content) {
      try {
        let audioUrl: string | null = lastRaw.media_url
        if (lastRaw.media_storage_path) {
          const { data: signed } = await admin.storage.from('chat-media')
            .createSignedUrl(lastRaw.media_storage_path, 300)
          audioUrl = signed?.signedUrl || audioUrl
        }
        if (audioUrl) {
          const audioFetch = await fetch(audioUrl)
          if (audioFetch.ok) {
            const buf = await audioFetch.arrayBuffer()
            const b64 = btoa(String.fromCharCode(...new Uint8Array(buf)))
            const mime = lastRaw.media_mimetype || 'audio/ogg'
            const trResp = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
              method: 'POST',
              headers: {
                Authorization: `Bearer ${LOVABLE_API_KEY}`,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                model: 'google/gemini-2.5-flash',
                messages: [{
                  role: 'user',
                  content: [
                    { type: 'text', text: 'Transcreva este áudio em português brasileiro. Retorne APENAS o texto transcrito, sem comentários.' },
                    { type: 'input_audio', input_audio: { data: b64, format: mime.includes('mp3') ? 'mp3' : 'ogg' } },
                  ],
                }],
              }),
            })
            if (trResp.ok) {
              const trJson = await trResp.json()
              const transcript = trJson.choices?.[0]?.message?.content?.trim()
              if (transcript) {
                hadAudio = true
                lastRaw.content = `[áudio transcrito] ${transcript}`
                // persiste transcrição
                await admin.from('chat_messages').update({ content: lastRaw.content }).eq('id', lastRaw.id)
              }
            }
          }
        }
      } catch (e) {
        console.warn('audio transcribe failed', e)
      }
    }

    const lastMsg = msgs[msgs.length - 1]
    const lastUserText = (lastMsg && !lastMsg.from_me) ? (lastMsg.content || '').toLowerCase() : ''

    // Handoff por palavra-chave
    const kw = (agent.handoff_keywords || []) as string[]
    if (kw.some((k) => lastUserText.includes(k.toLowerCase()))) {
      await admin.from('conversation_ai_state').update({
        status: 'handoff', handoff_reason: 'user_requested_human',
      }).eq('id', state.id)
      // Cria run log
      await admin.from('ai_agent_runs').insert({
        company_id: conv.company_id, agent_id: agent.id, conversation_id: conv.id,
        trigger_message_id: payload.trigger_message_id, status: 'done',
        output_text: '[handoff por palavra-chave]', model: agent.model,
        latency_ms: Date.now() - startedAt,
      })
      return new Response(JSON.stringify({ handoff: 'keyword' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Detecção de humano respondendo (última msg from_me sem ser do agente)
    // Se houver from_me recente que NÃO veio da IA, pausa por 4h
    const { data: recentAgentMsg } = await admin
      .from('chat_messages').select('id, from_me, sender_name, timestamp')
      .eq('conversation_id', conv.id)
      .eq('from_me', true)
      .order('timestamp', { ascending: false }).limit(1).maybeSingle()
    if (recentAgentMsg?.sender_name && recentAgentMsg.sender_name !== `🤖 ${agent.name}`) {
      const ts = new Date(recentAgentMsg.timestamp).getTime()
      if (Date.now() - ts < 4 * 3600 * 1000) {
        const until = new Date(Date.now() + 4 * 3600 * 1000).toISOString()
        await admin.from('conversation_ai_state').update({
          status: 'paused', paused_until: until, handoff_reason: 'human_took_over',
        }).eq('id', state.id)
        return new Response(JSON.stringify({ skipped: 'human_active' }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }
    }

    // 7) Cria run pendente
    const { data: runRow } = await admin.from('ai_agent_runs').insert({
      company_id: conv.company_id, agent_id: agent.id, conversation_id: conv.id,
      trigger_message_id: payload.trigger_message_id, status: 'running', model: agent.model,
    }).select('id').single()
    runId = runRow?.id || null

    // 8) RAG: busca trechos relevantes da base de conhecimento do agente
    let kbContext = ''
    let kbCitations: any[] = []
    try {
      const queryText = (lastUserText || lastMsg?.content || '').slice(0, 1000)
      if (queryText && queryText.length > 5) {
        const embResp = await fetch('https://ai.gateway.lovable.dev/v1/embeddings', {
          method: 'POST',
          headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ model: 'google/text-embedding-004', input: [queryText] }),
        })
        if (embResp.ok) {
          const embJson = await embResp.json()
          const qVec = embJson.data?.[0]?.embedding
          if (Array.isArray(qVec) && qVec.length === 768) {
            const docFilter = Array.isArray((agent as any).kb_document_ids) && (agent as any).kb_document_ids.length > 0
              ? (agent as any).kb_document_ids
              : null
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
      }
    } catch (e) {
      console.warn('RAG lookup failed', (e as Error)?.message)
    }

    // 8.5) E-commerce: detecta loja conectada
    let storeIntegration: any = null
    let storeContext = ''
    if (company.ecommerce_enabled) {
      const { data: integ } = await admin.from('store_integrations')
        .select('id, provider, store_url, currency, status, product_count, display_name')
        .eq('company_id', conv.company_id).maybeSingle()
      if (integ && integ.status === 'active') {
        storeIntegration = integ
        storeContext = `\n\n## Loja conectada: ${integ.display_name} (${integ.provider})\nVocê tem acesso ao catálogo via tools (search_products, get_product, recommend_upsell, send_product_image, create_cart). Quando o cliente demonstrar interesse em comprar, busque produtos, envie a foto com send_product_image, e ao fechar a compra gere um link com create_cart.`
      }
    }

    // Resolve instância (usada para envio de mensagens E imagens)
    let instanceName = conv.instance_name
    if (!instanceName) {
      const { data: inst } = await admin
        .from('whatsapp_instances').select('instance_name')
        .eq('company_id', conv.company_id).eq('status', 'connected').limit(1).maybeSingle()
      instanceName = inst?.instance_name || null
    }
    const EVO_URL = normalizeUrl(
      Deno.env.get('EVOLUTION_MASTER_URL') || Deno.env.get('EVOLUTION_API_URL') || ''
    )
    const EVO_KEY = Deno.env.get('EVOLUTION_MASTER_API_KEY') || Deno.env.get('EVOLUTION_API_KEY') || ''

    // Helper: envia foto via Evolution
    const sendProductImage = async (imageUrl: string, caption: string) => {
      if (!instanceName || !EVO_URL || !EVO_KEY || !imageUrl) return false
      try {
        const r = await fetch(`${EVO_URL}/message/sendMedia/${instanceName}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', apikey: EVO_KEY },
          body: JSON.stringify({
            number: conv.phone,
            mediatype: 'image',
            media: imageUrl,
            caption: (caption || '').slice(0, 800),
            delay: 600,
          }),
        })
        if (r.ok) {
          const j = await r.clone().json().catch(() => ({} as any))
          await admin.from('chat_messages').upsert({
            company_id: conv.company_id, conversation_id: conv.id,
            remote_jid: `${conv.phone}@s.whatsapp.net`,
            message_id: j?.key?.id || `ai-img-${conv.id}-${Date.now()}`,
            from_me: true, message_type: 'image',
            content: caption || '', media_url: imageUrl,
            status: 'sent', sender_name: `🤖 ${agent.name}`,
            timestamp: new Date().toISOString(),
          }, { onConflict: 'company_id,message_id' }).catch(() => undefined)
          return true
        }
      } catch (_) {}
      return false
    }

    // 9) Monta prompt
    const collected = state.collected_data || {}
    const collectFields = (agent.collect_fields || []) as string[]
    const sysPrompt = `${agent.system_prompt}

## Persona
${agent.persona}

## Dados já coletados
${JSON.stringify(collected, null, 2)}

## Campos a coletar (faça 1 pergunta por vez, na ordem)
${collectFields.join(', ')}
${kbContext}${storeContext}

## Regras
- SEMPRE chame a tool send_messages para responder. Nunca responda em texto solto.
- Quebre respostas em 1-3 mensagens curtas (máx 200 chars cada) para parecer humano.
- Use português brasileiro informal mas profissional. Sem emojis em excesso.
- A cada nova info coletada, chame qualify_lead com collected_data atualizado.
- Se o cliente pedir humano, demonstrar frustração ou estiver totalmente qualificado, chame transfer_to_human.
- Se ele disser que volta depois, chame pause_agent.
- Se a pergunta puder ser respondida pela base de conhecimento, USE EXATAMENTE essa informação. Nunca invente.
- NÃO use markdown, NÃO use bullets, NÃO use cabeçalhos.`

    const TOOLS = storeIntegration ? [...BASE_TOOLS, ...ECOMMERCE_TOOLS] : BASE_TOOLS

    const aiMessages: any[] = [
      { role: 'system', content: sysPrompt },
      ...(msgs || []).map((m) => ({
        role: m.from_me ? 'assistant' : 'user',
        content: m.content || `[${m.message_type}]`,
      })),
    ]

    // 9) Loop de tool-use (até 3 iterações para tools informacionais de e-commerce)
    let messagesToSend: string[] = []
    let didTransfer = false
    let didPause = false
    const toolsLog: any[] = []
    let aiResult: any = null
    let aiJson: any = null
    let lastCartUrl: string | null = null

    for (let iter = 0; iter < 3; iter++) {
      aiResult = await chatCompletion({
        messages: aiMessages, tools: TOOLS, tool_choice: 'auto', modelOverride: agent.model,
      })
      if (aiResult.error === 'rate_limited' || aiResult.error === 'no_credits') {
        await admin.from('ai_agent_runs').update({
          status: 'error', error: aiResult.error, latency_ms: Date.now() - startedAt,
        }).eq('id', runId!)
        return new Response(JSON.stringify({ error: aiResult.error }), {
          status: aiResult.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }
      if (aiResult.error) throw new Error(`AI gateway ${aiResult.status} (${aiResult.provider})`)
      aiJson = aiResult.raw

      const tcs = aiResult.toolCalls || []
      if (tcs.length === 0) break

      // Adiciona resposta do assistente (tool_calls) ao histórico para próxima iteração
      aiMessages.push({
        role: 'assistant',
        content: '',
        tool_calls: tcs.map((tc: any) => ({
          id: tc.id || `tc_${iter}_${tc.name}`,
          type: 'function',
          function: { name: tc.name, arguments: JSON.stringify(tc.arguments || {}) },
        })),
      })

      let needsAnotherTurn = false
      for (const tc of tcs) {
        const fname = tc.name
        const args = tc.arguments || {}
        const tcId = tc.id || `tc_${iter}_${fname}`
        toolsLog.push({ name: fname, args })

        let toolResult: any = { ok: true }

        if (fname === 'send_messages' && Array.isArray(args.messages)) {
          messagesToSend.push(...args.messages.filter((m: any) => typeof m === 'string'))
        } else if (fname === 'qualify_lead') {
          const merged = { ...collected, ...(args.collected_data || {}) }
          await admin.from('conversation_ai_state').update({ collected_data: merged }).eq('id', state.id)
          if (conv.lead_id) {
            const upd: any = {}
            if (merged.nome && typeof merged.nome === 'string') upd.name = merged.nome
            if (merged.email) upd.email = merged.email
            if (Object.keys(upd).length > 0) await admin.from('leads').update(upd).eq('id', conv.lead_id)
          }
        } else if (fname === 'transfer_to_human') {
          didTransfer = true
          await admin.from('conversation_ai_state').update({
            status: 'handoff', handoff_reason: args.reason || 'agent_decision',
          }).eq('id', state.id)
          if (conv.lead_id && agent.transfer_stage_id) {
            await admin.from('leads').update({ stage_id: agent.transfer_stage_id }).eq('id', conv.lead_id)
          }
        } else if (fname === 'pause_agent') {
          didPause = true
          const mins = Math.max(1, Math.min(1440, Number(args.minutes) || 60))
          const until = new Date(Date.now() + mins * 60 * 1000).toISOString()
          await admin.from('conversation_ai_state').update({
            status: 'paused', paused_until: until, handoff_reason: args.reason || null,
          }).eq('id', state.id)
        } else if (fname === 'search_products' && storeIntegration) {
          const q = String(args.query || '').slice(0, 200)
          let query = admin.from('store_products')
            .select('external_id, variant_id, sku, title, description, price, stock, image_url, product_url')
            .eq('company_id', conv.company_id).eq('is_active', true).limit(5)
          if (args.max_price) query = query.lte('price', Number(args.max_price))
          if (q) query = query.textSearch('search_tsv', q.split(/\s+/).join(' | '), { config: 'portuguese' })
          const { data: prods } = await query
          toolResult = { products: prods || [] }
          needsAnotherTurn = true
        } else if (fname === 'get_product' && storeIntegration) {
          let q = admin.from('store_products')
            .select('external_id, variant_id, sku, title, description, price, stock, image_url, product_url, tags, categories')
            .eq('company_id', conv.company_id).limit(1)
          if (args.sku) q = q.eq('sku', String(args.sku))
          else if (args.product_id) q = q.eq('external_id', String(args.product_id))
          const { data: p } = await q.maybeSingle()
          toolResult = { product: p || null }
          needsAnotherTurn = true
        } else if (fname === 'recommend_upsell' && storeIntegration) {
          const { data: base } = await admin.from('store_products')
            .select('tags, categories').eq('company_id', conv.company_id)
            .eq('sku', String(args.based_on_sku)).maybeSingle()
          let q = admin.from('store_products')
            .select('sku, title, price, image_url').eq('company_id', conv.company_id)
            .eq('is_active', true).neq('sku', String(args.based_on_sku)).limit(3)
          if (base?.categories?.length) q = q.overlaps('categories', base.categories)
          const { data: recs } = await q
          toolResult = { recommendations: recs || [] }
          needsAnotherTurn = true
        } else if (fname === 'send_product_image' && storeIntegration) {
          let q = admin.from('store_products').select('image_url, title')
            .eq('company_id', conv.company_id).limit(1)
          if (args.sku) q = q.eq('sku', String(args.sku))
          else if (args.product_id) q = q.eq('external_id', String(args.product_id))
          const { data: p } = await q.maybeSingle()
          if (p?.image_url) {
            const ok = await sendProductImage(p.image_url, args.caption || p.title || '')
            toolResult = { sent: ok }
          } else {
            toolResult = { sent: false, error: 'no_image' }
          }
        } else if (fname === 'create_cart' && storeIntegration) {
          try {
            const r = await fetch(`${SUPABASE_URL}/functions/v1/store-cart-create`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', 'x-internal-key': SERVICE_KEY },
              body: JSON.stringify({
                company_id: conv.company_id,
                conversation_id: conv.id,
                lead_id: conv.lead_id,
                items: args.items,
                coupon_code: args.coupon_code,
              }),
            })
            const j = await r.json().catch(() => ({}))
            if (r.ok && j.checkout_url) {
              lastCartUrl = j.checkout_url
              toolResult = { ok: true, checkout_url: j.checkout_url, total: j.total, currency: j.currency, coupon_applied: j.coupon_applied }
            } else {
              toolResult = { ok: false, error: j.error || 'cart_failed' }
            }
          } catch (e) {
            toolResult = { ok: false, error: (e as Error).message }
          }
          needsAnotherTurn = true
        }

        // Adiciona tool_result ao histórico
        aiMessages.push({
          role: 'tool',
          tool_call_id: tcId,
          name: fname,
          content: JSON.stringify(toolResult).slice(0, 4000),
        })
      }

      // Se já temos mensagens para enviar e nenhuma tool informacional foi chamada, encerra
      if (!needsAnotherTurn) break
    }

    // 10) Envia mensagens via Evolution (humanizado)
    let sentCount = 0
    // Garantia: se gerou carrinho mas a IA esqueceu o link, anexa
    if (lastCartUrl && !messagesToSend.some((m) => m.includes(lastCartUrl!))) {
      messagesToSend.push(`Aqui está seu carrinho: ${lastCartUrl}`)
    }
    if (messagesToSend.length > 0) {
      if (instanceName && EVO_URL && EVO_KEY) {

        for (let i = 0; i < messagesToSend.length; i++) {
          const text = messagesToSend[i].slice(0, 1500)
          // delay proporcional ao tamanho (40ms/char, min 800, max 4000) + base config
          const typingMs = Math.min(4000, Math.max(800, text.length * 40)) + (agent.response_delay_ms || 0)
          // Presence "composing"
          await fetch(`${EVO_URL}/chat/sendPresence/${instanceName}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', apikey: EVO_KEY },
            body: JSON.stringify({ number: conv.phone, presence: 'composing', delay: typingMs }),
          }).catch(() => undefined)
          await sleep(typingMs)

          const r = await fetch(`${EVO_URL}/message/sendText/${instanceName}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', apikey: EVO_KEY },
            body: JSON.stringify({ number: conv.phone, text, delay: 300 }),
          })
          // Persiste sempre (sucesso OU falha) para que o /chat reflita em tempo real
          // o status da mensagem da IA (sent/failed) via realtime de chat_messages.
          try {
            const sentJson = r.ok ? await r.clone().json().catch(() => ({} as any)) : null
            const messageId = sentJson?.key?.id || `ai-${conv.id}-${Date.now()}-${i}`
            const persistedStatus = r.ok ? 'sent' : 'failed'
            await admin.from('chat_messages').upsert({
              company_id: conv.company_id,
              conversation_id: conv.id,
              remote_jid: `${conv.phone}@s.whatsapp.net`,
              message_id: messageId,
              from_me: true,
              message_type: 'text',
              content: text,
              status: persistedStatus,
              sender_name: `🤖 ${agent.name}`,
              timestamp: new Date().toISOString(),
            }, { onConflict: 'company_id,message_id' })
            if (r.ok) {
              sentCount++
              await admin.from('conversations').update({
                last_message_text: text.substring(0, 200),
                last_message_at: new Date().toISOString(),
              }).eq('id', conv.id)
            } else {
              const errBody = await r.text().catch(() => '')
              await admin.from('system_logs').insert({
                company_id: conv.company_id,
                level: 'error',
                source: 'ai-agent-runner',
                event_type: 'ai_send_failed',
                message: `Evolution sendText falhou: ${r.status}`,
                metadata: { conversation_id: conv.id, http_status: r.status, body: errBody.slice(0, 500) },
              }).catch(() => undefined)
            }
          } catch (_) { /* silencioso */ }
          if (i < messagesToSend.length - 1) await sleep(600)
        }
      }
    }

    // 11) Incrementa turn + libera buffer + marca última msg processada
    const lastInboundMsg = [...msgs].reverse().find((m) => !m.from_me)
    await admin.from('conversation_ai_state').update({
      turn_count: state.turn_count + 1,
      last_run_at: new Date().toISOString(),
      pending_since: null,
      last_processed_message_id: lastInboundMsg?.id || null,
    }).eq('id', state.id)

    // Custo estimado: input ~$0.075/1M, output ~$0.30/1M (Gemini Flash). Convertido para BRL ~5.5
    const tokIn = aiJson.usage?.prompt_tokens || 0
    const tokOut = aiJson.usage?.completion_tokens || 0
    const costUsd = (tokIn * 0.075 + tokOut * 0.30) / 1_000_000
    const costBrl = costUsd * 5.5

    await admin.from('ai_agent_runs').update({
      status: 'done',
      output_text: messagesToSend.join('\n---\n').slice(0, 4000),
      tools_called: toolsLog,
      kb_citations: kbCitations,
      tokens_in: tokIn,
      tokens_out: tokOut,
      latency_ms: Date.now() - startedAt,
      messages_consumed: messagesToSend.length,
      cost_brl: Number(costBrl.toFixed(4)),
      had_audio: hadAudio,
    }).eq('id', runId!)

    return new Response(JSON.stringify({
      success: true, sent: sentCount, transfer: didTransfer, paused: didPause,
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  } catch (e: any) {
    console.error('ai-agent-runner error', e?.message)
    if (runId) {
      await admin.from('ai_agent_runs').update({
        status: 'error', error: String(e?.message || e).slice(0, 1000),
        latency_ms: Date.now() - startedAt,
      }).eq('id', runId)
    }
    // Libera lock do buffer em erro pra não travar próximas mensagens
    try {
      const body = await req.clone().json().catch(() => ({} as any))
      if (body?.conversation_id) {
        await admin.from('conversation_ai_state')
          .update({ pending_since: null })
          .eq('conversation_id', body.conversation_id)
      }
    } catch {}
    return new Response(JSON.stringify({ error: e?.message || 'Erro' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
