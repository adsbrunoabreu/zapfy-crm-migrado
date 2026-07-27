// Roteador de chamadas de chat para o provedor ativo em ai_global_config.
// Mantém embeddings e áudio no Lovable Gateway (compatibilidade).
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

export type Provider = 'lovable' | 'anthropic' | 'openai' | 'google'

export interface ToolDef {
  type: 'function'
  function: { name: string; description?: string; parameters: any }
}

export interface ChatMsg {
  role: 'system' | 'user' | 'assistant' | 'tool'
  content: any
  tool_call_id?: string
  name?: string
}

export interface ChatOptions {
  messages: ChatMsg[]
  tools?: ToolDef[]
  tool_choice?: 'auto' | 'none' | { type: 'function'; function: { name: string } }
  modelOverride?: string // se informado e provider == lovable, usa esse modelo
}

export interface ChatResult {
  text: string
  toolCalls: Array<{ id?: string; name: string; arguments: any }>
  raw: any
  status: number
  error?: 'rate_limited' | 'no_credits' | 'gateway_error'
  provider: Provider
  model: string
}

const ENV_KEY: Record<Provider, string> = {
  lovable: 'LOVABLE_API_KEY',
  anthropic: 'ANTHROPIC_API_KEY',
  openai: 'OPENAI_API_KEY',
  google: 'GOOGLE_AI_API_KEY',
}

export async function getActiveAi(): Promise<{ provider: Provider; model: string }> {
  try {
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
    const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const admin = createClient(SUPABASE_URL, SERVICE_KEY)
    const { data } = await admin.from('ai_global_config').select('active_provider, active_model').eq('id', true).maybeSingle()
    if (data?.active_provider) {
      return { provider: data.active_provider as Provider, model: data.active_model || 'google/gemini-3-flash-preview' }
    }
  } catch (e) {
    console.warn('getActiveAi falhou, usando lovable default', (e as Error)?.message)
  }
  return { provider: 'lovable', model: 'google/gemini-3-flash-preview' }
}

function flattenContent(c: any): string {
  if (typeof c === 'string') return c
  if (Array.isArray(c)) {
    return c.map((p) => (typeof p === 'string' ? p : (p?.text || ''))).join('\n')
  }
  return ''
}

async function callLovable(apiKey: string, model: string, opts: ChatOptions): Promise<Response> {
  const body: any = { model, messages: opts.messages }
  if (opts.tools) body.tools = opts.tools
  if (opts.tool_choice) body.tool_choice = opts.tool_choice
  return fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

async function callOpenAI(apiKey: string, model: string, opts: ChatOptions): Promise<Response> {
  const body: any = { model, messages: opts.messages }
  if (opts.tools) body.tools = opts.tools
  if (opts.tool_choice) body.tool_choice = opts.tool_choice
  return fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

function parseOpenAIStyle(json: any): { text: string; toolCalls: ChatResult['toolCalls'] } {
  const choice = json.choices?.[0]?.message
  const text = (choice?.content && typeof choice.content === 'string') ? choice.content : flattenContent(choice?.content) || ''
  const toolCalls: ChatResult['toolCalls'] = (choice?.tool_calls || []).map((tc: any) => {
    let args: any = {}
    try { args = JSON.parse(tc.function?.arguments || '{}') } catch {}
    return { id: tc.id, name: tc.function?.name, arguments: args }
  })
  return { text: text || '', toolCalls }
}

async function callAnthropic(apiKey: string, model: string, opts: ChatOptions): Promise<Response> {
  // Converte formato OpenAI -> Anthropic
  let system = ''
  const messages: any[] = []
  for (const m of opts.messages) {
    if (m.role === 'system') {
      system += (system ? '\n\n' : '') + flattenContent(m.content)
      continue
    }
    if (m.role === 'tool') {
      messages.push({
        role: 'user',
        content: [{ type: 'tool_result', tool_use_id: m.tool_call_id, content: flattenContent(m.content) }],
      })
      continue
    }
    messages.push({ role: m.role === 'assistant' ? 'assistant' : 'user', content: flattenContent(m.content) })
  }
  const body: any = { model, max_tokens: 1024, system, messages }
  if (opts.tools) {
    body.tools = opts.tools.map((t) => ({
      name: t.function.name,
      description: t.function.description || '',
      input_schema: t.function.parameters,
    }))
  }
  return fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify(body),
  })
}

function parseAnthropic(json: any): { text: string; toolCalls: ChatResult['toolCalls'] } {
  let text = ''
  const toolCalls: ChatResult['toolCalls'] = []
  for (const block of (json.content || [])) {
    if (block.type === 'text') text += block.text
    if (block.type === 'tool_use') toolCalls.push({ id: block.id, name: block.name, arguments: block.input || {} })
  }
  return { text, toolCalls }
}

async function callGoogle(apiKey: string, model: string, opts: ChatOptions): Promise<Response> {
  // Converte para formato GenAI
  let systemInstruction = ''
  const contents: any[] = []
  for (const m of opts.messages) {
    if (m.role === 'system') {
      systemInstruction += (systemInstruction ? '\n\n' : '') + flattenContent(m.content)
      continue
    }
    if (m.role === 'tool') {
      contents.push({
        role: 'user',
        parts: [{ functionResponse: { name: m.name || 'tool', response: { result: flattenContent(m.content) } } }],
      })
      continue
    }
    contents.push({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: flattenContent(m.content) }],
    })
  }
  const body: any = { contents }
  if (systemInstruction) body.systemInstruction = { parts: [{ text: systemInstruction }] }
  if (opts.tools) {
    body.tools = [{
      functionDeclarations: opts.tools.map((t) => ({
        name: t.function.name,
        description: t.function.description || '',
        parameters: t.function.parameters,
      })),
    }]
  }
  return fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    },
  )
}

function parseGoogle(json: any): { text: string; toolCalls: ChatResult['toolCalls'] } {
  let text = ''
  const toolCalls: ChatResult['toolCalls'] = []
  const parts = json.candidates?.[0]?.content?.parts || []
  for (const p of parts) {
    if (p.text) text += p.text
    if (p.functionCall) toolCalls.push({ name: p.functionCall.name, arguments: p.functionCall.args || {} })
  }
  return { text, toolCalls }
}

export async function chatCompletion(opts: ChatOptions): Promise<ChatResult> {
  const active = await getActiveAi()
  const provider = active.provider
  // Para lovable, permite override do modelo (ex.: por agente). Para outros, usa modelo global.
  const model = provider === 'lovable' && opts.modelOverride ? opts.modelOverride : active.model
  const apiKey = Deno.env.get(ENV_KEY[provider])
  if (!apiKey) {
    return { text: '', toolCalls: [], raw: null, status: 500, error: 'gateway_error', provider, model }
  }

  let resp: Response
  try {
    if (provider === 'anthropic') resp = await callAnthropic(apiKey, model, opts)
    else if (provider === 'openai') resp = await callOpenAI(apiKey, model, opts)
    else if (provider === 'google') resp = await callGoogle(apiKey, model, opts)
    else resp = await callLovable(apiKey, model, opts)
  } catch (e) {
    console.error('chatCompletion fetch erro', (e as Error)?.message)
    return { text: '', toolCalls: [], raw: null, status: 500, error: 'gateway_error', provider, model }
  }

  if (resp.status === 429) {
    await resp.text().catch(() => '')
    return { text: '', toolCalls: [], raw: null, status: 429, error: 'rate_limited', provider, model }
  }
  if (resp.status === 402) {
    await resp.text().catch(() => '')
    return { text: '', toolCalls: [], raw: null, status: 402, error: 'no_credits', provider, model }
  }
  if (!resp.ok) {
    const t = await resp.text().catch(() => '')
    console.error(`AI provider ${provider} ${resp.status}: ${t.slice(0, 300)}`)
    return { text: '', toolCalls: [], raw: null, status: resp.status, error: 'gateway_error', provider, model }
  }

  const json = await resp.json()
  const parsed = provider === 'anthropic'
    ? parseAnthropic(json)
    : provider === 'google'
    ? parseGoogle(json)
    : parseOpenAIStyle(json)
  return { text: parsed.text || '', toolCalls: parsed.toolCalls, raw: json, status: 200, provider, model }
}
