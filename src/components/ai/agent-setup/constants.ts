export const MODELS = [
  { value: 'google/gemini-2.5-flash', label: 'Gemini 2.5 Flash (rápido, recomendado)' },
  { value: 'google/gemini-2.5-flash-lite', label: 'Gemini 2.5 Flash Lite (mais barato)' },
  { value: 'google/gemini-2.5-pro', label: 'Gemini 2.5 Pro (mais inteligente)' },
];

export const TONES = [
  { value: 'formal', label: 'Formal', desc: 'Profissional, direto, sem gírias' },
  { value: 'casual', label: 'Casual', desc: 'Amigável, natural, faz piadas leves' },
  { value: 'tecnico', label: 'Técnico', desc: 'Detalhado, preciso, para nicho técnico' },
  { value: 'entusiasta', label: 'Entusiasta', desc: 'Energético, motivador, vendedor' },
];

export const COLLECTABLE_FIELDS = [
  'nome','empresa','email','telefone','cargo','linkedin','orcamento','timeline',
  'necessidade','urgencia','setor','tamanho_empresa',
];

export const DAYS = [
  { key: 'mon', label: 'Segunda' },
  { key: 'tue', label: 'Terça' },
  { key: 'wed', label: 'Quarta' },
  { key: 'thu', label: 'Quinta' },
  { key: 'fri', label: 'Sexta' },
  { key: 'sat', label: 'Sábado' },
  { key: 'sun', label: 'Domingo' },
];

export interface AgentForm {
  id?: string;
  instance_id?: string;
  name: string;
  emoji?: string | null;
  persona: string;
  tone: string;
  system_prompt: string;
  model: string;
  is_active: boolean;
  business_hours_only: boolean;
  max_turns: number;
  handoff_keywords: string[];
  response_delay_ms: number;
  debounce_seconds: number;
  qualification_questions: string[];
  collect_fields: string[];
  available_hours: Record<string, { enabled: boolean; start: string; end: string }>;
  offer_scheduling: boolean;
  offer_timing: string;
  auto_confirmation: boolean;
  reminder_enabled: boolean;
  send_discount_coupon: boolean;
  detect_negative_sentiment: boolean;
  kb_document_ids: string[] | null;
}

export const DEFAULT_FORM: AgentForm = {
  name: 'Assistente',
  emoji: '🤖',
  persona: 'Atendente cordial e prestativo',
  tone: 'casual',
  system_prompt: 'Você é um assistente virtual de pré-atendimento. Seja breve, humano e cordial. Faça uma pergunta por vez. Use português do Brasil informal.',
  model: 'google/gemini-2.5-flash',
  is_active: true,
  business_hours_only: false,
  max_turns: 15,
  handoff_keywords: ['atendente', 'humano', 'pessoa', 'cancelar', 'falar com alguém'],
  response_delay_ms: 1500,
  debounce_seconds: 8,
  qualification_questions: [],
  collect_fields: ['nome', 'empresa', 'email', 'telefone'],
  available_hours: Object.fromEntries(
    DAYS.map((d) => [d.key, { enabled: !['sat', 'sun'].includes(d.key), start: '09:00', end: '18:00' }])
  ),
  offer_scheduling: false,
  offer_timing: 'qualified',
  auto_confirmation: true,
  reminder_enabled: true,
  send_discount_coupon: false,
  detect_negative_sentiment: false,
  kb_document_ids: null,
};
