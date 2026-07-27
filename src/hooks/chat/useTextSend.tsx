import { useCallback, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useToast } from '@/hooks/use-toast';
import { ToastAction } from '@/components/ui/toast';
import { supabase } from '@/integrations/supabase/client';
import { logChatEvent } from '@/lib/chat-telemetry';
import { appendSignature } from '@/lib/agentSignature';
import { extractFunctionErrorAsync } from '@/lib/edgeError';
import type { ChatMessage } from '@/hooks/useChatMessages';
import type { ChatActionsBase } from './types';

interface Args extends ChatActionsBase {
  quotedMessage: ChatMessage | null;
  setQuotedMessage: (m: ChatMessage | null) => void;
}

const ENQUEUE_TIMEOUT_MS = 30_000;

interface QueueItem {
  msg: string;
  quoted: ChatMessage | null;
  clientId: string;
  optimisticId: string;
  optimisticMessage: ChatMessage;
}

/**
 * Envio de texto via fila persistente (`outbound_message_queue`).
 *
 * Fila local FIFO: cada chamada de `sendText` cria a bolha otimista
 * imediatamente e enfileira o disparo real. Um worker local processa
 * um item por vez, garantindo ordem no servidor (Evolution / Cloud API
 * podem reordenar quando recebem mensagens em paralelo).
 */
export function useTextSend(args: Args) {
  const {
    conversation, companyId, isEvolutionConversation, signatureCfg, agentName,
    ensureTicketReopened, addOptimisticMessage, replaceCachedMessage,
    patchConversationLocally, quotedMessage, setQuotedMessage,
  } = args;
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [sending, setSending] = useState(false);

  const queueRef = useRef<QueueItem[]>([]);
  const processingRef = useRef(false);

  const dispatchItem = useCallback(async (item: QueueItem) => {
    const { msg, quoted, clientId, optimisticId, optimisticMessage } = item;

    const reopened = await ensureTicketReopened();
    if (!reopened) {
      replaceCachedMessage(optimisticId, { ...optimisticMessage, status: 'failed' });
      return;
    }

    const provider = isEvolutionConversation ? 'evolution' : 'cloud_api';
    const quotedPayload = quoted
      ? {
          key: { remoteJid: conversation.remote_jid, fromMe: quoted.from_me, id: quoted.message_id },
          message: { conversation: quoted.content || '' },
        }
      : undefined;

    // Timeout de segurança por item.
    let failed = false;
    const failureTimer = setTimeout(() => {
      failed = true;
      replaceCachedMessage(optimisticId, { ...optimisticMessage, status: 'failed' });
      void logChatEvent({
        companyId, event: 'send_text_failed', message: 'enqueue_timeout_30s',
        metadata: { conversation_id: conversation.id, phone: conversation.phone, client_id: clientId },
      });
    }, ENQUEUE_TIMEOUT_MS);

    try {
      const { error } = await supabase.functions.invoke('enqueue-outbound-message', {
        body: {
          client_id: clientId,
          conversation_id: conversation.id,
          provider,
          payload: { text: msg, quoted: quotedPayload },
        },
      });
      clearTimeout(failureTimer);
      if (failed) return;

      if (error) {
        const message = await extractFunctionErrorAsync(error);
        const raw = message || (error as { message?: string })?.message || '';
        replaceCachedMessage(optimisticId, { ...optimisticMessage, status: 'failed' });
        queryClient.invalidateQueries({ queryKey: ['conversations', companyId, 'active'] });

        const isTokenExpired = /code=190|OAuthException|token.*(expirado|inv[áa]lido)/i.test(raw);
        if (isTokenExpired) {
          toast({
            title: 'Token da API Oficial expirou',
            description: 'Reconecte a integração da WhatsApp Cloud API para continuar enviando mensagens.',
            variant: 'destructive',
            action: (
              <ToastAction
                altText="Abrir configurações de conexões"
                onClick={() => { window.location.href = '/settings?tab=connections'; }}
              >
                Reconectar
              </ToastAction>
            ),
          });
        } else {
          const friendly = raw.replace(/^Falha ao enviar mensagem:\s*/i, '') || 'Não foi possível enfileirar a mensagem.';
          toast({ title: 'Erro ao enviar', description: friendly, variant: 'destructive' });
        }

        void logChatEvent({
          companyId, event: 'send_text_failed', message: raw || 'send_text failed',
          metadata: { conversation_id: conversation.id, phone: conversation.phone, client_id: clientId },
        });
        return;
      }

      // Sucesso: zera unread no servidor.
      void (supabase as any).rpc('mark_conversation_read', { _conversation_id: conversation.id });
    } catch (err) {
      clearTimeout(failureTimer);
      if (failed) return;
      const raw = (err as { message?: string })?.message || '';
      replaceCachedMessage(optimisticId, { ...optimisticMessage, status: 'failed' });
      toast({ title: 'Erro ao enviar', description: raw || 'Falha de rede ao enfileirar.', variant: 'destructive' });
      void logChatEvent({
        companyId, event: 'send_text_failed', message: raw || 'invoke threw',
        metadata: { conversation_id: conversation.id, phone: conversation.phone, client_id: clientId },
      });
    }
  }, [
    companyId, conversation.id, conversation.phone, conversation.remote_jid,
    ensureTicketReopened, isEvolutionConversation, queryClient, replaceCachedMessage, toast,
  ]);

  const processQueue = useCallback(async () => {
    if (processingRef.current) return;
    processingRef.current = true;
    setSending(true);
    try {
      while (queueRef.current.length > 0) {
        const item = queueRef.current.shift()!;
        await dispatchItem(item);
      }
    } finally {
      processingRef.current = false;
      setSending(false);
    }
  }, [dispatchItem]);

  const sendText = useCallback(async (rawMsg: string, onAfterSend?: () => void) => {
    if (!rawMsg.trim()) return;
    const msg = appendSignature(rawMsg.trim(), signatureCfg, agentName);
    const quoted = quotedMessage;
    setQuotedMessage(null);

    const clientId = crypto.randomUUID();
    const optimisticId = `optimistic-${clientId}`;
    const now = new Date().toISOString();
    const optimisticMessage: ChatMessage = {
      id: optimisticId,
      company_id: companyId ?? '',
      conversation_id: conversation.id,
      remote_jid: conversation.remote_jid,
      message_id: optimisticId,
      client_id: clientId,
      from_me: true,
      message_type: 'text',
      content: msg,
      media_url: null,
      media_mimetype: null,
      file_name: null,
      duration: null,
      latitude: null,
      longitude: null,
      quoted_message_id: quoted?.message_id || null,
      reaction_emoji: null,
      status: 'queued',
      sender_name: null,
      timestamp: now,
      created_at: now,
    };

    addOptimisticMessage(optimisticMessage);
    patchConversationLocally(conversation.id, {
      last_message_text: msg,
      last_message_at: now,
      closed_at: null,
      unread_count: 0,
    });
    onAfterSend?.();

    queueRef.current.push({ msg, quoted, clientId, optimisticId, optimisticMessage });
    void processQueue();

    return { ok: true as const, messageId: optimisticId, clientId };
  }, [
    signatureCfg, agentName, quotedMessage, setQuotedMessage,
    companyId, conversation.id, conversation.remote_jid,
    addOptimisticMessage, patchConversationLocally, processQueue,
  ]);

  return { sending, setSending, sendText };
}
