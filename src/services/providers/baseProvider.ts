/**
 * Contrato base para provedores de WhatsApp.
 *
 * Toda integração concreta (Evolution API, Cloud API, futuras) deve
 * estender `BaseProvider` e implementar os métodos abstratos. O
 * objetivo é permitir que o resto da aplicação fale com qualquer
 * provedor através da mesma interface (`IWhatsAppProvider`),
 * trabalhando sempre com a mensagem normalizada (`ChatMessage`).
 */

import type {
  ChatMessage,
  ConnectResult,
  InteractivePayload,
  ProviderCredentials,
  ProviderStatus,
  ProviderType,
  SendMessageOptions,
  SendMessageResult,
} from '@/types/providers';

// ─────────────────────────────────────────────────────────────────────────────
// Interface pública
// ─────────────────────────────────────────────────────────────────────────────

export interface IWhatsAppProvider {
  /** Identificador do provider. */
  readonly provider: ProviderType;

  /**
   * Inicializa/valida a conexão com o provider e devolve dados básicos.
   * Para Evolution pode envolver criação da instância e geração de QR;
   * para Cloud API geralmente apenas valida credenciais.
   */
  connect(credentials: ProviderCredentials): Promise<ConnectResult>;

  /** Hidrata credenciais sem I/O remoto. */
  setCredentials(credentials: ProviderCredentials): void;

  /** Encerra/desativa a sessão (logout/instance delete). */
  disconnect(): Promise<void>;

  /**
   * Envia uma mensagem (texto, mídia ou texto+mídia, conforme `options.media`).
   * @param to JID/phone do destinatário (sem `@s.whatsapp.net`).
   */
  sendMessage(
    to: string,
    content: string,
    options?: SendMessageOptions,
  ): Promise<SendMessageResult>;

  /** Envia mensagem interativa (botões, lista, CTA URL ou template). */
  sendInteractive(
    to: string,
    payload: InteractivePayload,
  ): Promise<SendMessageResult>;

  /**
   * Converte payload bruto de webhook em `ChatMessage` normalizada.
   * Retorna `null` quando o evento não é uma mensagem (ex.: ack, presence).
   */
  parseWebhookPayload(payload: unknown): ChatMessage | null;

  /**
   * Valida a assinatura do webhook recebido.
   * Cloud API usa HMAC-SHA256 (X-Hub-Signature-256). Evolution usa apiKey.
   */
  validateWebhookSignature(rawBody: string, signature: string | null): boolean;

  /** Lê o estado atual da instância/conexão. */
  getStatus(): Promise<ProviderStatus>;
}

// ─────────────────────────────────────────────────────────────────────────────
// Erros
// ─────────────────────────────────────────────────────────────────────────────

export class ProviderError extends Error {
  constructor(
    message: string,
    public readonly provider: ProviderType,
    public readonly code: string = 'PROVIDER_ERROR',
    public readonly cause?: unknown,
  ) {
    super(message);
    this.name = 'ProviderError';
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Classe abstrata
// ─────────────────────────────────────────────────────────────────────────────

export abstract class BaseProvider implements IWhatsAppProvider {
  abstract readonly provider: ProviderType;

  protected credentials: ProviderCredentials | null = null;

  // ── Implementações abstratas ──────────────────────────────────────────────
  abstract connect(credentials: ProviderCredentials): Promise<ConnectResult>;
  abstract disconnect(): Promise<void>;
  abstract sendMessage(
    to: string,
    content: string,
    options?: SendMessageOptions,
  ): Promise<SendMessageResult>;
  abstract sendInteractive(
    to: string,
    payload: InteractivePayload,
  ): Promise<SendMessageResult>;
  abstract parseWebhookPayload(payload: unknown): ChatMessage | null;
  abstract validateWebhookSignature(rawBody: string, signature: string | null): boolean;
  abstract getStatus(): Promise<ProviderStatus>;

  // ── Utilitários compartilhados ────────────────────────────────────────────

  /**
   * Define as credenciais sem realizar I/O. Útil para "hidratar" o provider
   * a partir do cache do banco sem incorrer em roundtrip extra de validação.
   * Subclasses podem sobrescrever para validar/normalizar campos.
   */
  setCredentials(credentials: ProviderCredentials): void {
    this.credentials = credentials;
  }

  /**
   * Garante que `connect` foi chamado. Subclasses chamam isso antes de
   * operar no provider remoto.
   */
  protected requireCredentials(): ProviderCredentials {
    if (!this.credentials) {
      throw new ProviderError(
        'Provider não inicializado. Chame connect() antes.',
        this.provider,
        'NOT_CONNECTED',
      );
    }
    return this.credentials;
  }

  /** Normaliza JID/telefone removendo sufixos do WhatsApp. */
  protected normalizeJid(input: string): string {
    return input
      .replace(/@s\.whatsapp\.net$/i, '')
      .replace(/@c\.us$/i, '')
      .replace(/@g\.us$/i, '')
      .replace(/\D/g, '');
  }

  /** Converte timestamp em segundos OU ms para `Date`. */
  protected toDate(input: number | string | Date | undefined | null): Date {
    if (input instanceof Date) return input;
    if (typeof input === 'string') {
      const n = Number(input);
      if (!Number.isFinite(n)) return new Date(input);
      return this.toDate(n);
    }
    if (typeof input === 'number') {
      // Heurística: < 10^12 → segundos
      const ms = input < 1e12 ? input * 1000 : input;
      return new Date(ms);
    }
    return new Date();
  }
}
