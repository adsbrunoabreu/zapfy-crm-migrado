/**
 * ProviderService — orquestrador singleton para o sistema multi-provider
 * de WhatsApp (Evolution API + Cloud API).
 *
 * Refatorado: helpers/persistência/vault/logging extraídos para
 * `src/services/provider/*`.
 */

import { supabase } from '@/integrations/supabase/client';
import { ProviderRegistry } from './providers';
import type { IWhatsAppProvider } from './providers';
import type {
  ChatMessage,
  CloudApiCredentials,
  InteractivePayload,
  ProviderCredentials,
  ProviderType,
  SendMessageOptions,
  SendMessageResult,
} from '@/types/providers';
import { renderHsmTemplate, mediaTypeFromHeader, type HsmRendered } from '@/lib/hsm/renderTemplate';
import { mediaTypeFromMime, scrubError } from './provider/helpers';
import { safeLog } from './provider/logging';
import { decryptCredentials, encryptCredentials } from './provider/vault';
import {
  fetchInstanceById,
  fetchInstanceByName,
  persistMessage,
  upsertConversation,
  type ConversationRow,
  type InstanceRow,
} from './provider/persistence';

// ─────────────────────────────────────────────────────────────────────────────
// Tipos públicos
// ─────────────────────────────────────────────────────────────────────────────

export interface RegisterProviderResult {
  instanceId: string;
  phoneNumber: string | null;
}

export interface ProcessWebhookResult {
  message: ChatMessage;
  chatMessageId: string;
  conversationId: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Singleton
// ─────────────────────────────────────────────────────────────────────────────

class ProviderServiceClass {
  private providers = new Map<string, IWhatsAppProvider>();
  private contextCache = new Map<
    string,
    { ctx: { conversation: ConversationRow; instance: InstanceRow }; expiresAt: number }
  >();
  private static CTX_TTL_MS = 5 * 60 * 1000;

  // ── Registro / conexão ──────────────────────────────────────────────────

  async registerProvider(
    companyId: string,
    providerType: ProviderType,
    credentials: ProviderCredentials,
    options?: { displayName?: string; preferred?: boolean },
  ): Promise<RegisterProviderResult> {
    if (!companyId) throw new Error('companyId é obrigatório.');

    const provider = ProviderRegistry.create(providerType);

    let connectResult;
    try {
      connectResult = await provider.connect(credentials);
    } catch (err) {
      const message = scrubError(err);
      await safeLog({
        conversationId: null, companyId, event: 'provider.connect',
        provider: providerType, status: 'error', errorMessage: message,
      });
      throw new Error(`Falha ao conectar provider ${providerType}: ${message}`);
    }

    const encryptedConfig = await encryptCredentials(credentials);
    const instanceName = connectResult.instanceId;

    const { data, error } = await supabase
      .from('whatsapp_instances')
      .upsert(
        [{
          company_id: companyId,
          provider: providerType,
          instance_name: instanceName,
          display_name: options?.displayName ?? instanceName,
          phone_number: connectResult.phoneNumber,
          status: connectResult.status,
          is_active: true,
          is_preferred: options?.preferred ?? false,
          config: encryptedConfig as never,
          last_sync: new Date().toISOString(),
          last_error: null,
        }],
        { onConflict: 'company_id,instance_name' },
      )
      .select('id, instance_name, phone_number')
      .maybeSingle();

    if (error || !data) {
      const message = error?.message ?? 'persistência falhou';
      await safeLog({
        conversationId: null, companyId, event: 'provider.persist',
        provider: providerType, status: 'error', errorMessage: message,
      });
      throw new Error(`Falha ao salvar instância: ${message}`);
    }

    this.providers.set(data.id, provider);

    await safeLog({
      conversationId: null, companyId, event: 'provider.connect',
      provider: providerType, status: 'success',
      metadata: { instance_id: data.id, phone_number: data.phone_number },
    });

    return { instanceId: data.id, phoneNumber: data.phone_number };
  }

  async updateCloudApiCredentials(
    instanceId: string,
    patch: { accessToken: string; phoneNumberId?: string; businessAccountId?: string; appSecret?: string | null },
  ): Promise<{ phoneNumber: string | null }> {
    const instance = await fetchInstanceById(instanceId);
    if (!instance) throw new Error('Instância não encontrada.');
    if (instance.provider !== 'cloud_api') {
      throw new Error('Esta instância não é do tipo API Oficial (Cloud API).');
    }

    const current = await decryptCredentials('cloud_api', instance.config) as CloudApiCredentials;
    const next: CloudApiCredentials = {
      type: 'cloud_api',
      phoneNumberId: patch.phoneNumberId?.trim() || current.phoneNumberId,
      businessAccountId: patch.businessAccountId?.trim() || current.businessAccountId,
      accessToken: patch.accessToken.trim(),
      webhookVerifyToken: current.webhookVerifyToken,
      appSecret:
        patch.appSecret === null ? undefined : patch.appSecret?.trim() || current.appSecret,
    };

    const provider = ProviderRegistry.create('cloud_api');
    let connectResult;
    try {
      connectResult = await provider.connect(next);
    } catch (err) {
      throw new Error(`Token inválido: ${scrubError(err)}`);
    }

    const encryptedConfig = await encryptCredentials(next);
    const { error } = await supabase
      .from('whatsapp_instances')
      .update({
        config: encryptedConfig as never,
        status: connectResult.status ?? 'connected',
        last_error: null,
        last_sync: new Date().toISOString(),
        phone_number: connectResult.phoneNumber ?? instance.phone_number ?? null,
      })
      .eq('id', instance.id);

    if (error) throw new Error(`Falha ao salvar credenciais: ${error.message}`);

    this.invalidate(instance.id);

    await safeLog({
      conversationId: null, companyId: instance.company_id, event: 'provider.reconnect',
      provider: 'cloud_api', status: 'success', metadata: { instance_id: instance.id },
    });

    return { phoneNumber: connectResult.phoneNumber ?? null };
  }

  // ── Envio ────────────────────────────────────────────────────────────────

  async sendMessage(
    conversationId: string,
    content: string,
    options?: SendMessageOptions,
  ): Promise<SendMessageResult> {
    const ctx = await this.loadConversationContext(conversationId);
    return this.executeSend(
      ctx,
      async (provider) => {
        const target = ctx.conversation.phone ?? ctx.conversation.remote_jid ?? '';
        return provider.sendMessage(target, content, options);
      },
      content,
      {
        messageType: options?.media ? mediaTypeFromMime(options.media.mimeType) : 'text',
        mediaUrl: options?.media?.url ?? null,
        mediaMimetype: options?.media?.mimeType ?? null,
        fileName: options?.media?.fileName ?? null,
      },
    );
  }

  async sendInteractive(
    conversationId: string,
    payload: InteractivePayload,
  ): Promise<SendMessageResult> {
    const ctx = await this.loadConversationContext(conversationId);

    let displayContent = `[interactive:${payload.type}]`;
    let linkPreview: Record<string, unknown> | null = null;
    let messageType = 'interactive';
    let mediaUrl: string | null = null;
    let mediaMimetype: string | null = null;

    if (payload.type === 'template') {
      let rendered: HsmRendered | null = null;
      try {
        rendered = await renderHsmTemplate(
          ctx.conversation.company_id,
          payload.templateName,
          payload.language,
          payload.components,
        );
      } catch (e) {
        console.warn('[ProviderService] falha ao renderizar HSM:', (e as Error)?.message);
      }
      displayContent = rendered?.body || `[Template: ${payload.templateName}]`;
      const headerInfo = mediaTypeFromHeader(rendered?.header ?? null);
      mediaUrl = headerInfo.mediaUrl;
      linkPreview = {
        type: 'template',
        name: payload.templateName,
        language: payload.language,
        header: rendered?.header ?? null,
        body: rendered?.body ?? null,
        footer: rendered?.footer ?? null,
        buttons: rendered?.buttons ?? [],
      };
    } else if (payload.type === 'buttons') {
      displayContent = payload.body || displayContent;
      linkPreview = {
        type: 'buttons',
        body: payload.body,
        footer: payload.footer ?? null,
        buttons: (payload.buttons ?? []).map((b: any) => ({
          type: b.type ?? 'quick_reply',
          display_text: b.display_text ?? b.title ?? '',
          id: b.id ?? null,
        })),
      };
    } else if (payload.type === 'list') {
      displayContent = payload.body || displayContent;
      linkPreview = {
        type: 'list',
        body: payload.body,
        footer: payload.footer ?? null,
        button_text: payload.buttonText,
        sections: (payload.sections ?? []).map((s) => ({
          title: s.title,
          rows: (s.rows ?? []).map((r) => ({ id: r.id, title: r.title, description: r.description ?? null })),
        })),
      };
    } else if (payload.type === 'cta_url') {
      displayContent = payload.body || displayContent;
      linkPreview = {
        type: 'buttons',
        body: payload.body,
        footer: payload.footer ?? null,
        buttons: [{ type: 'cta_url', display_text: payload.buttonText, url: payload.url }],
      };
    }

    return this.executeSend(
      ctx,
      async (provider) => {
        const target = ctx.conversation.phone ?? ctx.conversation.remote_jid ?? '';
        return provider.sendInteractive(target, payload);
      },
      displayContent,
      { messageType, mediaUrl, mediaMimetype, linkPreview },
    );
  }

  // ── Webhook ──────────────────────────────────────────────────────────────

  async processWebhook(
    providerType: ProviderType,
    rawPayload: unknown,
    instanceId: string,
  ): Promise<ProcessWebhookResult | null> {
    const instance = await fetchInstanceById(instanceId);
    if (!instance) {
      console.error('[ProviderService] webhook para instance inexistente:', instanceId);
      return null;
    }

    await safeLog({
      conversationId: null, companyId: instance.company_id, event: 'webhook.received',
      provider: providerType, status: 'success', metadata: { instance_id: instanceId },
    });

    const provider = await this.getProvider(instanceId);

    let parsed: ChatMessage | null = null;
    try {
      parsed = provider.parseWebhookPayload(rawPayload);
    } catch (err) {
      const message = scrubError(err);
      await safeLog({
        conversationId: null, companyId: instance.company_id, event: 'webhook.parse',
        provider: providerType, status: 'error', errorMessage: message,
      });
      return null;
    }

    if (!parsed) {
      await safeLog({
        conversationId: null, companyId: instance.company_id, event: 'webhook.parse',
        provider: providerType, status: 'warning',
        errorMessage: 'evento ignorado (sem payload de mensagem)',
      });
      return null;
    }

    try {
      const conversation = await upsertConversation(instance, parsed);
      const chatMessageId = await persistMessage(instance, conversation.id, parsed);

      await safeLog({
        conversationId: conversation.id, companyId: instance.company_id,
        event: 'webhook.persisted', provider: providerType, status: 'success',
        providerEventId: parsed.providerMessageId, messageContent: parsed.content,
        metadata: { chat_message_id: chatMessageId, message_type: parsed.messageType },
      });

      return {
        message: { ...parsed, id: chatMessageId, conversationId: conversation.id },
        chatMessageId,
        conversationId: conversation.id,
      };
    } catch (err) {
      const message = scrubError(err);
      await safeLog({
        conversationId: null, companyId: instance.company_id, event: 'webhook.persist',
        provider: providerType, status: 'error',
        providerEventId: parsed.providerMessageId, errorMessage: message,
      });
      return null;
    }
  }

  // ── Provider cache ───────────────────────────────────────────────────────

  async getProvider(instanceId: string): Promise<IWhatsAppProvider> {
    const cached = this.providers.get(instanceId);
    if (cached) return cached;

    const instance = await fetchInstanceById(instanceId);
    if (!instance) throw new Error(`Instância ${instanceId} não encontrada.`);

    const credentials = await decryptCredentials(instance.provider, instance.config);
    const provider = ProviderRegistry.create(instance.provider);
    // Hidrata sem roundtrip extra na Evolution.
    provider.setCredentials(credentials);
    // Para Cloud API: informa o instanceId para que o proxy resolva o token no banco.
    const maybeSetInstance = (provider as unknown as { setInstanceId?: (id: string) => void }).setInstanceId;
    if (instance.provider === 'cloud_api' && typeof maybeSetInstance === 'function') {
      maybeSetInstance.call(provider, instance.id);
    }
    this.providers.set(instanceId, provider);
    return provider;
  }

  invalidate(instanceId?: string): void {
    if (instanceId) {
      this.providers.delete(instanceId);
      for (const [convId, entry] of this.contextCache) {
        if (entry.ctx.instance.id === instanceId) this.contextCache.delete(convId);
      }
    } else {
      this.providers.clear();
      this.contextCache.clear();
    }
  }

  // ── Internos ─────────────────────────────────────────────────────────────

  private async executeSend(
    ctx: { conversation: ConversationRow; instance: InstanceRow },
    runner: (provider: IWhatsAppProvider) => Promise<SendMessageResult>,
    contentForLog: string,
    persistInfo?: {
      messageType?: string;
      mediaUrl?: string | null;
      mediaMimetype?: string | null;
      fileName?: string | null;
      linkPreview?: Record<string, unknown> | null;
    },
  ): Promise<SendMessageResult> {
    const { conversation, instance } = ctx;
    // Guarda de fila por canal
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { data: ok } = await supabase.rpc('user_has_instance_access', {
          _user_id: user.id,
          _instance_id: instance.id,
        });
        if (ok === false) {
          throw new Error('Você não está atribuído a este canal. Peça ao administrador para vinculá-lo em Configurações → Conexões.');
        }
      }
    } catch (e: any) {
      if (e?.message?.includes('não está atribuído')) throw e;
    }

    try {
      const provider = await this.getProvider(instance.id);
      const result = await runner(provider);

      // Cloud API: persistir chat_messages no envio (Meta não entrega echo).
      if (instance.provider === 'cloud_api' && result.messageId) {
        const nowIso = new Date().toISOString();
        try {
          await supabase
            .from('conversations')
            .update({ last_message_text: contentForLog, last_message_at: nowIso })
            .eq('id', conversation.id);

          await supabase
            .from('chat_messages')
            .upsert(
              [{
                company_id: conversation.company_id,
                conversation_id: conversation.id,
                remote_jid: conversation.remote_jid,
                message_id: result.messageId,
                provider: 'cloud_api',
                provider_message_id: result.messageId,
                webhook_received_at: nowIso,
                from_me: true,
                message_type: persistInfo?.messageType ?? 'text',
                content: contentForLog,
                media_url: persistInfo?.mediaUrl ?? null,
                media_mimetype: persistInfo?.mediaMimetype ?? null,
                file_name: persistInfo?.fileName ?? null,
                link_preview: (persistInfo?.linkPreview ?? null) as any,
                status: result.status ?? 'sent',
                timestamp: nowIso,
              }],
              { onConflict: 'company_id,message_id' },
            );
        } catch (persistErr) {
          console.warn('[ProviderService] falha ao persistir chat_message Cloud API:', (persistErr as Error)?.message);
        }
      }

      void safeLog({
        conversationId: conversation.id, companyId: conversation.company_id,
        event: 'message.sent', provider: instance.provider, status: 'success',
        providerEventId: result.messageId, messageContent: contentForLog,
        metadata: { instance_id: instance.id, status: result.status },
      });

      return result;
    } catch (err) {
      const message = scrubError(err);
      if (/HTTP_(401|403|404)/.test(message) || /NOT_CONNECTED/.test(message)) {
        this.invalidate(instance.id);
      }
      if (instance.provider === 'cloud_api' && /token.*(expirado|inválido|invalido)|OAuthException|code=190/i.test(message)) {
        try {
          await supabase
            .from('whatsapp_instances')
            .update({ status: 'disconnected', last_error: 'Token expirado/inválido (Meta OAuthException 190)' })
            .eq('id', instance.id);
        } catch { /* best-effort */ }
      }
      void safeLog({
        conversationId: conversation.id, companyId: conversation.company_id,
        event: 'message.sent', provider: instance.provider, status: 'error',
        errorMessage: message, messageContent: contentForLog,
        metadata: { instance_id: instance.id },
      });
      throw new Error(`Falha ao enviar mensagem: ${message}`);
    }
  }

  private async loadConversationContext(conversationId: string): Promise<{
    conversation: ConversationRow;
    instance: InstanceRow;
  }> {
    const cached = this.contextCache.get(conversationId);
    if (cached && cached.expiresAt > Date.now()) return cached.ctx;

    const { data: conv, error } = await supabase
      .from('conversations')
      .select('id, company_id, instance_id, instance_name, remote_jid, phone, provider')
      .eq('id', conversationId)
      .maybeSingle();

    if (error || !conv) throw new Error(`Conversa ${conversationId} não encontrada.`);

    const instance = conv.instance_id
      ? await fetchInstanceById(conv.instance_id)
      : await fetchInstanceByName(conv.company_id, conv.instance_name ?? '');

    if (!instance) throw new Error('Instância da conversa não encontrada ou inativa.');

    const ctx = { conversation: conv as ConversationRow, instance };
    this.contextCache.set(conversationId, {
      ctx,
      expiresAt: Date.now() + ProviderServiceClass.CTX_TTL_MS,
    });
    return ctx;
  }
}

export const ProviderService = new ProviderServiceClass();
export type { ProviderServiceClass };
