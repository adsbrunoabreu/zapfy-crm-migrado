/**
 * Tipos compartilhados do sistema multi-provider de WhatsApp.
 *
 * Define os enums e contratos de dados que circulam entre os providers
 * (Evolution API, WhatsApp Cloud API) e o restante da aplicação.
 *
 * Mantemos strings literais (em vez de enums TS) para serializar com
 * segurança em JSON, RPC do Supabase e webhooks.
 */

// ─────────────────────────────────────────────────────────────────────────────
// Provider
// ─────────────────────────────────────────────────────────────────────────────

/** Identificador do provedor de WhatsApp. */
export type ProviderType = 'evolution' | 'cloud_api';

export const PROVIDER_TYPES = ['evolution', 'cloud_api'] as const;

/** Estado operacional de uma instância. */
export type ProviderConnectionStatus = 'connected' | 'disconnected' | 'connecting' | 'error';

// ─────────────────────────────────────────────────────────────────────────────
// Mensagens
// ─────────────────────────────────────────────────────────────────────────────

/** Tipos de mensagem suportados (subset comum entre Evolution e Cloud API). */
export type MessageType =
  | 'text'
  | 'image'
  | 'video'
  | 'audio'
  | 'document'
  | 'sticker'
  | 'location'
  | 'contact'
  | 'reaction'
  | 'interactive'
  | 'template'
  | 'unknown';

/** Estado de entrega/processamento de uma mensagem. */
export type MessageStatus = 'received' | 'sent' | 'delivered' | 'read' | 'failed';

// ─────────────────────────────────────────────────────────────────────────────
// Interativos (botões, listas, CTA, templates)
// ─────────────────────────────────────────────────────────────────────────────

export type InteractiveType = 'buttons' | 'list' | 'cta_url' | 'template';

export interface InteractiveButtonItem {
  id: string;
  title: string;
}

export interface InteractiveListSectionItem {
  id: string;
  title: string;
  description?: string;
}

export interface InteractiveListSection {
  title: string;
  rows: InteractiveListSectionItem[];
}

export interface InteractiveButtonsPayload {
  body: string;
  footer?: string;
  buttons: InteractiveButtonItem[];
}

export interface InteractiveListPayload {
  body: string;
  footer?: string;
  buttonText: string;
  sections: InteractiveListSection[];
}

export interface InteractiveCtaUrlPayload {
  body: string;
  footer?: string;
  buttonText: string;
  url: string;
}

export interface InteractiveTemplatePayload {
  templateName: string;
  language: string;
  components?: Array<Record<string, unknown>>;
}

export type InteractivePayload =
  | ({ type: 'buttons' } & InteractiveButtonsPayload)
  | ({ type: 'list' } & InteractiveListPayload)
  | ({ type: 'cta_url' } & InteractiveCtaUrlPayload)
  | ({ type: 'template' } & InteractiveTemplatePayload);

// ─────────────────────────────────────────────────────────────────────────────
// Anexos de mídia
// ─────────────────────────────────────────────────────────────────────────────

export interface MediaAttachment {
  url?: string;
  mimeType?: string;
  fileName?: string;
  /** Caption para imagem/vídeo/documento. */
  caption?: string;
  /** Duração em segundos (audio/video). */
  durationSec?: number;
  /** Tamanho em bytes (informativo). */
  sizeBytes?: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Mensagem normalizada
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Representação canônica de uma mensagem, independente do provider.
 * É o formato usado pelo banco (`chat_messages`) e por toda a UI.
 */
export interface ChatMessage {
  /** UUID interno (preenchido após persistência). Pode ser null em parse cru. */
  id: string | null;

  /** UUID da conversa (preenchido pelo backend após match). */
  conversationId: string | null;

  /** Conteúdo textual (caption, body, ou texto puro). */
  content: string | null;

  messageType: MessageType;

  /** True quando enviada por nós (instância). */
  fromMe: boolean;

  /** JID/phone do contato remoto (sem `@s.whatsapp.net`). */
  fromJid: string;

  /** Timestamp da mensagem na fonte (UTC). */
  timestamp: Date;

  provider: ProviderType;

  /** ID nativo da mensagem no provider (idempotência). */
  providerMessageId: string;

  /** Payload original do interativo, quando aplicável. */
  interactivePayload: InteractivePayload | null;

  /** Anexo de mídia, se houver. */
  media: MediaAttachment | null;

  status: MessageStatus;

  /** Payload bruto do provider para auditoria. */
  rawPayload: Record<string, unknown>;
}

// ─────────────────────────────────────────────────────────────────────────────
// Credenciais por provider
// ─────────────────────────────────────────────────────────────────────────────

export interface EvolutionCredentials {
  type: 'evolution';
  baseUrl: string;
  apiKey: string;
  instanceName: string;
}

export interface CloudApiCredentials {
  type: 'cloud_api';
  /** Permanent or system user access token. */
  accessToken: string;
  /** Phone Number ID da Meta. */
  phoneNumberId: string;
  /** WABA ID. */
  businessAccountId: string;
  /** Token gerado pelo sistema e colado no painel da Meta para validar o handshake do webhook. */
  webhookVerifyToken?: string;
  /** App Secret para validar X-Hub-Signature-256. Opcional; quando ausente, a verificação HMAC é pulada. */
  appSecret?: string;
  /** Modo da conexão Cloud API. 'coexistence' indica que o número também está em uso no app WhatsApp Business. */
  mode?: 'standard' | 'coexistence';
}

export type ProviderCredentials = EvolutionCredentials | CloudApiCredentials;

// ─────────────────────────────────────────────────────────────────────────────
// Operações
// ─────────────────────────────────────────────────────────────────────────────

export interface ProviderStatus {
  status: ProviderConnectionStatus;
  phoneNumber: string | null;
  profileName: string | null;
  lastCheckedAt: Date;
  /** Detalhe livre do provider (state nativo, error, etc.). */
  detail?: string;
}

export interface ConnectResult {
  instanceId: string;
  phoneNumber: string | null;
  status: ProviderConnectionStatus;
  /** QR code base64 (apenas Evolution). */
  qrCode?: string;
}

export interface SendMessageResult {
  messageId: string;
  status: MessageStatus;
}

export interface SendMessageOptions {
  /** ID da mensagem a citar (reply). */
  quotedMessageId?: string;
  /** Anexo de mídia. */
  media?: MediaAttachment;
  /** Delay em ms antes do envio (Evolution). */
  delayMs?: number;
  /** "typing" antes de enviar (Evolution). */
  presence?: 'composing' | 'recording' | 'paused';
}
