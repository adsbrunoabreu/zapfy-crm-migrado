import { useCallback } from 'react';
import { useToast } from '@/hooks/use-toast';
import { evolutionApi } from '@/services/evolutionApi';
import type { ChatMessage } from '@/hooks/useChatMessages';
import type { Conversation } from '@/hooks/useConversations';

interface Args {
  conversation: Conversation;
  isEvolutionConversation: boolean;
  updateCachedMessage: (id: string, fn: (m: ChatMessage) => ChatMessage) => void;
}

export function useReactions({ conversation, isEvolutionConversation, updateCachedMessage }: Args) {
  const { toast } = useToast();

  const handleReact = useCallback(async (msg: ChatMessage, emoji: string) => {
    if (!isEvolutionConversation) {
      toast({
        title: 'Reação indisponível',
        description: 'A Cloud API não suporta essa ação por aqui.',
        variant: 'destructive',
      });
      return;
    }
    const previousReaction = msg.reaction_emoji;
    const isRemoving = previousReaction === emoji;
    const newEmoji = isRemoving ? null : emoji;
    updateCachedMessage(msg.message_id, (item) => ({ ...item, reaction_emoji: newEmoji }));
    try {
      await evolutionApi.sendReaction(
        conversation.remote_jid,
        msg.message_id,
        isRemoving ? '' : emoji,
        msg.from_me,
      );
    } catch {
      updateCachedMessage(msg.message_id, (item) => ({ ...item, reaction_emoji: previousReaction }));
      toast({
        title: 'Erro ao reagir',
        description: 'Não foi possível enviar a reação.',
        variant: 'destructive',
      });
    }
  }, [conversation.remote_jid, isEvolutionConversation, toast, updateCachedMessage]);

  return { handleReact };
}
