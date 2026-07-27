import type { RefObject } from 'react';
import { useReplyState } from './useReplyState';
import { useReactions } from './useReactions';
import { useDeleteMessage } from './useDeleteMessage';
import { useEditMessage } from './useEditMessage';
import type { ChatMessage } from '@/hooks/useChatMessages';
import type { Conversation } from '@/hooks/useConversations';

interface Args {
  conversation: Conversation;
  isEvolutionConversation: boolean;
  updateCachedMessage: (id: string, fn: (m: ChatMessage) => ChatMessage) => void;
  removeCachedMessage: (id: string) => void;
  inputRef?: RefObject<HTMLTextAreaElement>;
}

export function useMessageInteractions({
  conversation,
  isEvolutionConversation,
  updateCachedMessage,
  removeCachedMessage,
  inputRef,
}: Args) {
  const reply = useReplyState(inputRef);
  const { handleReact } = useReactions({
    conversation,
    isEvolutionConversation,
    updateCachedMessage,
  });
  const { handleDeleteMessage } = useDeleteMessage({
    conversation,
    isEvolutionConversation,
    updateCachedMessage,
    removeCachedMessage,
  });
  const { handleEditMessage } = useEditMessage({
    conversation,
    isEvolutionConversation,
    updateCachedMessage,
  });

  return {
    quotedMessage: reply.quotedMessage,
    setQuotedMessage: reply.setQuotedMessage,
    handleReply: reply.handleReply,
    clearReply: reply.clearReply,
    handleReact,
    handleDeleteMessage,
    handleEditMessage,
  };
}
