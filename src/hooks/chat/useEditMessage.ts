import { useCallback } from 'react';
import { useToast } from '@/hooks/use-toast';
import { evolutionApi } from '@/services/evolutionApi';
import { supabase } from '@/integrations/supabase/client';
import type { ChatMessage } from '@/hooks/useChatMessages';
import type { Conversation } from '@/hooks/useConversations';

interface Args {
  conversation: Conversation;
  isEvolutionConversation: boolean;
  updateCachedMessage: (id: string, fn: (m: ChatMessage) => ChatMessage) => void;
}

/** WhatsApp permite editar mensagens de texto enviadas há até 15 minutos. */
const EDIT_WINDOW_MS = 15 * 60 * 1000;

export function canEditMessage(msg: ChatMessage): boolean {
  if (!msg.from_me) return false;
  if (msg._deletedLocally) return false;
  if (msg.message_type && msg.message_type !== 'text') return false;
  if (msg.media_url || msg.media_storage_path) return false;
  const ts = msg.timestamp ? new Date(msg.timestamp).getTime() : 0;
  if (!ts) return false;
  return Date.now() - ts < EDIT_WINDOW_MS;
}

export function useEditMessage({ conversation, isEvolutionConversation, updateCachedMessage }: Args) {
  const { toast } = useToast();

  const handleEditMessage = useCallback(async (msg: ChatMessage, newText: string) => {
    const text = (newText || '').trim();
    if (!text) {
      toast({ title: 'Texto vazio', description: 'Para apagar, use a opção Apagar.', variant: 'destructive' });
      return false;
    }
    if (text === (msg.content || '').trim()) return true; // nada a fazer
    if (!isEvolutionConversation) {
      toast({ title: 'Edição indisponível', description: 'A Cloud API não suporta editar por aqui.', variant: 'destructive' });
      return false;
    }
    if (!canEditMessage(msg)) {
      toast({
        title: 'Não é possível editar',
        description: 'O WhatsApp só permite editar mensagens de texto enviadas há até 15 minutos.',
        variant: 'destructive',
      });
      return false;
    }

    const previousContent = msg.content;
    const editedAtIso = new Date().toISOString();
    // Otimista
    updateCachedMessage(msg.message_id, (item) => ({ ...item, content: text, _edited: true, edited_at: editedAtIso }));

    try {
      await evolutionApi.editMessage(conversation.remote_jid, msg.message_id, text, msg.from_me);
      // Persiste no banco para sobreviver a refresh (trigger marca edited_at e atualiza preview da conversa)
      await supabase
        .from('chat_messages')
        .update({ content: text, edited_at: editedAtIso })
        .eq('id', msg.id);
      return true;
    } catch (err: any) {
      console.error('[editMessage] failed', err);
      updateCachedMessage(msg.message_id, (item) => ({ ...item, content: previousContent, _edited: false }));
      const ctxMsg = err?.context?.error || err?.context?.message || err?.message || '';
      const isTooOld = /time|expired|too old|older|cannot|window/i.test(String(ctxMsg));
      toast({
        title: 'Erro ao editar',
        description: isTooOld
          ? 'O WhatsApp só permite editar mensagens recentes.'
          : (ctxMsg || 'Não foi possível editar a mensagem.'),
        variant: 'destructive',
      });
      return false;
    }
  }, [conversation.remote_jid, isEvolutionConversation, toast, updateCachedMessage]);

  return { handleEditMessage };
}
