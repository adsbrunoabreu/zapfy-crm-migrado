import { useCallback, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { logChatEvent } from '@/lib/chat-telemetry';
import { appendSignature } from '@/lib/agentSignature';
import { uploadProgressStore } from '@/components/chat/uploadProgressStore';
import { uploadFileWithProgress } from '@/lib/uploadFileWithProgress';
import { validateMediaFile } from '@/lib/mediaLimits';
import { extractFunctionErrorAsync } from '@/lib/edgeError';
import type { ChatMessage } from '@/hooks/useChatMessages';
import type { ChatActionsBase } from './types';

interface Args extends ChatActionsBase {
  setSending: (v: boolean) => void;
}

const ENQUEUE_TIMEOUT_MS = 15_000;

export function useFileSend(args: Args) {
  const {
    conversation, companyId, isEvolutionConversation, signatureCfg, agentName,
    ensureTicketReopened, addOptimisticMessage, replaceCachedMessage,
    patchConversationLocally, setSending,
  } = args;
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [pendingFileSending, setPendingFileSending] = useState(false);

  const addPendingFiles = useCallback((files: File[]) => {
    if (!files?.length) return;
    const valid: File[] = [];
    files.forEach((f) => {
      const v = validateMediaFile(f);
      if (!v.ok && v.error) {
        toast({ title: v.error.title, description: v.error.description, variant: 'destructive' });
        return;
      }
      valid.push(f);
    });
    if (valid.length) setPendingFiles((prev) => [...prev, ...valid]);
  }, [toast]);

  const removePendingFile = useCallback((index: number) => {
    setPendingFiles((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const renamePendingFile = useCallback((index: number, newName: string) => {
    const trimmed = newName.trim();
    if (!trimmed) return;
    setPendingFiles((prev) => prev.map((f, i) => {
      if (i !== index) return f;
      // Preserva extensão original se o usuário não digitou uma.
      const origExt = f.name.includes('.') ? f.name.slice(f.name.lastIndexOf('.')) : '';
      const hasExt = trimmed.includes('.');
      const finalName = hasExt ? trimmed : `${trimmed}${origExt}`;
      try {
        return new File([f], finalName, { type: f.type, lastModified: f.lastModified });
      } catch {
        return f;
      }
    }));
  }, []);

  const clearPendingFiles = useCallback(() => setPendingFiles([]), []);

  const uploadAndSendFile = useCallback(async (file: File, rawCaption?: string) => {
    if (!companyId) return;
    const validation = validateMediaFile(file);
    if (!validation.ok) return;
    if (!(await ensureTicketReopened())) return;

    const caption = rawCaption ? appendSignature(rawCaption, signatureCfg, agentName) : rawCaption;
    const mediatype: 'image' | 'video' | 'document' =
      validation.category === 'audio' ? 'document' : validation.category;

    const clientId = crypto.randomUUID();
    const optimisticId = `optimistic-${clientId}`;
    const now = new Date().toISOString();
    const localPreviewUrl = mediatype === 'image' || mediatype === 'video' ? URL.createObjectURL(file) : null;
    const optimisticMessage: ChatMessage = {
      id: optimisticId,
      company_id: companyId,
      conversation_id: conversation.id,
      remote_jid: conversation.remote_jid,
      message_id: optimisticId,
      client_id: clientId,
      from_me: true,
      message_type: mediatype,
      content: caption || '',
      media_url: localPreviewUrl,
      media_mimetype: file.type,
      file_name: file.name,
      duration: null,
      latitude: null,
      longitude: null,
      quoted_message_id: null,
      reaction_emoji: null,
      status: 'uploading',
      sender_name: null,
      timestamp: now,
      created_at: now,
    };
    addOptimisticMessage(optimisticMessage);
    const mediaLabel = file.type.startsWith('image/') ? '[Imagem]'
      : file.type.startsWith('video/') ? '[Vídeo]'
      : file.type.startsWith('audio/') ? '[Áudio]' : '[Arquivo]';
    patchConversationLocally(conversation.id, { last_message_text: mediaLabel, last_message_at: now, closed_at: null, unread_count: 0 });
    setSending(true);
    setPendingFileSending(true);

    try {
      const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 80);
      const storagePath = `${companyId}/outgoing/${Date.now()}-${crypto.randomUUID()}-${safeName}`;

      uploadProgressStore.set(optimisticId, 0);
      const { signedUrl, storagePath: uploadedPath } = await uploadFileWithProgress({
        bucket: 'chat-media', path: storagePath, file,
        onProgress: (pct) => uploadProgressStore.set(optimisticId, pct),
      });

      replaceCachedMessage(optimisticId, {
        ...optimisticMessage,
        media_url: signedUrl,
        media_storage_path: uploadedPath,
        status: 'sending',
      });

      setPendingFileSending(false);
      uploadProgressStore.clear(optimisticId);

      // Enfileira via outbound_message_queue (mesma idempotência do texto).
      const provider = isEvolutionConversation ? 'evolution' : 'cloud_api';
      let timer: ReturnType<typeof setTimeout> | undefined;
      const timeoutPromise = new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error('enqueue_timeout')), ENQUEUE_TIMEOUT_MS);
      });
      const invokePromise = supabase.functions.invoke('enqueue-outbound-message', {
        body: {
          client_id: clientId,
          conversation_id: conversation.id,
          provider,
          payload: {
            kind: mediatype,
            media: {
              url: signedUrl,
              mimeType: file.type,
              fileName: file.name,
              caption: caption || undefined,
            },
          },
        },
      });

      try {
        const { error } = await Promise.race([invokePromise, timeoutPromise]) as { error: { message?: string } | null };
        if (error) {
          const detail = await extractFunctionErrorAsync(error);
          throw new Error(detail);
        }
        // A fila aceitou: remove o spinner imediatamente. O realtime/polling
        // depois troca pelo registro real ou marca como failed se a fila falhar.
        replaceCachedMessage(optimisticId, {
          ...optimisticMessage,
          media_url: signedUrl,
          media_storage_path: uploadedPath,
          status: 'queued',
        });
        void (supabase as any).rpc('mark_conversation_read', { _conversation_id: conversation.id });
      } finally {
        if (timer) clearTimeout(timer);
      }
    } catch (err) {
      const error = err as { context?: { error?: string }; message?: string };
      console.error('[Chat] uploadAndSendFile error:', err);
      // NÃO remove a bolha — marca como failed (retry manual possível).
      replaceCachedMessage(optimisticId, { ...optimisticMessage, status: 'failed' });
      queryClient.invalidateQueries({ queryKey: ['conversations', companyId, 'active'] });
      const detail = error?.context?.error || error?.message || 'Não foi possível enviar o arquivo.';
      toast({ title: 'Erro ao enviar arquivo', description: String(detail).slice(0, 200), variant: 'destructive' });
      void logChatEvent({
        companyId, event: 'send_file_failed', message: String(detail).slice(0, 300),
        metadata: { conversation_id: conversation.id, file_name: file?.name, file_size: file?.size, file_type: file?.type, client_id: clientId },
      });
    } finally {
      uploadProgressStore.clear(optimisticId);
      setSending(false);
      setPendingFileSending(false);
      if (localPreviewUrl) setTimeout(() => URL.revokeObjectURL(localPreviewUrl), 5000);
    }
  }, [companyId, conversation.id, conversation.phone, conversation.remote_jid, signatureCfg, agentName, ensureTicketReopened, addOptimisticMessage, patchConversationLocally, replaceCachedMessage, queryClient, toast, isEvolutionConversation, setSending]);

  const uploadAndSendQueue = useCallback(async (
    items: { file: File; caption?: string }[],
  ) => {
    setPendingFiles([]);
    for (const it of items) {
      // sequential to keep storage/network polite and bubble order intact
      // each iteration awaits enqueue or failure before next
      // eslint-disable-next-line no-await-in-loop
      await uploadAndSendFile(it.file, it.caption);
    }
  }, [uploadAndSendFile]);

  return {
    pendingFiles,
    setPendingFiles,
    addPendingFiles,
    removePendingFile,
    renamePendingFile,
    clearPendingFiles,
    pendingFileSending,
    uploadAndSendFile,
    uploadAndSendQueue,
  };
}
