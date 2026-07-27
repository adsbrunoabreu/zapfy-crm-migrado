import { useCallback } from 'react';
import { useToast } from '@/hooks/use-toast';
import { evolutionApi } from '@/services/evolutionApi';
import type { ChatMessage } from '@/hooks/useChatMessages';
import type { Conversation } from '@/hooks/useConversations';

interface Args {
  conversation: Conversation;
  isEvolutionConversation: boolean;
  updateCachedMessage: (id: string, fn: (m: ChatMessage) => ChatMessage) => void;
  removeCachedMessage: (id: string) => void;
}

export function useDeleteMessage({ conversation, isEvolutionConversation, updateCachedMessage }: Args) {
  const { toast } = useToast();

  const handleDeleteMessage = useCallback(async (msg: ChatMessage) => {
    if (!isEvolutionConversation) {
      toast({
        title: 'Exclusão indisponível',
        description: 'A Cloud API não suporta essa ação por aqui.',
        variant: 'destructive',
      });
      return;
    }

    // Snapshot para rollback em caso de falha
    const snapshot = {
      content: msg.content,
      message_type: msg.message_type,
      media_url: msg.media_url,
      media_storage_path: msg.media_storage_path,
      media_mimetype: msg.media_mimetype,
      file_name: msg.file_name,
      reaction_emoji: msg.reaction_emoji,
    };

    // Atualização otimista: marca como apagada imediatamente
    updateCachedMessage(msg.message_id, (item) => ({
      ...item,
      content: null,
      message_type: 'text',
      media_url: null,
      media_storage_path: null,
      media_mimetype: null,
      file_name: null,
      reaction_emoji: null,
      _deletedLocally: true,
    }));

    try {
      await evolutionApi.deleteMessage(conversation.remote_jid, msg.message_id, msg.from_me);
    } catch (err: any) {
      console.error('[deleteMessage] failed', err);
      // Rollback
      updateCachedMessage(msg.message_id, (item) => ({
        ...item,
        ...snapshot,
        _deletedLocally: false,
      }));
      const ctxMsg = err?.context?.error || err?.context?.message || err?.message || '';
      const isTooOld = /time|expired|too old|older|cannot/i.test(String(ctxMsg));
      toast({
        title: 'Erro ao apagar',
        description: isTooOld
          ? 'O WhatsApp só permite apagar mensagens recentes.'
          : (ctxMsg || 'Não foi possível apagar a mensagem.'),
        variant: 'destructive',
      });
    }
  }, [conversation.remote_jid, isEvolutionConversation, toast, updateCachedMessage]);

  return { handleDeleteMessage };
}
