import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { provGate, gateBlockedResponse } from '../_shared/provider-gate.ts'

const RATE_LIMITED_ACTIONS = new Set(['sendText','sendMedia','sendAudio','sendReaction','sendPresence'])

/**
 * Garante que o JID enviado à Baileys/Evolution tenha sufixo de servidor.
 * Conversas no DB às vezes armazenam apenas o número puro (ex.: "5531999999999"),
 * o que faz `jidDecode()` retornar undefined e quebra deleteMessage/editMessage/sendReaction.
 */
function normalizeJid(input: unknown): string {
  const s = String(input ?? '').trim()
  if (!s) return s
  if (s.includes('@')) return s
  // Grupos têm 18+ dígitos com hífen, individuais são só dígitos
  if (/^\d+-\d+$/.test(s)) return `${s}@g.us`
  return `${s}@s.whatsapp.net`
}

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
}

// Eventos do webhook que devem ficar ativos para qualquer instância de empresa.
// Lista exata espelhando a configuração padrão acordada no painel da Evolution Master.
const WEBHOOK_EVENTS = [
  'CONNECTION_UPDATE',
  'CONTACTS_UPSERT',
  'GROUP_UPDATE',
  'GROUPS_UPSERT',
  'MESSAGES_DELETE',
  'MESSAGES_SET',
  'MESSAGES_UPDATE',
  'MESSAGES_UPSERT',
  'PRESENCE_UPDATE',
  'QRCODE_UPDATED',
  'SEND_MESSAGE',
] as const

const getWebhookSecret = () =>
  Deno.env.get('EVOLUTION_WEBHOOK_SECRET') ||
  Deno.env.get('EVOLUTION_MASTER_API_KEY') ||
  ''

const buildWebhookPayload = (webhookUrl: string) => ({
  webhook: {
    enabled: true,
    url: webhookUrl,
    webhookByEvents: false,
    webhookBase64: false,
    // CRITICAL: send our auth header back so evolution-webhook accepts the callback.
    // Without this, every callback hits 401 "apikey inválida" and no messages sync.
    headers: {
      apikey: getWebhookSecret(),
      'Content-Type': 'application/json',
    },
    events: [...WEBHOOK_EVENTS],
  },
})

const defaultWebhookUrl = () =>
  `${(Deno.env.get('SUPABASE_URL') || '').replace(/\/+$/, '')}/functions/v1/evolution-webhook`

const applyWebhook = async (
  evolutionUrl: string,
  headers: Record<string, string>,
  instanceName: string,
  webhookUrl: string,
) => {
  const setUrl = `${evolutionUrl}/webhook/set/${instanceName}`
  console.log('Evolution setWebhook request', { url: setUrl, instance: instanceName })
  const res = await fetch(setUrl, {
    method: 'POST',
    headers,
    body: JSON.stringify(buildWebhookPayload(webhookUrl)),
  })
  const text = await res.text()
  console.log('Evolution setWebhook response', { instance: instanceName, status: res.status })
  if (!res.ok) {
    console.error('Webhook set failed:', text.substring(0, 200))
  }
  return { ok: res.ok, status: res.status, body: text }
}

const normalizeEvolutionUrl = (raw: string) => {
  const trimmed = raw.trim().replace(/\/+$/, '')
  if (!trimmed) return ''
  return trimmed.startsWith('http') ? trimmed : `https://${trimmed}`
}

const buildEvolutionBaseCandidates = (configuredUrl: string) => {
  if (!configuredUrl) return [] as string[]

  const candidates: string[] = []

  try {
    const parsed = new URL(configuredUrl)
    if (parsed.hostname.startsWith('easypanel.')) {
      const apiUrl = new URL(configuredUrl)
      apiUrl.hostname = parsed.hostname.replace(/^easypanel\./, 'evoapi.')
      candidates.push(apiUrl.toString().replace(/\/+$/, ''))
    }
  } catch {
    // ignore invalid URL here; validation happens later
  }

  candidates.push(configuredUrl)
  return [...new Set(candidates)]
}

const shouldRetryEvolutionResponse = (response: Response, bodyText: string) => {
  const contentType = response.headers.get('content-type') || ''
  const looksLikeHtml = contentType.includes('text/html') || /^\s*<!doctype html/i.test(bodyText) || /^\s*<html/i.test(bodyText)
  return response.status === 404 || (response.ok && looksLikeHtml)
}

const probeEvolutionBase = async (baseUrl: string, headers: Record<string, string>) => {
  const response = await fetch(`${baseUrl}/instance/fetchInstances`, {
    method: 'GET',
    headers,
    signal: AbortSignal.timeout(8000),
  })

  const bodyText = await response.text()
  const contentType = response.headers.get('content-type') || ''
  const looksLikeHtml = contentType.includes('text/html') || /^\s*<!doctype html/i.test(bodyText) || /^\s*<html/i.test(bodyText)

  if (looksLikeHtml) {
    return {
      ok: false,
      status: response.status,
      contentType,
      error: 'Host respondeu HTML/painel em vez da API',
    }
  }

  try {
    JSON.parse(bodyText)
    return {
      ok: response.ok,
      status: response.status,
      contentType,
      error: response.ok ? undefined : bodyText.substring(0, 200),
    }
  } catch {
    return {
      ok: false,
      status: response.status,
      contentType,
      error: 'Host respondeu conteúdo não-JSON',
    }
  }
}

const resolveEvolutionBase = async (candidates: string[], headers: Record<string, string>) => {
  let lastProbe: { ok: boolean; status: number; contentType?: string; error?: string } | null = null

  for (const candidate of candidates) {
    try {
      const probe = await probeEvolutionBase(candidate, headers)
      if (probe.ok) {
        return { baseUrl: candidate, probe }
      }
      lastProbe = probe
    } catch (error) {
      lastProbe = { ok: false, status: 0, error: String(error) }
    }
  }

  return { baseUrl: candidates[0] || '', probe: lastProbe }
}

const parseJsonSafely = (value: string) => {
  try {
    return JSON.parse(value)
  } catch {
    return null
  }
}

const unwrapEvolutionPayload = (payload: unknown) => {
  if (typeof payload !== 'string') {
    return payload
  }

  const trimmed = payload.trim()
  if (!trimmed) {
    return payload
  }

  const parsed = parseJsonSafely(trimmed)
  if (parsed === null) {
    return payload
  }

  return typeof parsed === 'string' ? unwrapEvolutionPayload(parsed) : parsed
}

const DEBUG = Deno.env.get('EVOLUTION_DEBUG') === 'true'

const ensureWebhookConfigured = async (baseUrl: string, headers: Record<string, string>, instanceName: string) => {
  if (!baseUrl || !instanceName) return
  const webhookUrl = defaultWebhookUrl()
  if (!webhookUrl) return
  try {
    await applyWebhook(baseUrl, headers, instanceName, webhookUrl)
  } catch (error) {
    console.warn('Webhook ensure failed:', error)
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    // Auth check
    const authHeader = req.headers.get('Authorization')
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: 'Não autorizado' }), { status: 401, headers: corsHeaders })
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } }
    )

    const token = authHeader.replace('Bearer ', '')
    const { data: userData, error: userError } = await supabase.auth.getUser(token)
    if (userError || !userData?.user?.id) {
      console.error('[evolution-proxy] auth failed:', userError?.message)
      return new Response(
        JSON.stringify({ error: 'Sessão expirada. Faça login novamente.' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const userId = userData.user.id

    // Get user company to validate access
    const { data: profile } = await supabase
      .from('profiles')
      .select('company_id')
      .eq('id', userId)
      .single()

    if (!profile?.company_id) {
      return new Response(JSON.stringify({ error: 'Usuário sem empresa' }), { status: 403, headers: corsHeaders })
    }

    const body = await req.json()
    const { action, params } = body as {
      action: string
      params: Record<string, unknown>
    }

    // Prioriza Evolution Master (configurada na tela Admin → Integrações).
    // Mantém fallback para EVOLUTION_API_URL/KEY enquanto instâncias antigas ainda existem.
    const evolutionUrlRaw =
      Deno.env.get('EVOLUTION_MASTER_URL') ||
      Deno.env.get('EVOLUTION_API_URL') ||
      ''
    const configuredEvolutionUrl = normalizeEvolutionUrl(evolutionUrlRaw)
    const EVOLUTION_KEY =
      Deno.env.get('EVOLUTION_MASTER_API_KEY') ||
      Deno.env.get('EVOLUTION_API_KEY') ||
      ''
    const evolutionBaseCandidates = buildEvolutionBaseCandidates(configuredEvolutionUrl)
    let EVOLUTION_URL = evolutionBaseCandidates[0] || ''
    let INSTANCE = (params?.instanceName as string) || ''
    const instanceScopedActions = new Set([
      'sendText', 'sendMedia', 'sendAudio', 'sendReaction', 'deleteMessage', 'editMessage', 'markAsRead',
      'findMessages', 'findChats', 'findContacts', 'sendPresence', 'subscribePresence', 'checkNumber',
      'fetchProfilePicture', 'fetchProfile', 'connectInstance', 'connectionState',
      'restartInstance', 'logoutInstance', 'deleteInstance', 'getBase64FromMediaMessage', 'downloadMedia',
    ])
    const isInstanceScopedAction = instanceScopedActions.has(action)

    const serviceClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    // Nunca deixe uma instância Cloud API cair no proxy Evolution. O Phone Number ID
    // da Meta parece um instanceName válido, mas a Evolution responde 404.
    if (INSTANCE && profile?.company_id && isInstanceScopedAction) {
      const { data: explicitInst } = await serviceClient
        .from('whatsapp_instances')
        .select('provider')
        .eq('company_id', profile.company_id)
        .eq('instance_name', INSTANCE)
        .maybeSingle()
      if (explicitInst?.provider && explicitInst.provider !== 'evolution') {
        // No-op idempotente: a instância pertence a outro provider (Cloud API).
        // Devolvemos 200 com skipped=true para não estourar erro no frontend.
        return new Response(
          JSON.stringify({
            skipped: true,
            reason: 'non_evolution_instance',
            provider: explicitInst.provider,
          }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }
    }

    // If no instanceName provided, resolve only from Evolution instances.
    if (!INSTANCE && profile?.company_id) {
      const { data: inst } = await serviceClient
        .from('whatsapp_instances')
        .select('instance_name')
        .eq('company_id', profile.company_id)
        .eq('provider', 'evolution')
        .eq('status', 'connected')
        .limit(1)
        .maybeSingle()
      if (inst) {
        INSTANCE = inst.instance_name
      } else {
        // Fallback: get any Evolution instance for this company
        const { data: anyInst } = await serviceClient
          .from('whatsapp_instances')
          .select('instance_name')
          .eq('company_id', profile.company_id)
          .eq('provider', 'evolution')
          .limit(1)
          .maybeSingle()
        if (anyInst) INSTANCE = anyInst.instance_name
      }
    }

    if (!INSTANCE && profile?.company_id && isInstanceScopedAction) {
      return new Response(
        JSON.stringify({ error: 'Nenhuma instância Evolution ativa encontrada para esta ação.' }),
        { status: 400, headers: corsHeaders }
      )
    }

    if (!configuredEvolutionUrl) {
      return new Response(
        JSON.stringify({ error: 'Evolution Master URL não configurada (EVOLUTION_MASTER_URL ausente)' }),
        { status: 500, headers: corsHeaders }
      )
    }

    if (!EVOLUTION_KEY) {
      return new Response(
        JSON.stringify({ error: 'Evolution Master API Key não configurada (EVOLUTION_MASTER_API_KEY ausente)' }),
        { status: 500, headers: corsHeaders }
      )
    }

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'apikey': EVOLUTION_KEY,
    }

    const resolvedEvolution = await resolveEvolutionBase(evolutionBaseCandidates, headers)
    if (resolvedEvolution.baseUrl) {
      EVOLUTION_URL = resolvedEvolution.baseUrl
    }

    const targetInstanceName = String((params?.instanceName as string) || INSTANCE || '')
    if (targetInstanceName && !['createInstance', 'fetchInstances', 'healthCheck', 'setWebhook'].includes(action)) {
      await ensureWebhookConfigured(EVOLUTION_URL, headers, targetInstanceName)
    }

    let url = ''
    let method = 'POST'
    let requestBody: unknown = undefined

    // Rate-limit + circuit breaker apenas para chamadas que consomem cota WhatsApp
    const gateAdmin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
    const gate = RATE_LIMITED_ACTIONS.has(action)
      ? await provGate(gateAdmin, profile.company_id, 'whatsapp')
      : null
    if (gate && !gate.allowed) {
      return gateBlockedResponse(gate, corsHeaders)
    }

    switch (action) {
      case 'sendText':
        url = `${EVOLUTION_URL}/message/sendText/${INSTANCE}`
        requestBody = {
          number: params.number,
          text: params.text,
          delay: params.delay || 1200,
          linkPreview: true,
          ...(params.mentionsEveryOne ? { mentionsEveryOne: true } : {}),
          ...(Array.isArray(params.mentioned) && params.mentioned.length > 0 ? { mentioned: params.mentioned } : {}),
          ...(params.quoted ? { quoted: params.quoted } : {}),
        }
        break

      case 'sendMedia': {
        // Strip data URI prefix if base64 (e.g. "data:application/pdf;base64,JVBE...")
        // Pass through untouched if it's a URL (Evolution accepts both)
        let mediaData = String(params.media || '')
        const isUrl = /^https?:\/\//i.test(mediaData)
        if (!isUrl) {
          const commaIdx = mediaData.indexOf(',')
          if (commaIdx !== -1 && mediaData.substring(0, commaIdx).includes('base64')) {
            mediaData = mediaData.substring(commaIdx + 1)
          }
        }
        url = `${EVOLUTION_URL}/message/sendMedia/${INSTANCE}`
        requestBody = {
          number: params.number,
          mediatype: params.mediatype,
          mimetype: params.mimetype,
          caption: params.caption || '',
          media: mediaData,
          fileName: params.fileName,
        }
        break
      }

      case 'sendAudio': {
        // Strip data URI prefix if present (e.g. "data:audio/webm; codecs=opus;base64,...")
        let audioData = String(params.audio || '')
        const commaIdx = audioData.indexOf(',')
        if (commaIdx !== -1 && audioData.substring(0, commaIdx).includes('base64')) {
          audioData = audioData.substring(commaIdx + 1)
        }
        url = `${EVOLUTION_URL}/message/sendWhatsAppAudio/${INSTANCE}`
        requestBody = {
          number: params.number,
          audio: audioData,
          delay: 1200,
          encoding: true,
        }
        break
      }

      case 'sendReaction': {
        const rJid = normalizeJid(params.remoteJid)
        url = `${EVOLUTION_URL}/message/sendReaction/${INSTANCE}`
        requestBody = {
          key: {
            remoteJid: rJid,
            fromMe: params.fromMe ?? false,
            id: params.messageId,
          },
          reaction: params.reaction,
        }
        break
      }

      case 'deleteMessage': {
        const rJid = normalizeJid(params.remoteJid)
        url = `${EVOLUTION_URL}/chat/deleteMessageForEveryone/${INSTANCE}`
        method = 'DELETE'
        requestBody = {
          remoteJid: rJid,
          fromMe: params.fromMe ?? true,
          id: params.messageId,
        }
        break
      }

      case 'editMessage': {
        const rJid = normalizeJid(params.remoteJid)
        url = `${EVOLUTION_URL}/chat/updateMessage/${INSTANCE}`
        requestBody = {
          // Passamos o JID completo de propósito: o `createJid` da Evolution
          // só re-formata números brasileiros (remove o "9") quando recebe
          // dígitos puros. Como o `key.remoteJid` no banco da Evolution já
          // está exatamente como o WhatsApp armazena (com ou sem o 9), enviar
          // o JID completo bypassa essa normalização e evita o erro
          // "RemoteJid does not match" (HTTP 400).
          number: rJid,
          key: {
            remoteJid: rJid,
            fromMe: params.fromMe ?? true,
            id: params.messageId,
          },
          text: params.text,
        }
        break
      }



      case 'markAsRead':
        url = `${EVOLUTION_URL}/chat/markMessageAsRead/${INSTANCE}`
        requestBody = {
          readMessages: [{
            remoteJid: params.remoteJid,
            fromMe: params.fromMe ?? false,
            id: params.messageId,
          }],
        }
        break

      case 'findMessages':
        url = `${EVOLUTION_URL}/chat/findMessages/${INSTANCE}`
        requestBody = {
          where: {
            key: { remoteJid: params.remoteJid },
          },
          limit: params.limit || 50,
        }
        break

      case 'findChats':
        url = `${EVOLUTION_URL}/chat/findChats/${INSTANCE}`
        method = 'GET'
        break

      case 'findContacts':
        url = `${EVOLUTION_URL}/chat/findContacts/${INSTANCE}`
        if (params.pushName) {
          url += `?where=${encodeURIComponent(JSON.stringify({ pushName: params.pushName }))}`
        }
        method = 'GET'
        break

      case 'sendPresence':
        url = `${EVOLUTION_URL}/chat/sendPresence/${INSTANCE}`
        requestBody = {
          number: params.number,
          presence: params.presence || 'composing',
          delay: Number(params.delay || 1200),
        }
        break

      // Pede ao Baileys para começar a emitir PRESENCE_UPDATE deste contato.
      // Endpoint não existe em todas as versões da Evolution — em 404 retornamos ok silencioso.
      case 'subscribePresence': {
        const psUrl = `${EVOLUTION_URL}/chat/presenceSubscribe/${INSTANCE}`
        try {
          const psRes = await fetch(psUrl, {
            method: 'POST',
            headers,
            body: JSON.stringify({ number: params.number }),
          })
          await psRes.text().catch(() => '')
          return new Response(
            JSON.stringify({ ok: true, supported: psRes.status !== 404, status: psRes.status }),
            { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
          )
        } catch {
          return new Response(
            JSON.stringify({ ok: true, supported: false }),
            { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
          )
        }
      }


      case 'checkNumber':
        url = `${EVOLUTION_URL}/chat/whatsappNumbers/${INSTANCE}`
        method = 'POST'
        requestBody = { numbers: [params.number] }
        break

      case 'fetchProfilePicture': {
        // TTL de 1 ano (signed URL persistido em conversations).
        const SIGNED_TTL = 60 * 60 * 24 * 365
        const phone = String(params.number).replace(/@.*/, '').replace(/\D/g, '')

        const serviceClient = createClient(
          Deno.env.get('SUPABASE_URL')!,
          Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
        )

        // 1) Se já existe storage_path, só re-assina (evita refetch da Evolution).
        if (phone && profile?.company_id) {
          const { data: existing } = await serviceClient
            .from('conversations')
            .select('contact_storage_path')
            .eq('phone', phone)
            .eq('company_id', profile.company_id)
            .not('contact_storage_path', 'is', null)
            .limit(1)
            .maybeSingle()

          if (existing?.contact_storage_path) {
            const { data: signed } = await serviceClient.storage
              .from('chat-media')
              .createSignedUrl(existing.contact_storage_path, SIGNED_TTL)
            if (signed?.signedUrl) {
              await serviceClient
                .from('conversations')
                .update({ contact_photo_url: signed.signedUrl })
                .eq('phone', phone)
                .eq('company_id', profile.company_id)
              return new Response(
                JSON.stringify({ profilePictureUrl: signed.signedUrl, storagePath: existing.contact_storage_path, cached: true }),
                { status: 200, headers: corsHeaders }
              )
            }
          }
        }

        // 2) Caso contrário, busca na Evolution.
        const ppUrl = `${EVOLUTION_URL}/chat/fetchProfilePictureUrl/${INSTANCE}`
        const ppBody = { number: String(params.number) }

        console.log('Evolution request', { action, url: ppUrl, method: 'POST', instance: INSTANCE })
        const ppRes = await fetch(ppUrl, { method: 'POST', headers, body: JSON.stringify(ppBody) })
        const ppText = await ppRes.text()
        console.log('Evolution response', { action, url: ppUrl, status: ppRes.status })

        if (!ppRes.ok) {
          return new Response(ppText, { status: ppRes.status, headers: corsHeaders })
        }

        let ppData: any
        try { ppData = JSON.parse(ppText) } catch {
          return new Response(JSON.stringify({ error: 'Resposta inválida' }), { status: 502, headers: corsHeaders })
        }

        const originalUrl = ppData?.profilePictureUrl
        if (!originalUrl) {
          return new Response(JSON.stringify({ profilePictureUrl: null }), { status: 200, headers: corsHeaders })
        }

        try {
          const imgRes = await fetch(originalUrl)
          if (!imgRes.ok) throw new Error(`Image download failed: ${imgRes.status}`)
          const imgBuffer = new Uint8Array(await imgRes.arrayBuffer())
          const contentType = imgRes.headers.get('content-type') || 'image/jpeg'
          const ext = contentType.includes('png') ? 'png' : 'jpg'
          const storagePath = `profile-pictures/${phone}.${ext}`

          const { error: uploadErr } = await serviceClient.storage
            .from('chat-media')
            .upload(storagePath, imgBuffer, { contentType, upsert: true })

          if (uploadErr) {
            console.error('Profile picture upload error:', uploadErr)
            return new Response(JSON.stringify({ profilePictureUrl: originalUrl }), { status: 200, headers: corsHeaders })
          }

          const { data: signedData } = await serviceClient.storage
            .from('chat-media')
            .createSignedUrl(storagePath, SIGNED_TTL)

          const finalUrl = signedData?.signedUrl || originalUrl

          serviceClient
            .from('conversations')
            .update({ contact_photo_url: finalUrl, contact_storage_path: storagePath })
            .eq('phone', phone)
            .eq('company_id', profile.company_id)
            .then((res: any) => {
              if (res?.error) console.error('DB update photo error:', res.error)
            })

          return new Response(JSON.stringify({ profilePictureUrl: finalUrl, storagePath }), { status: 200, headers: corsHeaders })
        } catch (e) {
          console.error('Profile picture proxy error:', e)
          return new Response(JSON.stringify({ profilePictureUrl: originalUrl }), { status: 200, headers: corsHeaders })
        }
      }

      case 'resignAllProfilePictures': {
        // Re-assina TODAS as URLs cujos storage_path existem (corrige TTL expirado em massa).
        const SIGNED_TTL = 60 * 60 * 24 * 365
        if (!profile?.company_id) {
          return new Response(JSON.stringify({ error: 'no_company' }), { status: 400, headers: corsHeaders })
        }
        const serviceClient = createClient(
          Deno.env.get('SUPABASE_URL')!,
          Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
        )
        const { data: rows } = await serviceClient
          .from('conversations')
          .select('id, contact_storage_path')
          .eq('company_id', profile.company_id)
          .not('contact_storage_path', 'is', null)

        let ok = 0
        let fail = 0
        for (const row of rows || []) {
          const { data: signed } = await serviceClient.storage
            .from('chat-media')
            .createSignedUrl(row.contact_storage_path, SIGNED_TTL)
          if (signed?.signedUrl) {
            const { error } = await serviceClient
              .from('conversations')
              .update({ contact_photo_url: signed.signedUrl })
              .eq('id', row.id)
            if (error) fail++; else ok++
          } else {
            fail++
          }
        }
        return new Response(JSON.stringify({ ok, fail, total: (rows || []).length }), { status: 200, headers: corsHeaders })
      }

      case 'fetchProfile':
        url = `${EVOLUTION_URL}/chat/fetchProfile/${INSTANCE}`
        requestBody = { number: String(params.number) }
        break

      // ── Instance management ──────────────────────────────
      case 'createInstance': {
        const instanceName = params.instanceName as string
        if (!instanceName) {
          return new Response(JSON.stringify({ error: 'instanceName é obrigatório' }), { status: 400, headers: corsHeaders })
        }
        // Sempre garante uma URL válida do webhook (cliente pode omitir).
        const webhookUrl = (params.webhookUrl as string) || defaultWebhookUrl()

        const createBody = {
          instanceName,
          integration: 'WHATSAPP-BAILEYS',
          qrcode: true,
        }

        const createEndpoints = [`${EVOLUTION_URL}/instance/create`]
        let createResponse: Response | null = null
        let createText = ''
        let createData: any = null

        for (const candidateUrl of createEndpoints) {
          console.log('Evolution createInstance request', { url: candidateUrl })
          const response = await fetch(candidateUrl, {
            method: 'POST',
            headers,
            body: JSON.stringify(createBody),
          })
          const text = await response.text()
          console.log('Evolution createInstance response', { url: candidateUrl, status: response.status })

          createResponse = response
          createText = text

          if (!shouldRetryEvolutionResponse(response, text)) {
            break
          }
        }

        try {
          createData = createText ? unwrapEvolutionPayload(JSON.parse(createText)) : null
        } catch {
          return new Response(
            JSON.stringify({ error: 'Resposta inválida da Evolution API', details: createText.substring(0, 200) }),
            { status: 502, headers: corsHeaders }
          )
        }

        if (!createResponse?.ok) {
          return new Response(JSON.stringify(createData), {
            status: createResponse?.status || 502,
            headers: corsHeaders,
          })
        }

        // Aplica o webhook (todos os eventos relevantes) imediatamente após criar.
        try {
          await applyWebhook(EVOLUTION_URL, headers, instanceName, webhookUrl)
        } catch (e) {
          console.error('Webhook set error:', e)
        }

        return new Response(JSON.stringify(createData), {
          status: createResponse.status,
          headers: corsHeaders,
        })
      }

      // Re-aplica o webhook em uma instância existente (idempotente).
      // Usado por: backfill admin, reconnect, recover.
      case 'setWebhook': {
        const instanceName = (params.instanceName as string) || INSTANCE
        if (!instanceName) {
          return new Response(JSON.stringify({ error: 'instanceName é obrigatório' }), { status: 400, headers: corsHeaders })
        }
        const webhookUrl = (params.webhookUrl as string) || defaultWebhookUrl()
        const result = await applyWebhook(EVOLUTION_URL, headers, instanceName, webhookUrl)
        return new Response(
          JSON.stringify({ success: result.ok, status: result.status, instanceName, webhookUrl }),
          { status: result.ok ? 200 : 502, headers: corsHeaders },
        )
      }

      // Reaplica o webhook em TODAS as instâncias registradas. Master-only.
      // Usar após mudanças no payload do webhook (ex.: novo header de auth).
      case 'reapplyAllWebhooks': {
        const { data: isMaster } = await supabase.rpc('is_master', { _user_id: user.id })
        if (!isMaster) {
          return new Response(JSON.stringify({ error: 'Apenas master pode reaplicar todos os webhooks' }), { status: 403, headers: corsHeaders })
        }
        const adminClient = createClient(
          Deno.env.get('SUPABASE_URL')!,
          Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
        )
        const { data: instances, error: instErr } = await adminClient
          .from('whatsapp_instances')
          .select('instance_name')
        if (instErr) {
          return new Response(JSON.stringify({ error: instErr.message }), { status: 500, headers: corsHeaders })
        }
        const webhookUrl = defaultWebhookUrl()
        const results: Array<{ instanceName: string; ok: boolean; status: number }> = []
        for (const inst of instances || []) {
          try {
            const r = await applyWebhook(EVOLUTION_URL, headers, inst.instance_name, webhookUrl)
            results.push({ instanceName: inst.instance_name, ok: r.ok, status: r.status })
          } catch (e) {
            results.push({ instanceName: inst.instance_name, ok: false, status: 0 })
          }
        }
        return new Response(
          JSON.stringify({ total: results.length, success: results.filter(r => r.ok).length, results }),
          { status: 200, headers: corsHeaders },
        )
      }

      case 'connectInstance': {
        const targetInstance = (params.instanceName as string) || INSTANCE
        // Garante que o webhook esteja sempre aplicado antes de gerar o QR.
        // Idempotente: se já estiver correto, a Evolution apenas confirma.
        try {
          await applyWebhook(EVOLUTION_URL, headers, targetInstance, defaultWebhookUrl())
        } catch (e) {
          console.warn('connectInstance: falha ao reaplicar webhook (seguindo)', e)
        }
        url = `${EVOLUTION_URL}/instance/connect/${targetInstance}`
        method = 'GET'
        break
      }

      case 'connectionState':
        url = `${EVOLUTION_URL}/instance/connectionState/${params.instanceName || INSTANCE}`
        method = 'GET'
        break

      case 'restartInstance':
        url = `${EVOLUTION_URL}/instance/restart/${params.instanceName || INSTANCE}`
        method = 'PUT'
        break

      case 'logoutInstance':
        url = `${EVOLUTION_URL}/instance/logout/${params.instanceName || INSTANCE}`
        method = 'DELETE'
        break

      case 'deleteInstance':
        url = `${EVOLUTION_URL}/instance/delete/${params.instanceName || INSTANCE}`
        method = 'DELETE'
        break

      case 'fetchInstances':
        url = `${EVOLUTION_URL}/instance/fetchInstances`
        method = 'GET'
        break

      case 'healthCheck': {
        const start = Date.now()
        try {
          const resolved = await resolveEvolutionBase(evolutionBaseCandidates, headers)
          const latency = Date.now() - start
          return new Response(JSON.stringify({
            ok: !!resolved.probe?.ok,
            status: resolved.probe?.status || 0,
            latency,
            host: resolved.baseUrl || configuredEvolutionUrl,
            configuredHost: configuredEvolutionUrl,
            error: resolved.probe?.error,
          }), { status: 200, headers: corsHeaders })
        } catch (e) {
          const latency = Date.now() - start
          return new Response(JSON.stringify({
            ok: false,
            status: 0,
            latency,
            host: configuredEvolutionUrl,
            configuredHost: configuredEvolutionUrl,
            error: String(e),
          }), { status: 200, headers: corsHeaders })
        }
      }

      case 'getBase64FromMediaMessage':
        url = `${EVOLUTION_URL}/chat/getBase64FromMediaMessage/${INSTANCE}`
        requestBody = {
          message: { key: { id: params.messageId } },
          convertToMp4: params.convertToMp4 || false,
        }
        break

      case 'downloadMedia': {
        // Download media from Evolution API by messageId, store in Supabase, return public URL
        const dmUrl = `${EVOLUTION_URL}/chat/getBase64FromMediaMessage/${INSTANCE}`
        const dmBody = {
          message: { key: { id: String(params.messageId) } },
          convertToMp4: params.convertToMp4 || false,
        }

        const dmRes = await fetch(dmUrl, { method: 'POST', headers, body: JSON.stringify(dmBody), signal: AbortSignal.timeout(30000) })
        if (!dmRes.ok) {
          const errText = await dmRes.text()
          return new Response(JSON.stringify({ error: 'Falha ao baixar mídia', details: errText.substring(0, 200) }), { status: dmRes.status, headers: corsHeaders })
        }

        const dmResult = await dmRes.json()
        const b64 = dmResult?.base64 || dmResult?.data || null
        if (!b64) {
          return new Response(JSON.stringify({ error: 'Sem dados base64' }), { status: 404, headers: corsHeaders })
        }

        // Decode in chunks to avoid OOM on larger media (stickers, vídeos)
        const cleanB64 = String(b64).replace(/^data:[^;]+;base64,/, '')
        const chunkSize = 8192
        const totalChunks = Math.ceil(cleanB64.length / chunkSize)
        const parts: Uint8Array[] = []
        let totalBytes = 0
        for (let i = 0; i < totalChunks; i++) {
          const slice = cleanB64.slice(i * chunkSize, (i + 1) * chunkSize)
          const binStr = atob(slice)
          const part = new Uint8Array(binStr.length)
          for (let j = 0; j < binStr.length; j++) part[j] = binStr.charCodeAt(j)
          parts.push(part)
          totalBytes += part.length
        }
        const bytes = new Uint8Array(totalBytes)
        let offset = 0
        for (const p of parts) { bytes.set(p, offset); offset += p.length }

        const mimeMap: Record<string, string> = {
          'audio/ogg; codecs=opus': 'ogg', 'audio/ogg': 'ogg', 'audio/mpeg': 'mp3',
          'audio/mp4': 'm4a', 'audio/webm': 'webm',
          'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif',
          'video/mp4': 'mp4', 'video/3gpp': '3gp', 'application/pdf': 'pdf',
        }
        const mime = String(params.mimetype || 'application/octet-stream')
        const ext = mimeMap[mime] || mime.split('/')[1]?.split(';')[0] || 'bin'
        const mediaType = String(params.mediaType || 'audio')
        const storagePath = `${profile.company_id}/${mediaType}/${params.messageId}.${ext}`

        const serviceClient = createClient(
          Deno.env.get('SUPABASE_URL')!,
          Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
        )

        const { error: upErr } = await serviceClient.storage
          .from('chat-media')
          .upload(storagePath, bytes, { contentType: mime, upsert: true })

        if (upErr) {
          return new Response(JSON.stringify({ error: 'Upload falhou', details: upErr.message }), { status: 500, headers: corsHeaders })
        }

        const { data: signedData } = await serviceClient.storage
          .from('chat-media')
          .createSignedUrl(storagePath, 60 * 60 * 24 * 7)
        const signedUrl = signedData?.signedUrl || null

        // Update the message in DB with signed URL + storage path
        if (signedUrl && params.messageId) {
          await serviceClient
            .from('chat_messages')
            .update({ media_url: signedUrl, media_storage_path: storagePath })
            .eq('message_id', String(params.messageId))
            .eq('company_id', profile.company_id)
        }

        return new Response(JSON.stringify({ mediaUrl: signedUrl, storagePath }), { status: 200, headers: corsHeaders })
      }

      default:
        return new Response(
          JSON.stringify({ error: `Ação desconhecida: ${action}` }),
          { status: 400, headers: corsHeaders }
        )
    }

    const fetchOptions: RequestInit = {
      method,
      headers,
    }

    if (method !== 'GET' && requestBody) {
      fetchOptions.body = JSON.stringify(requestBody)
    }

    const requestId = crypto.randomUUID()
    const startedAt = performance.now()
    console.log('Evolution request', { requestId, action, url, method, instance: INSTANCE, ...(DEBUG && requestBody ? { body: requestBody } : {}) })

    let response: Response
    let responseText = ''
    let latencyMs = 0
    let networkError: string | null = null
    try {
      // Retry simples para 429 com Retry-After (até 2 retentativas, backoff exponencial)
      const MAX_429_RETRIES = 2
      let attempt = 0
      // eslint-disable-next-line no-constant-condition
      while (true) {
        response = await fetch(url, fetchOptions)
        if (response.status !== 429 || attempt >= MAX_429_RETRIES) break
        const retryAfter = response.headers.get('retry-after')
        const waitMs = retryAfter && Number.isFinite(Number(retryAfter))
          ? Number(retryAfter) * 1000
          : Math.min(8000, 500 * Math.pow(2, attempt))
        console.warn('[evolution-proxy] 429 rate limited, retry in', waitMs, 'ms (attempt', attempt + 1, ')')
        await new Promise((r) => setTimeout(r, waitMs))
        attempt++
      }
      responseText = await response!.text()
      latencyMs = Math.round(performance.now() - startedAt)
    } catch (e: any) {
      latencyMs = Math.round(performance.now() - startedAt)
      networkError = e?.message || String(e)
      // Emite log estruturado de falha de rede e responde 599
      const failPayload = {
        requestId,
        action,
        instance: INSTANCE || null,
        url,
        method,
        status: 0,
        statusClass: 'network_error',
        latencyMs,
        error: networkError,
      }
      console.error('evolution_proxy_metric', JSON.stringify(failPayload))

      const failLogClient = createClient(
        Deno.env.get('SUPABASE_URL')!,
        Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
      )
      failLogClient.from('system_logs').insert({
        company_id: profile.company_id,
        source: 'evolution-proxy',
        level: 'error',
        event: action,
        message: `${action} network_error em ${latencyMs}ms`,
        instance_name: INSTANCE || null,
        metadata: failPayload,
      }).then(() => {}).catch(() => {})

      if (action === 'checkNumber') {
        return new Response(
          JSON.stringify({ skipped: true, exists: true, reason: 'network_error' }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }
      return new Response(
        JSON.stringify({ error: 'Falha de rede ao falar com a Evolution', details: networkError }),
        { status: 599, headers: corsHeaders }
      )
    }

    const statusClass =
      response.status === 0 ? 'network_error' :
      response.status >= 500 ? '5xx' :
      response.status === 429 ? 'rate_limited' :
      response.status === 404 ? '404' :
      response.status >= 400 ? '4xx' :
      response.status >= 200 ? '2xx' : 'other'

    // Log estruturado (uma linha JSON) — fácil de ingerir em logs
    console.log('evolution_proxy_metric', JSON.stringify({
      requestId,
      action,
      instance: INSTANCE || null,
      status: response.status,
      statusClass,
      latencyMs,
    }))

    if (gate?.allowed) {
      if (response.ok) await gate.success()
      else await gate.failure(`HTTP ${response.status}: ${responseText.slice(0, 200)}`)
    }

    if (!response.ok && DEBUG) {
      console.error('Evolution error body', { requestId, action, responseText: responseText.substring(0, 500) })
    }

    // Log proxy calls to system_logs (com latência e classe HTTP)
    const logServiceClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )
    const logLevel = response.ok ? 'info' : (statusClass === '404' || statusClass === '4xx' ? 'warn' : 'error')
    const logMessage = response.ok
      ? `${action} → ${response.status} em ${latencyMs}ms`
      : `${action} falhou → ${response.status} (${statusClass}) em ${latencyMs}ms`

    const sanitizedBody = DEBUG && requestBody ? (() => {
      const body = requestBody as Record<string, unknown>
      return {
        ...body,
        ...(body.media ? { media: '[BASE64_OMITTED]' } : {}),
        ...(body.audio ? { audio: '[BASE64_OMITTED]' } : {}),
      }
    })() : undefined

    logServiceClient.from('system_logs').insert({
      company_id: profile.company_id,
      source: 'evolution-proxy',
      level: logLevel,
      event: action,
      message: logMessage,
      instance_name: INSTANCE || null,
      metadata: {
        requestId,
        url,
        method,
        status: response.status,
        statusClass,
        latencyMs,
        ...(sanitizedBody ? { requestBody: sanitizedBody } : {}),
        ...(!response.ok ? { responsePreview: responseText.substring(0, 300) } : {}),
      },
    }).then(() => {}).catch(() => {})

    if (!response.ok && action === 'checkNumber') {
      return new Response(
        JSON.stringify({
          skipped: true,
          exists: true,
          reason: 'check_number_unavailable',
          upstreamStatus: response.status,
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    let data: unknown
    try {
      data = unwrapEvolutionPayload(JSON.parse(responseText))
    } catch {
      if (action === 'checkNumber') {
        return new Response(
          JSON.stringify({ skipped: true, exists: true, reason: 'check_number_invalid_response' }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }
      console.error('Evolution API retornou resposta não-JSON:', responseText.substring(0, 200))
      return new Response(
        JSON.stringify({ error: 'Resposta inválida da Evolution API', details: responseText.substring(0, 200) }),
        { status: 502, headers: corsHeaders }
      )
    }

    // For sendText/sendMedia, save the outgoing message to DB
    if ((action === 'sendText' || action === 'sendMedia' || action === 'sendAudio') && response.ok && (data as any)?.key) {
      const serviceClient = createClient(
        Deno.env.get('SUPABASE_URL')!,
        Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
      )

      const remoteJid = (data as any).key.remoteJid || `${params.number}@s.whatsapp.net`
      const phone = String(params.number).replace('@s.whatsapp.net', '')

      // Upsert conversation
      const { data: conversation } = await serviceClient
        .from('conversations')
        .upsert({
          company_id: profile.company_id,
          instance_name: INSTANCE,
          remote_jid: remoteJid,
          phone,
          last_message_text: action === 'sendText' ? String(params.text) : `📎 ${params.fileName || 'Mídia'}`,
          last_message_at: new Date().toISOString(),
        }, { onConflict: 'company_id,instance_name,remote_jid' })
        .select('id')
        .single()

      if (conversation) {
        let messageType = 'text'
        let content = String(params.text || '')
        if (action === 'sendMedia') {
          messageType = String(params.mediatype || 'document')
          content = String(params.caption || '')
        } else if (action === 'sendAudio') {
          messageType = 'audio'
          content = ''
        }

        // If sendMedia was called with a (signed) URL, persist it as media_url so the bubble
        // can render immediately without waiting for the inbound webhook to mirror the file.
        let outgoingMediaUrl: string | null = null
        let outgoingStoragePath: string | null = null
        if (action === 'sendMedia') {
          const m = String(params.media || '')
          if (/^https?:\/\//i.test(m)) outgoingMediaUrl = m
          if (params.storagePath) outgoingStoragePath = String(params.storagePath)
        }

        await serviceClient.from('chat_messages').upsert({
          company_id: profile.company_id,
          conversation_id: conversation.id,
          remote_jid: remoteJid,
          message_id: (data as any).key.id,
          from_me: true,
          message_type: messageType,
          content,
          media_url: outgoingMediaUrl,
          media_storage_path: outgoingStoragePath,
          media_mimetype: action !== 'sendText' ? String(params.mimetype || '') : null,
          file_name: action !== 'sendText' ? String(params.fileName || '') : null,
          status: 'sent',
          timestamp: new Date().toISOString(),
        }, { onConflict: 'company_id,message_id' })
      }
    }

    return new Response(JSON.stringify(data), {
      status: response.status,
      headers: corsHeaders,
    })
  } catch (error) {
    console.error('Evolution proxy error:', error)
    return new Response(
      JSON.stringify({ error: 'Erro interno no proxy' }),
      { status: 500, headers: corsHeaders }
    )
  }
})
