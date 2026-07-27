/**
 * EvolutionProvider — implementação de `BaseProvider` para a Evolution API.
 *
 * Documentação de referência: https://doc.evolution-api.com/
 *
 * Notas:
 * - A Evolution autentica chamadas via header `apikey` (chave global ou da
 *   instância). Webhooks também enviam essa apikey, então a validação de
 *   assinatura é uma comparação de tokens.
 * - Todos os métodos remotos passam por `request()`, que centraliza
 *   try/catch, timeout, normalização de erro e logging.
 */

import { BaseProvider, ProviderError } from './baseProvider';
import type {
  ChatMessage,
  ConnectResult,
  EvolutionCredentials,
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
// Tipagem das respostas da Evolution
// ─────────────────────────────────────────────────────────────────────────────

interface EvolutionInstanceInfo {
  instance?: {
    instanceName?: string;
    state?: string;
    status?: string;
    owner?: string;
    wuid?: string;
    profileName?: string;
    profilePictureUrl?: string;
  };
  state?: string;
  status?: string;
  wuid?: string;
  owner?: string;
}

interface EvolutionSendResponse {
  key?: { id?: string; remoteJid?: string; fromMe?: boolean };
  message?: Record<string, unknown>;
  messageTimestamp?: number | string;
  status?: string;
}

interface EvolutionWebhookKey {
  id?: string;
  remoteJid?: string;
  fromMe?: boolean;
  participant?: string;
}

interface EvolutionWebhookMessage {
  conversation?: string;
  extendedTextMessage?: { text?: string };
  imageMessage?: EvolutionMediaMessage;
  videoMessage?: EvolutionMediaMessage;
  audioMessage?: EvolutionMediaMessage & { seconds?: number; ptt?: boolean };
  documentMessage?: EvolutionMediaMessage & { fileName?: string; title?: string };
  stickerMessage?: EvolutionMediaMessage;
  locationMessage?: { degreesLatitude?: number; degreesLongitude?: number; name?: string };
  contactMessage?: { displayName?: string; vcard?: string };
  reactionMessage?: { text?: string; key?: EvolutionWebhookKey };
  templateMessage?: Record<string, unknown>;
  buttonsResponseMessage?: { selectedButtonId?: string; selectedDisplayText?: string };
  listResponseMessage?: {
    title?: string;
    singleSelectReply?: { selectedRowId?: string };
  };
  interactiveMessage?: Record<string, unknown>;
}

interface EvolutionMediaMessage {
  url?: string;
  mimetype?: string;
  fileLength?: string | number;
  caption?: string;
  fileName?: string;
}

interface EvolutionWebhookData {
  key?: EvolutionWebhookKey;
  message?: EvolutionWebhookMessage;
  messageType?: string;
  messageTimestamp?: number | string;
  pushName?: string;
  status?: string;
  instance?: string;
  apikey?: string;
}

interface EvolutionWebhookEnvelope {
  event?: string;
  instance?: string;
  apikey?: string;
  data?: EvolutionWebhookData | EvolutionWebhookData[];
}

// ─────────────────────────────────────────────────────────────────────────────
// Provider
// ─────────────────────────────────────────────────────────────────────────────

const DEFAULT_TIMEOUT_MS = 20_000;

export class EvolutionProvider extends BaseProvider {
  readonly provider: ProviderType = 'evolution';

  protected credentials: EvolutionCredentials | null = null;

  /** Permite passar credenciais já no construtor (útil em testes). */
  constructor(credentials?: EvolutionCredentials) {
    super();
    if (credentials) this.credentials = credentials;
  }

  // ── Conexão ──────────────────────────────────────────────────────────────

  async connect(credentials: ProviderCredentials): Promise<ConnectResult> {
    if (credentials.type !== 'evolution') {
      throw new ProviderError(
        `Credenciais incompatíveis: esperado "evolution", recebido "${credentials.type}".`,
        this.provider,
        'INVALID_CREDENTIALS',
      );
    }
    this.credentials = credentials;

    const info = await this.request<EvolutionInstanceInfo>(
      'GET',
      `/instance/connectionState/${encodeURIComponent(credentials.instanceName)}`,
    ).catch(() => null);

    // Fallback para endpoints alternativos quando connectionState falha
    const data = info ?? (await this.request<EvolutionInstanceInfo>(
      'GET',
      `/instance/fetchInstances?instanceName=${encodeURIComponent(credentials.instanceName)}`,
    ));

    const state = this.extractState(data);
    const phoneNumber = this.extractPhone(data);

    return {
      instanceId: credentials.instanceName,
      phoneNumber,
      status: state === 'open' || state === 'connected' ? 'connected' : 'disconnected',
    };
  }

  async disconnect(): Promise<void> {
    const creds = this.requireEvolutionCredentials();
    try {
      await this.request<unknown>(
        'DELETE',
        `/instance/logout/${encodeURIComponent(creds.instanceName)}`,
      );
    } catch (err) {
      // Logout pode 404 se já desconectada — log e segue
      console.warn('[EvolutionProvider] disconnect falhou (ignorando):', (err as Error)?.message);
    }
  }

  // ── Envio ────────────────────────────────────────────────────────────────

  async sendMessage(
    to: string,
    content: string,
    options: SendMessageOptions = {},
  ): Promise<SendMessageResult> {
    const creds = this.requireEvolutionCredentials();
    const number = this.normalizeJid(to);

    // Mídia + caption usa endpoint específico
    if (options.media?.url) {
      return this.sendMedia(creds, number, content, options.media, options);
    }

    const body: Record<string, unknown> = {
      number,
      text: content,
      delay: options.delayMs ?? 0,
    };
    if (options.quotedMessageId) {
      body.quoted = { key: { id: options.quotedMessageId } };
    }

    const res = await this.request<EvolutionSendResponse>(
      'POST',
      `/message/sendText/${encodeURIComponent(creds.instanceName)}`,
      body,
    );

    return {
      messageId: res.key?.id ?? '',
      status: this.mapStatus(res.status, true),
    };
  }

  async sendInteractive(
    to: string,
    payload: InteractivePayload,
  ): Promise<SendMessageResult> {
    const creds = this.requireEvolutionCredentials();
    const number = this.normalizeJid(to);

    let path: string;
    let body: Record<string, unknown>;

    switch (payload.type) {
      case 'buttons': {
        path = `/message/sendButtons/${encodeURIComponent(creds.instanceName)}`;
        body = {
          number,
          title: '',
          description: payload.body,
          footer: payload.footer ?? '',
          buttons: payload.buttons.map((b) => ({
            buttonId: b.id,
            buttonText: { displayText: b.title },
            type: 1,
          })),
        };
        break;
      }
      case 'list': {
        path = `/message/sendList/${encodeURIComponent(creds.instanceName)}`;
        body = {
          number,
          title: '',
          description: payload.body,
          footerText: payload.footer ?? '',
          buttonText: payload.buttonText,
          sections: payload.sections.map((s) => ({
            title: s.title,
            rows: s.rows.map((r) => ({
              rowId: r.id,
              title: r.title,
              description: r.description ?? '',
            })),
          })),
        };
        break;
      }
      case 'cta_url': {
        // Evolution não tem CTA URL nativo; mandamos como texto + link
        return this.sendMessage(to, `${payload.body}\n\n${payload.buttonText}: ${payload.url}`);
      }
      case 'template': {
        path = `/message/sendTemplate/${encodeURIComponent(creds.instanceName)}`;
        body = {
          number,
          name: payload.templateName,
          language: payload.language,
          components: payload.components ?? [],
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

    const res = await this.request<EvolutionSendResponse>('POST', path, body);
    return {
      messageId: res.key?.id ?? '',
      status: this.mapStatus(res.status, true),
    };
  }

  private async sendMedia(
    creds: EvolutionCredentials,
    number: string,
    caption: string,
    media: MediaAttachment,
    options: SendMessageOptions,
  ): Promise<SendMessageResult> {
    const mime = media.mimeType ?? '';
    const mediatype = mime.startsWith('image/')
      ? 'image'
      : mime.startsWith('video/')
        ? 'video'
        : mime.startsWith('audio/')
          ? 'audio'
          : 'document';

    const path =
      mediatype === 'audio'
        ? `/message/sendWhatsAppAudio/${encodeURIComponent(creds.instanceName)}`
        : `/message/sendMedia/${encodeURIComponent(creds.instanceName)}`;

    const body: Record<string, unknown> =
      mediatype === 'audio'
        ? { number, audio: media.url, delay: options.delayMs ?? 0 }
        : {
            number,
            mediatype,
            mimetype: media.mimeType,
            caption,
            media: media.url,
            fileName: media.fileName,
            delay: options.delayMs ?? 0,
          };

    if (options.quotedMessageId) {
      body.quoted = { key: { id: options.quotedMessageId } };
    }

    const res = await this.request<EvolutionSendResponse>('POST', path, body);
    return {
      messageId: res.key?.id ?? '',
      status: this.mapStatus(res.status, true),
    };
  }

  // ── Webhook ──────────────────────────────────────────────────────────────

  parseWebhookPayload(payload: unknown): ChatMessage | null {
    try {
      const envelope = (payload ?? {}) as EvolutionWebhookEnvelope;
      const event = envelope.event ?? '';

      // Apenas eventos de mensagem
      if (event && !/messages\.upsert|send\.message|messages\.update/i.test(event)) {
        return null;
      }

      const dataField = Array.isArray(envelope.data) ? envelope.data[0] : envelope.data;
      if (!dataField || !dataField.message || !dataField.key) return null;

      const { key, message } = dataField;
      const providerMessageId = key.id ?? '';
      if (!providerMessageId) return null;

      const fromJid = this.normalizeJid(key.remoteJid ?? '');
      const fromMe = Boolean(key.fromMe);
      const timestamp = this.toDate(dataField.messageTimestamp);

      const parsed = this.extractMessageContent(message);
      if (!parsed) return null;

      return {
        id: null,
        conversationId: null,
        content: parsed.content,
        messageType: parsed.messageType,
        fromMe,
        fromJid,
        timestamp,
        provider: this.provider,
        providerMessageId,
        interactivePayload: null,
        media: parsed.media,
        status: this.mapStatus(dataField.status, fromMe),
        rawPayload: (dataField as unknown) as Record<string, unknown>,
      };
    } catch (err) {
      console.error('[EvolutionProvider] parseWebhookPayload error:', err);
      return null;
    }
  }

  validateWebhookSignature(_rawBody: string, signature: string | null): boolean {
    const creds = this.credentials;
    if (!creds) return false;
    if (!signature) return false;
    // Evolution envia a apikey no header (apikey ou authorization)
    return signature.trim() === creds.apiKey.trim();
  }

  // ── Status ───────────────────────────────────────────────────────────────

  async getStatus(): Promise<ProviderStatus> {
    const creds = this.requireEvolutionCredentials();
    try {
      const data = await this.request<EvolutionInstanceInfo>(
        'GET',
        `/instance/connectionState/${encodeURIComponent(creds.instanceName)}`,
      );
      const state = this.extractState(data);
      const isConnected = state === 'open' || state === 'connected';
      return {
        status: isConnected ? 'connected' : state === 'connecting' ? 'connecting' : 'disconnected',
        phoneNumber: this.extractPhone(data),
        profileName: data.instance?.profileName ?? null,
        lastCheckedAt: new Date(),
        detail: state,
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

  // ── Helpers ──────────────────────────────────────────────────────────────

  private requireEvolutionCredentials(): EvolutionCredentials {
    const c = this.requireCredentials();
    if (c.type !== 'evolution') {
      throw new ProviderError('Credenciais não são Evolution.', this.provider, 'INVALID_CREDENTIALS');
    }
    return c;
  }

  private extractState(data: EvolutionInstanceInfo | null | undefined): string {
    return (data?.instance?.state ?? data?.state ?? data?.instance?.status ?? data?.status ?? 'disconnected').toString();
  }

  private extractPhone(data: EvolutionInstanceInfo | null | undefined): string | null {
    const wuid = data?.instance?.wuid ?? data?.wuid ?? data?.instance?.owner ?? data?.owner;
    if (typeof wuid !== 'string') return null;
    return wuid.split('@')[0] || null;
  }

  private mapStatus(raw: string | undefined, fromMe: boolean): MessageStatus {
    if (!raw) return fromMe ? 'sent' : 'received';
    const s = raw.toLowerCase();
    if (s.includes('read')) return 'read';
    if (s.includes('deliv')) return 'delivered';
    if (s.includes('fail') || s.includes('error')) return 'failed';
    if (s.includes('sent') || s.includes('server_ack')) return 'sent';
    return fromMe ? 'sent' : 'received';
  }

  private extractMessageContent(message: EvolutionWebhookMessage): {
    content: string | null;
    messageType: MessageType;
    media: MediaAttachment | null;
  } | null {
    if (typeof message.conversation === 'string') {
      return { content: message.conversation, messageType: 'text', media: null };
    }
    if (message.extendedTextMessage?.text) {
      return { content: message.extendedTextMessage.text, messageType: 'text', media: null };
    }
    if (message.imageMessage) {
      return {
        content: message.imageMessage.caption ?? null,
        messageType: 'image',
        media: this.toMedia(message.imageMessage),
      };
    }
    if (message.videoMessage) {
      return {
        content: message.videoMessage.caption ?? null,
        messageType: 'video',
        media: this.toMedia(message.videoMessage),
      };
    }
    if (message.audioMessage) {
      return {
        content: null,
        messageType: 'audio',
        media: { ...this.toMedia(message.audioMessage), durationSec: message.audioMessage.seconds },
      };
    }
    if (message.documentMessage) {
      return {
        content: message.documentMessage.title ?? message.documentMessage.fileName ?? null,
        messageType: 'document',
        media: {
          ...this.toMedia(message.documentMessage),
          fileName: message.documentMessage.fileName,
        },
      };
    }
    if (message.stickerMessage) {
      return { content: null, messageType: 'sticker', media: this.toMedia(message.stickerMessage) };
    }
    if (message.locationMessage) {
      const { degreesLatitude, degreesLongitude, name } = message.locationMessage;
      return {
        content: name ?? `${degreesLatitude},${degreesLongitude}`,
        messageType: 'location',
        media: null,
      };
    }
    if (message.contactMessage) {
      return { content: message.contactMessage.displayName ?? null, messageType: 'contact', media: null };
    }
    if (message.reactionMessage) {
      return { content: message.reactionMessage.text ?? null, messageType: 'reaction', media: null };
    }
    if (message.buttonsResponseMessage) {
      return {
        content: message.buttonsResponseMessage.selectedDisplayText ?? message.buttonsResponseMessage.selectedButtonId ?? null,
        messageType: 'interactive',
        media: null,
      };
    }
    if (message.listResponseMessage) {
      return {
        content: message.listResponseMessage.title ?? message.listResponseMessage.singleSelectReply?.selectedRowId ?? null,
        messageType: 'interactive',
        media: null,
      };
    }
    if (message.templateMessage || message.interactiveMessage) {
      return { content: null, messageType: 'template', media: null };
    }
    return { content: null, messageType: 'unknown', media: null };
  }

  private toMedia(m: EvolutionMediaMessage): MediaAttachment {
    const size = m.fileLength != null ? Number(m.fileLength) : undefined;
    return {
      url: m.url,
      mimeType: m.mimetype,
      caption: m.caption,
      fileName: m.fileName,
      sizeBytes: Number.isFinite(size) ? size : undefined,
    };
  }

  // ── HTTP ─────────────────────────────────────────────────────────────────

  private async request<T>(
    method: 'GET' | 'POST' | 'DELETE' | 'PUT',
    path: string,
    body?: unknown,
  ): Promise<T> {
    const creds = this.requireEvolutionCredentials();
    const url = `${creds.baseUrl.replace(/\/$/, '')}${path}`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);

    try {
      const response = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
          apikey: creds.apiKey,
        },
        body: body !== undefined ? JSON.stringify(body) : undefined,
        signal: controller.signal,
      });

      const text = await response.text();
      const json = text ? this.safeJson(text) : null;

      if (!response.ok) {
        throw new ProviderError(
          `Evolution ${method} ${path} → HTTP ${response.status}: ${text.slice(0, 300)}`,
          this.provider,
          `HTTP_${response.status}`,
        );
      }
      return (json ?? ({} as T)) as T;
    } catch (err) {
      if (err instanceof ProviderError) throw err;
      const message = (err as Error)?.message ?? 'unknown';
      console.error(`[EvolutionProvider] ${method} ${path} falhou:`, message);
      throw new ProviderError(
        `Falha ao chamar Evolution ${method} ${path}: ${message}`,
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
