/**
 * CloudAPIProvider — implementação de `BaseProvider` para a WhatsApp Cloud API
 * (Meta / Graph API).
 *
 * Documentação: https://developers.facebook.com/docs/whatsapp/cloud-api
 *
 * Notas importantes:
 * - O endpoint correto é `graph.facebook.com` (NÃO `graph.instagram.com`,
 *   que pertence à Instagram Graph API). Mantemos isso fixo para evitar
 *   acidentes de configuração.
 * - Mensagens fora da janela de 24h só podem ser enviadas via templates
 *   pré-aprovados — por isso `sendInteractive` para `template` é a rota
 *   primária para iniciar conversas.
 * - Webhooks da Meta vêm assinados com `X-Hub-Signature-256: sha256=...`.
 *   Validamos com HMAC-SHA256 + comparação constant-time.
 * - O access token NUNCA é logado por inteiro: usamos `maskToken()` que
 *   exibe só os últimos 8 caracteres.
 */

import { BaseProvider, ProviderError } from './baseProvider';
import type {
  ChatMessage,
  CloudApiCredentials,
  ConnectResult,
  InteractivePayload,
  MediaAttachment,
  MessageStatus,
  MessageType,
  ProviderCredentials,
  ProviderStatus,
  ProviderType,
  SendMessageOptions,
  SendMessageResult,
} from '@/types/providers';

// ─────────────────────────────────────────────────────────────────────────────
// Tipagem da Graph API
// ─────────────────────────────────────────────────────────────────────────────

const GRAPH_API_BASE = 'https://graph.facebook.com/v18.0';
const DEFAULT_TIMEOUT_MS = 20_000;
const DEFAULT_COUNTRY_CODE = '55'; // Brasil (fallback quando número vier sem DDI)

interface CloudApiError {
  error?: {
    code?: number;
    type?: string;
    message?: string;
    error_subcode?: number;
    fbtrace_id?: string;
  };
}

interface CloudApiPhoneNumberInfo {
  id?: string;
  display_phone_number?: string;
  verified_name?: string;
  quality_rating?: string;
  code_verification_status?: string;
}

interface CloudApiSendResponse {
  messaging_product?: string;
  contacts?: Array<{ input?: string; wa_id?: string }>;
  messages?: Array<{ id?: string; message_status?: string }>;
}

// ── Webhook ──
interface CloudApiWebhookEnvelope {
  object?: string;
  entry?: CloudApiWebhookEntry[];
}

interface CloudApiWebhookEntry {
  id?: string;
  changes?: Array<{
    field?: string;
    value?: CloudApiWebhookValue;
  }>;
}

interface CloudApiWebhookValue {
  messaging_product?: string;
  metadata?: { display_phone_number?: string; phone_number_id?: string };
  contacts?: Array<{ profile?: { name?: string }; wa_id?: string }>;
  messages?: CloudApiInboundMessage[];
  statuses?: Array<{
    id?: string;
    status?: string;
    timestamp?: string;
    recipient_id?: string;
  }>;
}

interface CloudApiMediaPayload {
  id?: string;
  mime_type?: string;
  sha256?: string;
  caption?: string;
  filename?: string;
}

interface CloudApiInboundMessage {
  from?: string;
  id?: string;
  timestamp?: string;
  type?: string;
  text?: { body?: string };
  image?: CloudApiMediaPayload;
  video?: CloudApiMediaPayload;
  audio?: CloudApiMediaPayload & { voice?: boolean };
  document?: CloudApiMediaPayload;
  sticker?: CloudApiMediaPayload;
  location?: { latitude?: number; longitude?: number; name?: string; address?: string };
  contacts?: Array<{ name?: { formatted_name?: string } }>;
  reaction?: { message_id?: string; emoji?: string };
  button?: { text?: string; payload?: string };
  interactive?: {
    type?: string;
    button_reply?: { id?: string; title?: string };
    list_reply?: { id?: string; title?: string; description?: string };
  };
  context?: { from?: string; id?: string };
}

// ─────────────────────────────────────────────────────────────────────────────
// Provider
// ─────────────────────────────────────────────────────────────────────────────

export class CloudAPIProvider extends BaseProvider {
  readonly provider: ProviderType = 'cloud_api';

  protected credentials: CloudApiCredentials | null = null;

  constructor(credentials?: CloudApiCredentials) {
    super();
    if (credentials) this.credentials = credentials;
  }

  // ── Conexão ──────────────────────────────────────────────────────────────

  async connect(credentials: ProviderCredentials): Promise<ConnectResult> {
    if (credentials.type !== 'cloud_api') {
      throw new ProviderError(
        `Credenciais incompatíveis: esperado "cloud_api", recebido "${credentials.type}".`,
        this.provider,
        'INVALID_CREDENTIALS',
      );
    }
    this.credentials = credentials;

    const info = await this.request<CloudApiPhoneNumberInfo>(
      'GET',
      `/${encodeURIComponent(credentials.phoneNumberId)}`,
    );

    if (!info.id) {
      throw new ProviderError(
        'Cloud API: phoneNumberId inválido ou sem permissão.',
        this.provider,
        'INVALID_PHONE_NUMBER_ID',
      );
    }

    return {
      instanceId: credentials.phoneNumberId,
      phoneNumber: this.cleanDisplayPhone(info.display_phone_number),
      status: 'connected',
    };
  }

  async disconnect(): Promise<void> {
    // Cloud API não tem "logout" — o token é revogado no Meta Business Suite.
    console.info(
      `[CloudAPIProvider] disconnect() é no-op. Revogue o token (...${this.maskToken()}) no painel da Meta para encerrar.`,
    );
  }

  // ── Envio ────────────────────────────────────────────────────────────────

  async sendMessage(
    to: string,
    content: string,
    options: SendMessageOptions = {},
  ): Promise<SendMessageResult> {
    const creds = this.requireCloudCredentials();
    const recipient = this.normalizePhoneE164(to);

    const body: Record<string, unknown> = {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: recipient,
    };

    if (options.media) {
      body.type = this.mediaTypeKey(options.media);
      body[body.type as string] = this.buildMediaBody(options.media, content);
    } else {
      body.type = 'text';
      body.text = { preview_url: true, body: content };
    }

    if (options.quotedMessageId) {
      body.context = { message_id: options.quotedMessageId };
    }

    const res = await this.request<CloudApiSendResponse>(
      'POST',
      `/${encodeURIComponent(creds.phoneNumberId)}/messages`,
      body,
    );

    const messageId = res.messages?.[0]?.id ?? '';
    if (!messageId) {
      throw new ProviderError(
        'Cloud API não retornou message id no envio.',
        this.provider,
        'NO_MESSAGE_ID',
      );
    }
    return { messageId, status: 'sent' };
  }

  async sendInteractive(
    to: string,
    payload: InteractivePayload,
  ): Promise<SendMessageResult> {
    const creds = this.requireCloudCredentials();
    const recipient = this.normalizePhoneE164(to);

    let body: Record<string, unknown>;

    switch (payload.type) {
      case 'template': {
        body = {
          messaging_product: 'whatsapp',
          to: recipient,
          type: 'template',
          template: {
            name: payload.templateName,
            language: { code: payload.language },
            components: payload.components ?? [],
          },
        };
        break;
      }
      case 'buttons': {
        body = {
          messaging_product: 'whatsapp',
          recipient_type: 'individual',
          to: recipient,
          type: 'interactive',
          interactive: {
            type: 'button',
            body: { text: payload.body },
            footer: payload.footer ? { text: payload.footer } : undefined,
            action: {
              buttons: payload.buttons.slice(0, 3).map((b) => ({
                type: 'reply',
                reply: { id: b.id, title: b.title.slice(0, 20) },
              })),
            },
          },
        };
        break;
      }
      case 'list': {
        body = {
          messaging_product: 'whatsapp',
          recipient_type: 'individual',
          to: recipient,
          type: 'interactive',
          interactive: {
            type: 'list',
            body: { text: payload.body },
            footer: payload.footer ? { text: payload.footer } : undefined,
            action: {
              button: payload.buttonText.slice(0, 20),
              sections: payload.sections.map((s) => ({
                title: s.title.slice(0, 24),
                rows: s.rows.map((r) => ({
                  id: r.id,
                  title: r.title.slice(0, 24),
                  description: r.description?.slice(0, 72),
                })),
              })),
            },
          },
        };
        break;
      }
      case 'cta_url': {
        body = {
          messaging_product: 'whatsapp',
          recipient_type: 'individual',
          to: recipient,
          type: 'interactive',
          interactive: {
            type: 'cta_url',
            body: { text: payload.body },
            footer: payload.footer ? { text: payload.footer } : undefined,
            action: {
              name: 'cta_url',
              parameters: { display_text: payload.buttonText, url: payload.url },
            },
          },
        };
        break;
      }
      default: {
        const exhaustive: never = payload;
        throw new ProviderError(
          `Tipo interativo não suportado: ${JSON.stringify(exhaustive)}`,
          this.provider,
          'UNSUPPORTED_INTERACTIVE',
        );
      }
    }

    const res = await this.request<CloudApiSendResponse>(
      'POST',
      `/${encodeURIComponent(creds.phoneNumberId)}/messages`,
      body,
    );
    const messageId = res.messages?.[0]?.id ?? '';
    if (!messageId) {
      throw new ProviderError(
        'Cloud API não retornou message id no interativo.',
        this.provider,
        'NO_MESSAGE_ID',
      );
    }
    return { messageId, status: 'sent' };
  }

  // ── Webhook ──────────────────────────────────────────────────────────────

  parseWebhookPayload(payload: unknown): ChatMessage | null {
    try {
      const envelope = (payload ?? {}) as CloudApiWebhookEnvelope;
      const value = envelope.entry?.[0]?.changes?.[0]?.value;
      if (!value) return null;

      const msg = value.messages?.[0];
      if (!msg || !msg.id || !msg.from) return null;

      const parsed = this.extractInboundContent(msg);
      if (!parsed) return null;

      return {
        id: null,
        conversationId: null,
        content: parsed.content,
        messageType: parsed.messageType,
        fromMe: false, // Cloud API webhooks nunca incluem mensagens nossas
        fromJid: this.normalizeJid(msg.from),
        timestamp: this.toDate(msg.timestamp),
        provider: this.provider,
        providerMessageId: msg.id,
        interactivePayload: null,
        media: parsed.media,
        status: 'received' as MessageStatus,
        rawPayload: msg as unknown as Record<string, unknown>,
      };
    } catch (err) {
      console.error('[CloudAPIProvider] parseWebhookPayload error:', err);
      return null;
    }
  }

  validateWebhookSignature(rawBody: string, signature: string | null): boolean {
    const creds = this.credentials;
    if (!creds || !signature || !creds.appSecret) return false;
    const expected = signature.startsWith('sha256=') ? signature.slice(7) : signature;
    const digest = this.hmacSha256Hex(creds.appSecret, rawBody);
    return this.constantTimeEqualHex(digest, expected);
  }

  // ── Status ───────────────────────────────────────────────────────────────

  async getStatus(): Promise<ProviderStatus> {
    const creds = this.requireCloudCredentials();
    try {
      const info = await this.request<CloudApiPhoneNumberInfo>(
        'GET',
        `/${encodeURIComponent(creds.phoneNumberId)}`,
      );
      return {
        status: info.id ? 'connected' : 'disconnected',
        phoneNumber: this.cleanDisplayPhone(info.display_phone_number),
        profileName: info.verified_name ?? null,
        lastCheckedAt: new Date(),
        detail: info.quality_rating ?? info.code_verification_status,
      };
    } catch (err) {
      return {
        status: 'error',
        phoneNumber: null,
        profileName: null,
        lastCheckedAt: new Date(),
        detail: (err as Error)?.message,
      };
    }
  }

  // ── Helpers: parse webhook ───────────────────────────────────────────────

  private extractInboundContent(msg: CloudApiInboundMessage): {
    content: string | null;
    messageType: MessageType;
    media: MediaAttachment | null;
  } | null {
    switch (msg.type) {
      case 'text':
        return { content: msg.text?.body ?? null, messageType: 'text', media: null };
      case 'image':
        return {
          content: msg.image?.caption ?? null,
          messageType: 'image',
          media: this.toMedia(msg.image),
        };
      case 'video':
        return {
          content: msg.video?.caption ?? null,
          messageType: 'video',
          media: this.toMedia(msg.video),
        };
      case 'audio':
        return { content: null, messageType: 'audio', media: this.toMedia(msg.audio) };
      case 'document':
        return {
          content: msg.document?.caption ?? null,
          messageType: 'document',
          media: { ...this.toMedia(msg.document), fileName: msg.document?.filename },
        };
      case 'sticker':
        return { content: null, messageType: 'sticker', media: this.toMedia(msg.sticker) };
      case 'location': {
        const loc = msg.location;
        return {
          content: loc?.name ?? loc?.address ?? `${loc?.latitude},${loc?.longitude}`,
          messageType: 'location',
          media: null,
        };
      }
      case 'contacts':
        return {
          content: msg.contacts?.[0]?.name?.formatted_name ?? null,
          messageType: 'contact',
          media: null,
        };
      case 'reaction':
        return { content: msg.reaction?.emoji ?? null, messageType: 'reaction', media: null };
      case 'button':
        return { content: msg.button?.text ?? msg.button?.payload ?? null, messageType: 'interactive', media: null };
      case 'interactive': {
        const i = msg.interactive;
        if (i?.button_reply) return { content: i.button_reply.title ?? i.button_reply.id ?? null, messageType: 'interactive', media: null };
        if (i?.list_reply) return { content: i.list_reply.title ?? i.list_reply.id ?? null, messageType: 'interactive', media: null };
        return { content: null, messageType: 'interactive', media: null };
      }
      default:
        return { content: null, messageType: 'unknown', media: null };
    }
  }

  private toMedia(m: CloudApiMediaPayload | undefined): MediaAttachment | null {
    if (!m) return null;
    return {
      // A Cloud API entrega apenas o `id`; download requer chamada separada
      // (GET /{media_id}). Guardamos no fileName para o pipeline resolver.
      url: undefined,
      mimeType: m.mime_type,
      caption: m.caption,
      fileName: m.filename ?? m.id,
    };
  }

  // ── Helpers: send ────────────────────────────────────────────────────────

  private mediaTypeKey(media: MediaAttachment): 'image' | 'video' | 'audio' | 'document' {
    const mime = media.mimeType ?? '';
    if (mime.startsWith('image/')) return 'image';
    if (mime.startsWith('video/')) return 'video';
    if (mime.startsWith('audio/')) return 'audio';
    return 'document';
  }

  private buildMediaBody(media: MediaAttachment, caption: string): Record<string, unknown> {
    const body: Record<string, unknown> = {};
    if (media.url) body.link = media.url;
    if (caption) body.caption = caption;
    if (media.fileName) body.filename = media.fileName;
    return body;
  }

  // ── Helpers gerais ───────────────────────────────────────────────────────

  private requireCloudCredentials(): CloudApiCredentials {
    const c = this.requireCredentials();
    if (c.type !== 'cloud_api') {
      throw new ProviderError('Credenciais não são Cloud API.', this.provider, 'INVALID_CREDENTIALS');
    }
    return c;
  }

  /** Garante formato E.164 sem `+`, completando DDI se necessário. */
  private normalizePhoneE164(input: string): string {
    const digits = input.replace(/\D/g, '');
    if (!digits) {
      throw new ProviderError('Telefone vazio.', this.provider, 'INVALID_PHONE');
    }
    // Se vier sem DDI (ex.: 11 dígitos no Brasil), prefixa o DDI padrão.
    if (digits.length <= 11) return `${DEFAULT_COUNTRY_CODE}${digits}`;
    return digits;
  }

  private cleanDisplayPhone(value: string | undefined): string | null {
    if (!value) return null;
    const digits = value.replace(/\D/g, '');
    return digits || null;
  }

  private maskToken(): string {
    const t = this.credentials?.type === 'cloud_api' ? this.credentials.accessToken : '';
    if (!t) return '????????';
    return t.length <= 8 ? '*'.repeat(t.length) : t.slice(-8);
  }

  // ── Crypto: HMAC-SHA256 + comparação constant-time ───────────────────────

  private hmacSha256Hex(secret: string, message: string): string {
    // Browser: SubtleCrypto é assíncrono; aqui usamos uma implementação síncrona
    // pura via tiny SHA-256 + HMAC, pois `validateWebhookSignature` precisa ser
    // síncrona conforme contrato da interface. Para chamadas em Edge Function
    // (Deno) é recomendado usar `crypto.subtle` numa versão async dedicada.
    return hmacSha256HexSync(secret, message);
  }

  private constantTimeEqualHex(a: string, b: string): boolean {
    if (a.length !== b.length) return false;
    let diff = 0;
    for (let i = 0; i < a.length; i++) {
      diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
    }
    return diff === 0;
  }

  // ── HTTP ─────────────────────────────────────────────────────────────────

  /**
   * Permite ao ProviderService injetar o `instanceId` da instância salva
   * no banco. Quando presente, o proxy resolve o accessToken via banco
   * (mais seguro/atualizado) em vez de aceitar o token vindo do client.
   */
  setInstanceId(instanceId: string | null): void {
    this._instanceId = instanceId;
  }
  private _instanceId: string | null = null;

  private async request<T>(
    method: 'GET' | 'POST' | 'DELETE' | 'PUT',
    path: string,
    body?: unknown,
  ): Promise<T> {
    const creds = this.requireCloudCredentials();
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);

    try {
      // A Graph API da Meta não expõe CORS — chamadas do browser são
      // bloqueadas. Roteamos via edge function `cloud-api-proxy`, que
      // valida a sessão do usuário e repassa a chamada para o Meta.
      const { supabase } = await import('@/integrations/supabase/client');
      const { data, error } = await supabase.functions.invoke('cloud-api-proxy', {
        body: {
          path,
          method,
          body,
          // Preferencial: backend resolve accessToken via instanceId.
          // Fallback: token em memória (apenas se instanceId ausente).
          ...(this._instanceId
            ? { instanceId: this._instanceId }
            : { accessToken: creds.accessToken }),
        },
      });

      if (error) {
        const detail = (error as { message?: string })?.message ?? 'invoke_failed';
        console.error(
          `[CloudAPIProvider] proxy ${method} ${path} (token=...${this.maskToken()}): ${detail}`,
        );
        throw new ProviderError(
          `Cloud API ${method} ${path}: ${detail}`,
          this.provider,
          'PROXY_ERROR',
          error,
        );
      }

      const envelope = (data ?? {}) as { status?: number; ok?: boolean; data?: T & CloudApiError };
      const inner = envelope.data ?? ({} as T & CloudApiError);
      const httpStatus = envelope.status ?? 0;

      if (!envelope.ok || (inner && (inner as CloudApiError).error)) {
        const apiErr = (inner as CloudApiError).error;
        const detail = apiErr
          ? `code=${apiErr.code} type=${apiErr.type} msg=${apiErr.message}`
          : `HTTP ${httpStatus}`;
        console.error(
          `[CloudAPIProvider] ${method} ${path} HTTP ${httpStatus} (token=...${this.maskToken()}): ${detail}`,
        );
        // Mensagens amigáveis para erros conhecidos da Meta
        let friendly = `Cloud API ${method} ${path}: ${detail}`;
        if (apiErr?.code === 190) {
          friendly =
            'API Oficial: token de acesso expirado ou inválido. ' +
            'Reconecte a integração da WhatsApp Cloud API com um token novo.';
        } else if (apiErr?.code === 131047 || apiErr?.code === 131051) {
          friendly =
            'API Oficial: janela de 24h encerrada. ' +
            'Use uma mensagem aprovada (template) para iniciar nova conversa.';
        }
        throw new ProviderError(
          friendly,
          this.provider,
          `HTTP_${httpStatus}`,
        );
      }

      return inner as T;
    } catch (err) {
      if (err instanceof ProviderError) throw err;
      const message = (err as Error)?.message ?? 'unknown';
      console.error(`[CloudAPIProvider] ${method} ${path} falhou:`, message);
      throw new ProviderError(
        `Falha ao chamar Cloud API ${method} ${path}: ${message}`,
        this.provider,
        'NETWORK_ERROR',
        err,
      );
    } finally {
      clearTimeout(timeout);
    }
  }

  private safeJson(text: string): unknown {
    try {
      return JSON.parse(text);
    } catch {
      return null;
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// HMAC-SHA256 síncrono (implementação pura, sem dependências)
//
// Usado por `validateWebhookSignature` no browser. Em ambientes Deno/Edge,
// prefira uma versão async com `crypto.subtle`.
// ─────────────────────────────────────────────────────────────────────────────

function hmacSha256HexSync(key: string, message: string): string {
  const blockSize = 64;
  let keyBytes = utf8ToBytes(key);
  if (keyBytes.length > blockSize) keyBytes = sha256Bytes(keyBytes);
  if (keyBytes.length < blockSize) {
    const padded = new Uint8Array(blockSize);
    padded.set(keyBytes);
    keyBytes = padded;
  }
  const oKey = new Uint8Array(blockSize);
  const iKey = new Uint8Array(blockSize);
  for (let i = 0; i < blockSize; i++) {
    oKey[i] = keyBytes[i] ^ 0x5c;
    iKey[i] = keyBytes[i] ^ 0x36;
  }
  const msgBytes = utf8ToBytes(message);
  const inner = sha256Bytes(concatBytes(iKey, msgBytes));
  const outer = sha256Bytes(concatBytes(oKey, inner));
  return bytesToHex(outer);
}

function utf8ToBytes(str: string): Uint8Array {
  return new TextEncoder().encode(str);
}

function concatBytes(a: Uint8Array, b: Uint8Array): Uint8Array {
  const out = new Uint8Array(a.length + b.length);
  out.set(a, 0);
  out.set(b, a.length);
  return out;
}

function bytesToHex(bytes: Uint8Array): string {
  let hex = '';
  for (let i = 0; i < bytes.length; i++) {
    hex += bytes[i].toString(16).padStart(2, '0');
  }
  return hex;
}

// SHA-256 puro (RFC 6234). Suficiente para HMAC de webhooks.
function sha256Bytes(message: Uint8Array): Uint8Array {
  const K = new Uint32Array([
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
    0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
    0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
    0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
    0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
    0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
  ]);

  const H = new Uint32Array([
    0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19,
  ]);

  // Padding
  const bitLen = message.length * 8;
  const padLen = (message.length % 64 < 56 ? 56 : 120) - (message.length % 64);
  const padded = new Uint8Array(message.length + padLen + 8);
  padded.set(message);
  padded[message.length] = 0x80;
  // length em bits, big-endian (64 bits)
  const view = new DataView(padded.buffer);
  view.setUint32(padded.length - 4, bitLen >>> 0, false);
  view.setUint32(padded.length - 8, Math.floor(bitLen / 0x100000000), false);

  const W = new Uint32Array(64);
  for (let i = 0; i < padded.length; i += 64) {
    for (let t = 0; t < 16; t++) W[t] = view.getUint32(i + t * 4, false);
    for (let t = 16; t < 64; t++) {
      const s0 = rotr(W[t - 15], 7) ^ rotr(W[t - 15], 18) ^ (W[t - 15] >>> 3);
      const s1 = rotr(W[t - 2], 17) ^ rotr(W[t - 2], 19) ^ (W[t - 2] >>> 10);
      W[t] = (W[t - 16] + s0 + W[t - 7] + s1) >>> 0;
    }
    let [a, b, c, d, e, f, g, h] = H;
    for (let t = 0; t < 64; t++) {
      const S1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25);
      const ch = (e & f) ^ (~e & g);
      const t1 = (h + S1 + ch + K[t] + W[t]) >>> 0;
      const S0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22);
      const mj = (a & b) ^ (a & c) ^ (b & c);
      const t2 = (S0 + mj) >>> 0;
      h = g; g = f; f = e;
      e = (d + t1) >>> 0;
      d = c; c = b; b = a;
      a = (t1 + t2) >>> 0;
    }
    H[0] = (H[0] + a) >>> 0;
    H[1] = (H[1] + b) >>> 0;
    H[2] = (H[2] + c) >>> 0;
    H[3] = (H[3] + d) >>> 0;
    H[4] = (H[4] + e) >>> 0;
    H[5] = (H[5] + f) >>> 0;
    H[6] = (H[6] + g) >>> 0;
    H[7] = (H[7] + h) >>> 0;
  }

  const out = new Uint8Array(32);
  const outView = new DataView(out.buffer);
  for (let i = 0; i < 8; i++) outView.setUint32(i * 4, H[i], false);
  return out;
}

function rotr(x: number, n: number): number {
  return ((x >>> n) | (x << (32 - n))) >>> 0;
}
