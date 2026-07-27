/**
 * MessageNormalizer — converte entre o formato canônico `ChatMessage`
 * (produzido pelos providers) e a linha persistida em `chat_messages`.
 *
 * Também concentra a normalização de payloads interativos (botões/listas),
 * que chegam em formatos diferentes vindos da Evolution API e da Cloud API.
 *
 * Todos os métodos são estáticos — a classe atua como namespace utilitário.
 */

import type {
  ChatMessage,
  InteractivePayload,
  MediaAttachment,
  MessageStatus,
  MessageType,
  ProviderType,
} from '@/types/providers';

// ─────────────────────────────────────────────────────────────────────────────
// Tipos auxiliares
// ─────────────────────────────────────────────────────────────────────────────

/** Subset mínimo de uma conversa exigido pelo normalizador. */
export interface ConversationContext {
  id: string;
  company_id?: string | null;
  instance_id?: string | null;
  instance_name?: string | null;
  remote_jid?: string | null;
  phone?: string | null;
}

/** Linha pronta para `supabase.from('chat_messages').insert(...)`. */
export interface NormalizedMessageRow {
  conversation_id: string;
  company_id: string | null;
  instance_id: string | null;
  remote_jid: string | null;
  provider: ProviderType;
  provider_message_id: string;
  message_id: string;
  content: string | null;
  message_type: MessageType;
  from_me: boolean;
  status: MessageStatus;
  timestamp: string; // ISO
  webhook_received_at: string; // ISO
  interactive_payload: InteractivePayload | null;
  provider_raw_payload: Record<string, unknown>;
  media_url: string | null;
  media_mimetype: string | null;
  file_name: string | null;
  duration: number | null;
}

/** Forma canônica de botão extraída de um template/interactive. */
export interface NormalizedButton {
  type: 'button' | 'cta_url';
  display_text: string;
  url?: string;
  id?: string;
}

/** Forma canônica de item de lista. */
export interface NormalizedListItem {
  id: string;
  title: string;
  description?: string;
}

/** Linha vinda do banco — apenas os campos relevantes (resto é ignorado). */
export interface DbMessageRow {
  id?: string | null;
  conversation_id?: string | null;
  remote_jid?: string | null;
  provider?: ProviderType | null;
  provider_message_id?: string | null;
  message_id?: string | null;
  content?: string | null;
  message_type?: MessageType | null;
  from_me?: boolean | null;
  status?: MessageStatus | null;
  timestamp?: string | Date | null;
  interactive_payload?: InteractivePayload | null;
  provider_raw_payload?: Record<string, unknown> | null;
  media_url?: string | null;
  media_mimetype?: string | null;
  file_name?: string | null;
  duration?: number | null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Classe
// ─────────────────────────────────────────────────────────────────────────────

export class MessageNormalizer {
  private constructor() {
    /* singleton-ish: apenas métodos estáticos */
  }

  // ── chatMessage → linha do banco ────────────────────────────────────────

  /**
   * Enriquece o ChatMessage parseado pelo provider com dados da conversa
   * e devolve um objeto pronto para ser persistido em `chat_messages`.
   */
  static normalizeMessage(
    chatMessage: ChatMessage,
    conversation: ConversationContext,
  ): NormalizedMessageRow {
    if (!conversation?.id) {
      throw new Error('[MessageNormalizer] conversation.id é obrigatório.');
    }
    if (!chatMessage) {
      throw new Error('[MessageNormalizer] chatMessage é obrigatório.');
    }
    if (!chatMessage.providerMessageId) {
      throw new Error('[MessageNormalizer] chatMessage.providerMessageId ausente — impossível garantir idempotência.');
    }
    if (!chatMessage.provider) {
      throw new Error('[MessageNormalizer] chatMessage.provider ausente.');
    }

    const ts = MessageNormalizer.ensureValidDate(chatMessage.timestamp, 'timestamp');

    // Validação de conteúdo: para tipos textuais o content não pode ficar vazio.
    if (chatMessage.messageType === 'text' && !MessageNormalizer.hasText(chatMessage.content)) {
      console.warn(
        '[MessageNormalizer] mensagem text sem content — provider=%s id=%s',
        chatMessage.provider,
        chatMessage.providerMessageId,
      );
    }

    // Para interactive/template, exigimos um payload — caso contrário, downgrade.
    let interactive = chatMessage.interactivePayload;
    let messageType: MessageType = chatMessage.messageType;
    if ((messageType === 'interactive' || messageType === 'template') && !interactive) {
      console.warn(
        '[MessageNormalizer] mensagem %s sem interactive_payload — degradando para "text"/"unknown" (provider=%s id=%s)',
        messageType,
        chatMessage.provider,
        chatMessage.providerMessageId,
      );
      messageType = MessageNormalizer.hasText(chatMessage.content) ? 'text' : 'unknown';
      interactive = null;
    }

    const media = chatMessage.media ?? null;

    return {
      conversation_id: conversation.id,
      company_id: conversation.company_id ?? null,
      instance_id: conversation.instance_id ?? null,
      remote_jid: chatMessage.fromJid ?? conversation.remote_jid ?? null,
      provider: chatMessage.provider,
      provider_message_id: chatMessage.providerMessageId,
      message_id: chatMessage.providerMessageId,
      content: chatMessage.content ?? null,
      message_type: messageType,
      from_me: Boolean(chatMessage.fromMe),
      status: chatMessage.status ?? 'received',
      timestamp: ts.toISOString(),
      webhook_received_at: new Date().toISOString(),
      interactive_payload: interactive,
      provider_raw_payload: chatMessage.rawPayload ?? {},
      media_url: media?.url ?? null,
      media_mimetype: media?.mimeType ?? null,
      file_name: media?.fileName ?? null,
      duration: media?.durationSec ?? null,
    };
  }

  // ── linha do banco → ChatMessage ────────────────────────────────────────

  /**
   * Reverso de `normalizeMessage`: transforma uma linha de `chat_messages`
   * (ou subset equivalente) em `ChatMessage` para uso na UI.
   */
  static denormalizeMessage(dbMessage: DbMessageRow): ChatMessage {
    if (!dbMessage) {
      throw new Error('[MessageNormalizer] dbMessage é obrigatório.');
    }

    const provider = (dbMessage.provider ?? 'evolution') as ProviderType;
    const providerMessageId =
      dbMessage.provider_message_id ?? dbMessage.message_id ?? '';

    const ts = dbMessage.timestamp
      ? MessageNormalizer.ensureValidDate(dbMessage.timestamp, 'timestamp')
      : new Date();

    const media: MediaAttachment | null = dbMessage.media_url || dbMessage.media_mimetype
      ? {
          url: dbMessage.media_url ?? undefined,
          mimeType: dbMessage.media_mimetype ?? undefined,
          fileName: dbMessage.file_name ?? undefined,
          durationSec: dbMessage.duration ?? undefined,
        }
      : null;

    return {
      id: dbMessage.id ?? null,
      conversationId: dbMessage.conversation_id ?? null,
      content: dbMessage.content ?? null,
      messageType: (dbMessage.message_type ?? 'unknown') as MessageType,
      fromMe: Boolean(dbMessage.from_me),
      fromJid: dbMessage.remote_jid ?? '',
      timestamp: ts,
      provider,
      providerMessageId,
      interactivePayload: dbMessage.interactive_payload ?? null,
      media,
      status: (dbMessage.status ?? 'received') as MessageStatus,
      rawPayload: dbMessage.provider_raw_payload ?? {},
    };
  }

  // ── Botões e listas ─────────────────────────────────────────────────────

  /**
   * Normaliza botões vindos de templates / interactive payloads dos dois
   * providers para um formato único consumido pela UI.
   *
   * Formatos aceitos:
   *  - InteractivePayload `{ type: 'buttons', buttons: [{id, title}] }`
   *  - InteractivePayload `{ type: 'cta_url', buttonText, url }`
   *  - Evolution `templateButtons: [{ buttonText, url, type }]`
   *  - Cloud API template `components[].buttons[{ type, text, url }]`
   */
  static extractButtonsFromTemplate(templateData: unknown): NormalizedButton[] {
    if (!templateData) return [];
    const out: NormalizedButton[] = [];

    // Caso 1: já é um InteractivePayload canônico.
    if (typeof templateData === 'object' && templateData !== null && 'type' in templateData) {
      const ip = templateData as InteractivePayload;
      if (ip.type === 'buttons') {
        for (const b of ip.buttons ?? []) {
          if (b?.title) out.push({ type: 'button', display_text: b.title, id: b.id });
        }
        return out;
      }
      if (ip.type === 'cta_url') {
        out.push({ type: 'cta_url', display_text: ip.buttonText, url: ip.url });
        return out;
      }
    }

    // Caso 2: array genérico (templateButtons da Evolution).
    if (Array.isArray(templateData)) {
      for (const raw of templateData) {
        const btn = MessageNormalizer.normalizeRawButton(raw);
        if (btn) out.push(btn);
      }
      return out;
    }

    // Caso 3: payload Cloud API completo `{ components: [...] }`.
    if (typeof templateData === 'object' && templateData !== null) {
      const obj = templateData as Record<string, unknown>;
      const components = Array.isArray(obj.components) ? (obj.components as Array<Record<string, unknown>>) : [];
      for (const comp of components) {
        if (comp.type === 'BUTTONS' || comp.type === 'buttons') {
          const buttons = Array.isArray(comp.buttons) ? (comp.buttons as unknown[]) : [];
          for (const raw of buttons) {
            const btn = MessageNormalizer.normalizeRawButton(raw);
            if (btn) out.push(btn);
          }
        }
      }
      // Fallback: campo `buttons` direto.
      if (out.length === 0 && Array.isArray(obj.buttons)) {
        for (const raw of obj.buttons as unknown[]) {
          const btn = MessageNormalizer.normalizeRawButton(raw);
          if (btn) out.push(btn);
        }
      }
    }

    return out;
  }

  /**
   * Normaliza items de lista vindos de payloads interativos.
   *
   * Formatos aceitos:
   *  - InteractivePayload `{ type: 'list', sections: [{ rows: [...] }] }`
   *  - Evolution `listMessage.sections`
   *  - Cloud API `interactive.action.sections[].rows[{ id, title, description }]`
   *  - Array cru de rows.
   */
  static extractListItems(listData: unknown): NormalizedListItem[] {
    if (!listData) return [];
    const out: NormalizedListItem[] = [];

    const pushRow = (raw: unknown) => {
      if (!raw || typeof raw !== 'object') return;
      const r = raw as Record<string, unknown>;
      const id = String(r.id ?? r.rowId ?? r.value ?? '').trim();
      const title = String(r.title ?? r.text ?? r.display_text ?? '').trim();
      if (!id || !title) return;
      const description = typeof r.description === 'string' ? r.description : undefined;
      out.push({ id, title, description });
    };

    // Caso 1: InteractivePayload canônico.
    if (typeof listData === 'object' && listData !== null && 'type' in listData) {
      const ip = listData as InteractivePayload;
      if (ip.type === 'list') {
        for (const section of ip.sections ?? []) {
          for (const row of section.rows ?? []) pushRow(row);
        }
        return out;
      }
    }

    // Caso 2: array cru de rows.
    if (Array.isArray(listData)) {
      for (const r of listData) pushRow(r);
      return out;
    }

    // Caso 3: objeto com `sections`.
    if (typeof listData === 'object' && listData !== null) {
      const obj = listData as Record<string, unknown>;
      const sections = Array.isArray(obj.sections) ? (obj.sections as Array<Record<string, unknown>>) : [];
      for (const section of sections) {
        const rows = Array.isArray(section.rows) ? (section.rows as unknown[]) : [];
        for (const r of rows) pushRow(r);
      }
      // Fallback: rows no nível raiz.
      if (out.length === 0 && Array.isArray(obj.rows)) {
        for (const r of obj.rows as unknown[]) pushRow(r);
      }
    }

    return out;
  }

  // ── Helpers ─────────────────────────────────────────────────────────────

  private static normalizeRawButton(raw: unknown): NormalizedButton | null {
    if (!raw || typeof raw !== 'object') return null;
    const b = raw as Record<string, unknown>;

    const display =
      (b.display_text as string | undefined) ??
      (b.displayText as string | undefined) ??
      (b.text as string | undefined) ??
      (b.title as string | undefined) ??
      (b.buttonText as string | undefined) ??
      ((b.reply as Record<string, unknown> | undefined)?.title as string | undefined);

    if (!display || typeof display !== 'string') return null;

    const url =
      (b.url as string | undefined) ??
      ((b.urlButton as Record<string, unknown> | undefined)?.url as string | undefined);

    const id =
      (b.id as string | undefined) ??
      (b.payload as string | undefined) ??
      ((b.reply as Record<string, unknown> | undefined)?.id as string | undefined);

    const typeRaw = String(b.type ?? '').toLowerCase();
    const type: 'button' | 'cta_url' = url || typeRaw === 'url' || typeRaw === 'cta_url' ? 'cta_url' : 'button';

    const out: NormalizedButton = { type, display_text: display };
    if (url) out.url = url;
    if (id) out.id = id;
    return out;
  }

  private static hasText(content: string | null | undefined): boolean {
    return typeof content === 'string' && content.trim().length > 0;
  }

  private static ensureValidDate(value: Date | string, field: string): Date {
    const d = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(d.getTime())) {
      throw new Error(`[MessageNormalizer] ${field} inválido: ${String(value)}`);
    }
    return d;
  }
}

export default MessageNormalizer;
