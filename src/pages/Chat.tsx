import { useCallback, useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/utils';
import { useAuth } from '@/contexts/AuthContext';
import { useConversations, type Conversation } from '@/hooks/useConversations';
import { useAttendanceTicketsRealtime } from '@/hooks/useAttendanceTicketsRealtime';
import { useChatAutoRefresh } from '@/hooks/useChatAutoRefresh';
import { setActiveConversationId } from '@/hooks/useActiveConversation';
import { useSearchParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { AudioQueueProvider } from '@/components/chat/AudioQueueContext';
import { NewConversationDialog } from '@/components/chat/NewConversationDialog';
import { ConversationList } from '@/components/chat/ConversationList';
import { ChatArea, EmptyChat } from '@/components/chat/ChatArea';
import { ChatSearchPanel } from '@/components/chat/search/ChatSearchPanel';
import { SELECTED_CONV_STORAGE_KEY } from '@/components/chat/chatHelpers';
import { logConversationAccess } from '@/lib/conversationAuditLog';
import { safeStorage } from '@/lib/safeStorage';

export default function Chat() {
  const { profile } = useAuth();
  const companyId = profile?.company_id;
  const storageKey = companyId ? `${SELECTED_CONV_STORAGE_KEY}:${companyId}` : null;

  const [topSearchParams] = useSearchParams();
  const isHidden = topSearchParams.get('status') === 'hidden';
  const {
    data: conversations = [],
    isLoading,
    isError,
    error,
    refetch,
  } = useConversations({ archived: isHidden });
  useAttendanceTicketsRealtime(companyId);
  useChatAutoRefresh();
  const [selectedConversation, setSelectedConversation] = useState<Conversation | null>(null);

  useEffect(() => {
    setActiveConversationId(selectedConversation?.id ?? null);
    return () => setActiveConversationId(null);
  }, [selectedConversation?.id]);

  // Auditoria: registra a listagem inicial (uma vez por carregamento + filtro).
  const auditedRef = useRef<string | null>(null);
  useEffect(() => {
    if (isLoading) return;
    const key = `${isHidden}:${conversations.length}`;
    if (auditedRef.current === key) return;
    auditedRef.current = key;
    void logConversationAccess('list_conversations', {
      messageCount: conversations.length,
      metadata: { archived: isHidden },
    });
  }, [isLoading, isHidden, conversations.length]);

  const [searchTerm, setSearchTerm] = useState('');
  const [mobileShowChat, setMobileShowChat] = useState(false);
  const hasRestoredRef = useRef(false);

  // Reset selecionada quando troca de empresa (evita vazamento cross-tenant).
  useEffect(() => {
    setSelectedConversation(null);
    hasRestoredRef.current = false;
  }, [companyId]);

  useEffect(() => {
    if (hasRestoredRef.current) return;
    if (!conversations.length || !storageKey) return;
    const storedId = safeStorage.get(storageKey);
    if (storedId) {
      const match = conversations.find((c) => c.id === storedId);
      if (match) setSelectedConversation(match);
    }
    hasRestoredRef.current = true;
  }, [conversations, storageKey]);

  useEffect(() => {
    if (!selectedConversation) return;
    if (isLoading) return;
    const fresh = conversations.find((c) => c.id === selectedConversation.id);
    if (fresh) {
      if (fresh !== selectedConversation) setSelectedConversation(fresh);
      return;
    }
    // Conversa sumiu da lista (deletada via realtime ou trocou de filtro):
    // fecha a janela de chat e limpa estado relacionado.
    setSelectedConversation(null);
    setMobileShowChat(false);
    setJumpToMessageId(null);
    if (storageKey) safeStorage.remove(storageKey);
  }, [conversations, selectedConversation, isLoading, storageKey]);

  const handleSelectConversation = useCallback((conv: Conversation) => {
    setSelectedConversation(conv);
    setMobileShowChat(true);
    if (storageKey) safeStorage.set(storageKey, conv.id);
    void logConversationAccess('view_conversation', { conversationId: conv.id });
  }, [storageKey]);

  const handleBack = useCallback(() => setMobileShowChat(false), []);

  const [newConvOpen, setNewConvOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [jumpToMessageId, setJumpToMessageId] = useState<string | null>(null);

  const handleJumpToMessage = useCallback(async (conversationId: string, messageId: string | null) => {
    let conv = conversations.find((c) => c.id === conversationId) ?? null;
    if (!conv) {
      const { data } = await supabase
        .from('conversations')
        .select('id,company_id,instance_id,instance_name,provider,remote_jid,phone,contact_name,contact_photo_url,last_message_text,last_message_at,unread_count,is_archived,closed_at,lead_id,created_at,updated_at')
        .eq('id', conversationId)
        .maybeSingle();
      if (data) conv = data as Conversation;
    }
    if (!conv) return;
    setSelectedConversation(conv);
    setMobileShowChat(true);
    setSearchOpen(false);
    setJumpToMessageId(messageId);
    if (storageKey) safeStorage.set(storageKey, conv.id);
  }, [conversations, storageKey]);

  return (
    <AudioQueueProvider>
      <div className="h-[calc(100vh-2rem)] flex rounded-xl overflow-hidden border border-border/50 bg-background m-4">
        <div className={cn(
          'relative w-full lg:w-[300px] lg:min-w-[280px] xl:w-[340px] xl:min-w-[320px] 2xl:w-[360px] 2xl:min-w-[320px] 2xl:max-w-[400px] shrink-0',
          mobileShowChat ? 'hidden lg:flex lg:flex-col' : 'flex flex-col'
        )}>
          <ConversationList
            conversations={conversations}
            selectedId={selectedConversation?.id || null}
            onSelect={handleSelectConversation}
            searchTerm={searchTerm}
            onSearchChange={setSearchTerm}
            isLoading={isLoading}
            error={isError ? (error as Error) : null}
            onRetry={() => refetch()}
            onNewConversation={() => setNewConvOpen(true)}
            onOpenAdvancedSearch={() => setSearchOpen(true)}
          />
          <ChatSearchPanel
            open={searchOpen}
            onClose={() => setSearchOpen(false)}
            onJump={handleJumpToMessage}
          />
        </div>

        <div className={cn(
          'flex-1 min-w-0',
          !mobileShowChat ? 'hidden lg:flex lg:flex-col' : 'flex flex-col'
        )}>
          {selectedConversation ? (
            <ChatArea
              conversation={selectedConversation}
              onBack={handleBack}
              jumpToMessageId={jumpToMessageId}
              onJumpHandled={() => setJumpToMessageId(null)}
            />
          ) : (
            <EmptyChat />
          )}
        </div>
      </div>
      <NewConversationDialog
        open={newConvOpen}
        onOpenChange={(v) => setNewConvOpen(v)}
        onCreated={(conv) => handleSelectConversation(conv)}
      />
    </AudioQueueProvider>
  );
}
