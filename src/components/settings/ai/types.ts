export interface AiAgent {
  id: string;
  pipeline_id: string;
  name: string;
  persona: string;
  system_prompt: string;
  model: string;
  is_active: boolean;
  business_hours_only: boolean;
  paused_until: string | null;
  max_turns: number;
  handoff_keywords: string[];
  response_delay_ms: number;
  debounce_seconds: number;
  kb_document_ids: string[] | null;
}

export interface KbCitation {
  chunk_id: string;
  document_id: string;
  file_name: string;
  similarity: number;
  snippet: string;
}

export interface PlayMsg {
  role: 'user' | 'assistant';
  content: string;
  ts: number;
  kb?: KbCitation[];
  latency_ms?: number;
  sent?: boolean;
}

export interface AiAgentLimitsRow {
  company_id: string;
  daily_message_cap: number;
  monthly_message_cap: number;
  monthly_token_cap: number;
  monthly_cost_cap_brl: number;
  block_when_exceeded: boolean;
  send_block_message: boolean;
  block_message_to_client: string;
  notify_admins_on_block: boolean;
  currently_blocked: boolean;
  blocked_reason: string | null;
  blocked_until: string | null;
  blocked_at: string | null;
  allow_single_agent_fallback: boolean;
}

export const MODELS = [
  { value: 'google/gemini-2.5-flash', label: 'Gemini 2.5 Flash (rápido, recomendado)' },
  { value: 'google/gemini-2.5-flash-lite', label: 'Gemini 2.5 Flash Lite (mais barato)' },
  { value: 'google/gemini-2.5-pro', label: 'Gemini 2.5 Pro (mais inteligente)' },
];

export const REASON_LABEL: Record<string, string> = {
  daily_cap: 'Limite diário de mensagens atingido',
  monthly_cap: 'Limite mensal de mensagens atingido',
  token_cap: 'Limite mensal de tokens atingido',
  cost_cap: 'Teto de custo mensal atingido',
  manual_block: 'Bloqueio manual',
};
