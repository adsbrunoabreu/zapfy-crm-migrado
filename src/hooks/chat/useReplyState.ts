import { useCallback, useState, type RefObject } from 'react';
import type { ChatMessage } from '@/hooks/useChatMessages';

export function useReplyState(inputRef?: RefObject<HTMLTextAreaElement>) {
  const [quotedMessage, setQuotedMessage] = useState<ChatMessage | null>(null);

  const handleReply = useCallback((msg: ChatMessage) => {
    setQuotedMessage(msg);
    // Foco no chatbar imediatamente após renderizar o preview.
    requestAnimationFrame(() => {
      inputRef?.current?.focus();
    });
  }, [inputRef]);

  const clearReply = useCallback(() => {
    setQuotedMessage(null);
  }, []);

  return { quotedMessage, setQuotedMessage, handleReply, clearReply };
}
