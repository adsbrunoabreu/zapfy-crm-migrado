import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';

import { evolutionApi } from '@/services/evolutionApi';
import { useInstancesMap } from '@/hooks/useInstances';
import { useChatMessages } from '@/hooks/useChatMessages';
import { usePatchConversationLocally, useMarkConversationRead, type Conversation } from '@/hooks/useConversations';
import { useAttendanceSettings } from '@/hooks/useAttendanceSettings';
import { useConversationActiveTicket, useReopenTicket, useConversationTicketEvents } from '@/hooks/useAttendanceTickets';
import { validateMediaFile } from '@/lib/mediaLimits';

import { ChatLeadDrawer } from '@/components/chat/ChatLeadDrawer';
import { ConversationActionBar } from '@/components/chat/ConversationActionBar';
import FilePreviewDialog from '@/components/chat/FilePreviewDialog';
import { MessagesPane } from '@/components/chat/MessagesPane';
import { MessageComposer } from '@/components/chat/MessageComposer';
import { ImageLightbox, type LightboxImage } from '@/components/chat/ImageLightbox';
import { useContactPhoto } from './chatHelpers';
import { useChatPresence } from '@/hooks/useChatPresence';
import { useChatScroll } from '@/hooks/useChatScroll';
import { useChatActions } from '@/hooks/useChatActions';
import { logConversationAccess } from '@/lib/conversationAuditLog';
import { logChatEvent } from '@/lib/chat-telemetry';
import { Paperclip, MessageSquare } from 'lucide-react';

interface Props {
  conversation: Conversation;
  onBack: () => void;
  jumpToMessageId?: string | null;
  onJumpHandled?: () => void;
}

export function ChatArea({ conversation, onBack, jumpToMessageId, onJumpHandled }: Props) {
  const { profile } = useAuth();
  const { toast } = useToast();
  const companyId = profile?.company_id;
  const { getForConversation } = useInstancesMap();
  const currentInstance = getForConversation(conversation);
  const isEvolutionConversation = currentInstance?.provider === 'evolution';

  const {
    data: messages = [], isLoading, hasMore, loadingOlder, loadOlder,
    addOptimisticMessage, replaceCachedMessage, updateCachedMessage, removeCachedMessage,
  } = useChatMessages(conversation.id);
  const { data: ticketEvents = [] } = useConversationTicketEvents(conversation.id);
  const { data: activeTicketForSend, isFetched: activeTicketFetched } = useConversationActiveTicket(conversation.id);
  const reopenTicketMutation = useReopenTicket();
  const markRead = useMarkConversationRead();
  const patchConversationLocally = usePatchConversationLocally();

  const ensureTicketReopened = useCallback(async (): Promise<boolean> => {
    const wasClosed = !!conversation.closed_at;
    try {
      if (wasClosed) {
        patchConversationLocally(conversation.id, { closed_at: null });
      }

      if (activeTicketForSend?.status === 'closed' || activeTicketForSend?.status === 'awaiting_rating') {
        await reopenTicketMutation.mutateAsync(activeTicketForSend.id);
      } else if (wasClosed && activeTicketFetched && !activeTicketForSend) {
        await supabase.rpc('create_attendance_ticket', {
          _conversation_id: conversation.id,
          _lead_id: conversation.lead_id,
          _contact_phone: conversation.phone,
          _contact_name: conversation.contact_name,
          _priority: null,
          _category: null,
          _assigned_to: profile?.id ?? null,
        });
      }

      if (wasClosed) {
        await supabase.from('conversations').update({ closed_at: null }).eq('id', conversation.id);
      }
      return true;
    } catch {
      if (wasClosed) {
        patchConversationLocally(conversation.id, { closed_at: null });
      }
      return true;
    }
  }, [activeTicketFetched, activeTicketForSend, conversation, patchConversationLocally, profile?.id, reopenTicketMutation]);


  const { data: attendanceSettings } = useAttendanceSettings();
  const quickReplies = attendanceSettings?.quick_replies || [];
  const signatureCfg = attendanceSettings?.signature;
  const agentName = profile?.full_name || profile?.email || '';

  // Visibilidade pós-transferência: agentes só interagem se forem o atribuído.
  // Admin/gestor/master mantêm acesso pleno.
  const isPrivilegedRole =
    profile?.role === 'admin' ||
    profile?.role === 'gestor' ||
    profile?.role === 'master';
  const conversationAssignee = (conversation as any).assigned_to as string | null | undefined;
  const isAssignedToMe = !!profile?.id && conversationAssignee === profile.id;
  const isTriage = !conversationAssignee;
  const canInteract = isPrivilegedRole || isAssignedToMe || isTriage;

  const contactPhoto = useContactPhoto(conversation.phone, conversation.contact_photo_url, conversation.id);

  // Timestamps usados pela heurística de "digitando..." quando o evento explícito
  // (composing/recording) não chega — alguns devices só emitem available/unavailable.
  const { lastOutgoingAt, lastIncomingAt } = (() => {
    let out: number | null = null;
    let inc: number | null = null;
    for (let i = messages.length - 1; i >= 0; i--) {
      const m = messages[i];
      const ts = new Date(m.created_at || m.timestamp).getTime();
      if (!Number.isFinite(ts)) continue;
      if (m.from_me && out === null) out = ts;
      else if (!m.from_me && inc === null) inc = ts;
      if (out !== null && inc !== null) break;
    }
    return { lastOutgoingAt: out, lastIncomingAt: inc };
  })();
  const { isContactTyping } = useChatPresence(companyId, conversation.remote_jid, {
    lastOutgoingAt,
    lastIncomingAt,
  });
  const {
    virtuosoRef, messagesContainerRef, isInitialPinRef,
    showJumpToBottom, setShowJumpToBottom, unreadBelow, setUnreadBelow, scrollToBottom, handleAtBottomStateChange, handleRangeChanged, handleTotalListHeightChanged, handleDeferredContentLoaded, shouldFollowOutput,
  } = useChatScroll(conversation.id, messages);

  const inputRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const restoreComposerTextRef = useRef<((text: string) => void) | null>(null);
  const insertComposerTextRef = useRef<((text: string) => void) | null>(null);
  const [showContactDrawer, setShowContactDrawer] = useState(false);
  const [drawerSection, setDrawerSection] = useState<'perfil' | 'notas' | 'tickets' | undefined>(undefined);
  const [isDragging, setIsDragging] = useState(false);
  const dragCounterRef = useRef(0);
  const [galleryOpen, setGalleryOpen] = useState(false);
  const [galleryIndex, setGalleryIndex] = useState(0);

  const galleryImages = useMemo<LightboxImage[]>(() => (
    messages
      .filter((m) => m.message_type === 'image' && (m.media_storage_path || m.media_url))
      .map((m) => ({
        id: m.message_id,
        src: m.media_url || '',
        storagePath: m.media_storage_path ?? null,
        alt: m.content || m.file_name || 'Imagem',
        fileName: m.file_name || undefined,
      }))
  ), [messages]);

  const handleOpenImage = useCallback((messageId: string) => {
    const idx = galleryImages.findIndex((g) => g.id === messageId);
    if (idx < 0) return;
    setGalleryIndex(idx);
    setGalleryOpen(true);
  }, [galleryImages]);

  const handleGalleryDownload = useCallback(async (img: LightboxImage) => {
    try {
      let url = img.src;
      if (img.storagePath) {
        const { data } = await supabase.storage
          .from('chat-media')
          .createSignedUrl(img.storagePath, 3600);
        if (data?.signedUrl) url = data.signedUrl;
      }
      if (!url) return;
      const res = await fetch(url);
      const blob = await res.blob();
      const objectUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = objectUrl;
      a.download = img.fileName || `imagem_${Date.now()}.jpg`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(objectUrl);
    } catch {
      if (img.src) window.open(img.src, '_blank');
    }
  }, []);

  const actions = useChatActions({
    conversation,
    companyId,
    isEvolutionConversation,
    signatureCfg,
    agentName,
    ensureTicketReopened,
    addOptimisticMessage,
    replaceCachedMessage,
    updateCachedMessage,
    removeCachedMessage,
    patchConversationLocally,
    inputRef,
  });

  const markIncomingMessagesReadLocally = useCallback((source: string) => {
    const targets = messages
      .filter((m) => !m.from_me && m.status !== 'read' && m.status !== 'played')
      .slice(-50);
    if (targets.length === 0) return;

    targets.forEach((m) => {
      updateCachedMessage(m.id, (item) => ({ ...item, status: 'read' }));
    });

    supabase
      .from('chat_messages')
      .update({ status: 'read' })
      .eq('conversation_id', conversation.id)
      .eq('from_me', false)
      .in('id', targets.map((m) => m.id))
      .then(({ error }) => {
        if (!error) return;
        void logChatEvent({
          companyId,
          event: 'chat.mark_incoming_read_failed',
          message: error.message,
          level: 'warn',
          metadata: { conversationId: conversation.id, source },
        });
      });
  }, [messages, updateCachedMessage, conversation.id, companyId]);

  // Mark conversation read & propagate to Evolution (debounced)
  const lastMarkedMessageIdRef = useRef<string | null>(null);
  const lastMarkedConvIdRef = useRef<string | null>(null);
  useEffect(() => {
    if (!conversation.id) return;
    if (typeof document !== 'undefined' && document.hidden) return;

    const lastIncoming = [...messages].reverse().find(m => !m.from_me);
    const convChanged = lastMarkedConvIdRef.current !== conversation.id;
    const newIncoming = lastIncoming && lastMarkedMessageIdRef.current !== lastIncoming.message_id;

    if (!convChanged && !newIncoming) return;

    const timer = setTimeout(() => {
      if (conversation.unread_count > 0 && (convChanged || newIncoming)) {
        // Só fixa o ref após chamar markRead (que já é otimista no cache).
        void markRead(conversation.id);
        lastMarkedConvIdRef.current = conversation.id;
      } else if (convChanged) {
        lastMarkedConvIdRef.current = conversation.id;
      }

      if (isEvolutionConversation && lastIncoming && newIncoming) {
        lastMarkedMessageIdRef.current = lastIncoming.message_id;
        markIncomingMessagesReadLocally('auto-open');
        evolutionApi.markAsRead(conversation.remote_jid, lastIncoming.message_id, false).catch((err) => {
          void logChatEvent({
            companyId,
            event: 'evolution.mark_as_read_failed',
            message: err?.message ?? 'unknown',
            level: 'warn',
            metadata: { conversationId: conversation.id },
          });
        });
      }
    }, 80);

    return () => clearTimeout(timer);
  }, [conversation.id, conversation.remote_jid, conversation.unread_count, isEvolutionConversation, messages, markRead, companyId, markIncomingMessagesReadLocally]);

  useEffect(() => {
    const t = setTimeout(() => inputRef.current?.focus(), 100);
    return () => clearTimeout(t);
  }, [conversation.id]);

  // Auditoria: registra que o usuário visualizou as mensagens da conversa.
  useEffect(() => {
    if (isLoading || !conversation.id) return;
    void logConversationAccess('view_messages', {
      conversationId: conversation.id,
      messageCount: messages.length,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversation.id, isLoading]);

  const MAX_FILES_PER_BATCH = 10;
  const handleIncomingFiles = useCallback((files: File[]) => {
    if (!companyId) {
      toast({ title: 'Erro', description: 'Empresa não identificada.', variant: 'destructive' });
      return;
    }
    if (!files.length) return;

    let batch = files;
    if (batch.length > MAX_FILES_PER_BATCH) {
      toast({
        title: 'Muitos arquivos',
        description: `Você pode anexar no máximo ${MAX_FILES_PER_BATCH} arquivos por vez. Os ${batch.length - MAX_FILES_PER_BATCH} excedentes foram ignorados.`,
        variant: 'destructive',
      });
      batch = batch.slice(0, MAX_FILES_PER_BATCH);
    }

    const valid: File[] = [];
    const errors: { name: string; reason: string }[] = [];
    batch.forEach((file) => {
      const validation = validateMediaFile(file);
      if (!validation.ok) {
        errors.push({
          name: file.name || 'arquivo',
          reason: validation.error!.description,
        });
        return;
      }
      valid.push(file);
    });

    if (errors.length === 1) {
      toast({
        title: `Não foi possível anexar "${errors[0].name}"`,
        description: errors[0].reason,
        variant: 'destructive',
      });
    } else if (errors.length > 1) {
      toast({
        title: `${errors.length} arquivo(s) recusado(s)`,
        description: errors
          .slice(0, 4)
          .map((e) => `• ${e.name}: ${e.reason}`)
          .join('\n') + (errors.length > 4 ? `\n…e mais ${errors.length - 4}` : ''),
        variant: 'destructive',
      });
    }

    if (valid.length) actions.addPendingFiles(valid);
  }, [companyId, toast, actions]);

  const handleIncomingFile = useCallback((file: File) => {
    handleIncomingFiles([file]);
  }, [handleIncomingFiles]);

  const handleQuickReply = useCallback((text: string) => {
    const trimmed = text?.trim();
    if (!trimmed) return;
    void actions.sendText(trimmed);
  }, [actions]);

  const handleSendText = useCallback(async (text: string) => {
    const result = await actions.sendText(text);
    if (result?.ok && 'messageId' in result && result.messageId) {
      const urlMatch = text.match(/https?:\/\/[^\s<>()]+/i);
      if (urlMatch) {
        let safeUrl: string | null = null;
        try {
          const parsed = new URL(urlMatch[0]);
          if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
            safeUrl = parsed.toString();
          }
        } catch {
          safeUrl = null;
        }
        if (safeUrl) {
          const clientId = 'clientId' in result ? result.clientId : undefined;
          supabase.functions
            .invoke('extract-link-preview', {
              body: { message_id: result.messageId, client_id: clientId, url: safeUrl },
            })
            .catch(() => {});
        }
      }
    }
  }, [actions]);

  const handleOpenContact = useCallback(() => {
    setDrawerSection(undefined);
    setShowContactDrawer((prev) => !prev);
  }, []);
  const handleOpenNotes = useCallback(() => {
    setDrawerSection('notas');
    setShowContactDrawer(true);
  }, []);
  const handleOpenTickets = useCallback(() => {
    setDrawerSection('tickets');
    setShowContactDrawer(true);
  }, []);
  const handleMarkRead = useCallback(() => {
    void markRead(conversation.id);
  }, [markRead, conversation.id]);
  const handleCloseDrawer = useCallback(() => setShowContactDrawer(false), []);

  const handleComposerFocus = useCallback(() => {
    if (!conversation.id) return;
    if (conversation.unread_count > 0 && lastMarkedConvIdRef.current !== conversation.id) {
      lastMarkedConvIdRef.current = conversation.id;
      markRead(conversation.id);
    }
    if (isEvolutionConversation) {
      const lastIncoming = [...messages].reverse().find((m) => !m.from_me);
      if (lastIncoming && lastMarkedMessageIdRef.current !== lastIncoming.message_id) {
        lastMarkedMessageIdRef.current = lastIncoming.message_id;
        markIncomingMessagesReadLocally('composer-focus');
        evolutionApi.markAsRead(conversation.remote_jid, lastIncoming.message_id, false).catch((err) => {
          void logChatEvent({
            companyId,
            event: 'evolution.mark_as_read_failed',
            message: err?.message ?? 'unknown',
            level: 'warn',
            metadata: { conversationId: conversation.id, source: 'composer-focus' },
          });
        });
      }
    }
  }, [conversation.id, conversation.unread_count, conversation.remote_jid, isEvolutionConversation, messages, markRead, companyId, markIncomingMessagesReadLocally]);

  // Outer drag handling
  const handleDragEnter = useCallback((e: React.DragEvent) => {
    if (!e.dataTransfer?.types?.includes('Files')) return;
    e.preventDefault();
    dragCounterRef.current += 1;
    setIsDragging(true);
  }, []);
  const handleDragOver = useCallback((e: React.DragEvent) => {
    const types = e.dataTransfer?.types;
    if (!types) return;
    if (!types.includes('Files') && !types.includes('text/uri-list') && !types.includes('text/plain')) return;
    e.preventDefault();
  }, []);
  const handleDragLeave = useCallback((e: React.DragEvent) => {
    const types = e.dataTransfer?.types;
    if (!types?.includes('Files')) return;
    e.preventDefault();
    dragCounterRef.current = Math.max(0, dragCounterRef.current - 1);
    if (dragCounterRef.current === 0) setIsDragging(false);
  }, []);
  const handleDrop = useCallback((e: React.DragEvent) => {
    const dt = e.dataTransfer;
    if (!dt) return;
    const types = dt.types || [];
    const hasFiles = types.includes('Files') && (dt.files?.length ?? 0) > 0;
    const uriList = !hasFiles && types.includes('text/uri-list') ? dt.getData('text/uri-list') : '';
    const plain = !hasFiles && !uriList && types.includes('text/plain') ? dt.getData('text/plain') : '';
    if (!hasFiles && !uriList && !plain) return;
    e.preventDefault();
    dragCounterRef.current = 0;
    setIsDragging(false);
    if (hasFiles) {
      handleIncomingFiles(Array.from(dt.files));
      return;
    }
    // Links/texto colados/arrastados: insere no composer.
    const text = (uriList || plain)
      .split('\n')
      .map((s) => s.trim())
      .filter((s) => s && !s.startsWith('#'))
      .join(' ');
    if (text) insertComposerTextRef.current?.(text);
  }, [handleIncomingFiles]);

  return (
    <div className="flex h-full">
      <div
        className="flex flex-col flex-1 min-w-0 h-full relative"
        onDragEnter={handleDragEnter}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        {isDragging && (
          <div className="absolute inset-0 z-30 flex items-center justify-center bg-background/70 backdrop-blur-sm border-2 border-dashed border-primary rounded-lg pointer-events-none">
            <div className="flex flex-col items-center gap-2 text-primary">
              <Paperclip className="w-8 h-8" />
              <span className="text-sm font-medium">Solte para anexar</span>
            </div>
          </div>
        )}
        <ConversationActionBar
          conversation={conversation}
          onBack={onBack}
          onOpenContact={handleOpenContact}
          onOpenNotes={handleOpenNotes}
          onOpenTickets={handleOpenTickets}
          onMarkRead={handleMarkRead}
          contactPhoto={contactPhoto}
        />

        <MessagesPane
          messages={messages}
          jumpToMessageId={jumpToMessageId ?? null}
          onJumpHandled={onJumpHandled}
          loadOlderForJump={loadOlder}
          hasMoreForJump={hasMore}
          ticketEvents={ticketEvents}
          isLoading={isLoading}
          hasMore={hasMore}
          loadingOlder={loadingOlder}
          loadOlder={loadOlder}
          isContactTyping={isContactTyping}
          isDragging={isDragging}
          showJumpToBottom={showJumpToBottom}
          unreadBelow={unreadBelow}
          virtuosoRef={virtuosoRef}
          messagesContainerRef={messagesContainerRef}
          isInitialPinRef={isInitialPinRef}
          setShowJumpToBottom={setShowJumpToBottom}
          setUnreadBelow={setUnreadBelow}
          scrollToBottom={scrollToBottom}
          onAtBottomStateChange={handleAtBottomStateChange}
          onRangeChanged={handleRangeChanged}
          onTotalListHeightChanged={handleTotalListHeightChanged}
          onDeferredContentLoaded={handleDeferredContentLoaded}
          followOutput={shouldFollowOutput}
          onReply={actions.handleReply}
          onReact={actions.handleReact}
          onDelete={actions.handleDeleteMessage}
          onEdit={actions.handleEditMessage}
          onOpenImage={handleOpenImage}
          onQuickReply={handleQuickReply}
          onDragOver={(e) => {
            if (Array.from(e.dataTransfer.types).includes('Files')) {
              e.preventDefault();
              setIsDragging(true);
            }
          }}
          onDragLeave={(e) => {
            if (e.currentTarget === e.target) setIsDragging(false);
          }}
          // O drop é tratado pelo wrapper externo (handleDrop). Não chamamos
          // handleIncomingFiles aqui — caso contrário o evento que borbulha
          // dispararia a ingestão duas vezes (duplicando os anexos).
          onDrop={() => { /* no-op: bubble up to wrapper */ }}
        />



        {canInteract ? (
          <MessageComposer
            conversation={conversation}
            currentInstance={currentInstance}
            isEvolutionConversation={isEvolutionConversation}
            sending={actions.sending}
            isRecording={actions.isRecording}
            isPaused={actions.isPaused}
            recordingTime={actions.recordingTime}
            audioLevels={actions.audioLevels}
            quotedMessage={actions.quotedMessage}
            setQuotedMessage={actions.setQuotedMessage}
            quickReplies={quickReplies}
            inputRef={inputRef}
            fileInputRef={fileInputRef}
            ensureTicketReopened={ensureTicketReopened}
            onSend={handleSendText}
            onIncomingFile={handleIncomingFile}
            onIncomingFiles={handleIncomingFiles}
            onToggleRecording={actions.toggleRecording}
            onCancelRecording={actions.cancelRecording}
            onPauseRecording={actions.pauseRecording}
            onResumeRecording={actions.resumeRecording}
            onStopAndSendRecording={actions.stopAndSendRecording}
            onComposerFocus={handleComposerFocus}
            restoreTextRef={restoreComposerTextRef}
            insertTextRef={insertComposerTextRef}
          />
        ) : (
          <div className="border-t border-border bg-muted/30 px-4 py-3 text-sm text-muted-foreground flex items-center gap-2">
            <MessageSquare className="w-4 h-4 shrink-0" />
            <span>
              Esta conversa foi transferida e está atribuída a outro atendente. Você
              não pode mais interagir até que seja transferida novamente para você.
            </span>
          </div>
        )}
      </div>

      <ChatLeadDrawer
        open={showContactDrawer}
        onOpenChange={setShowContactDrawer}
        leadId={conversation.lead_id ?? null}
        contactId={(conversation as any).contact_id ?? null}
        conversationId={conversation.id}
        defaultName={conversation.contact_name}
        defaultPhone={conversation.phone}
        defaultAvatarUrl={conversation.contact_photo_url ?? null}
      />




      <FilePreviewDialog
        files={actions.pendingFiles}
        sending={actions.pendingFileSending}
        onConfirm={(items, groupHeader) => {
          void (async () => {
            if (groupHeader && groupHeader.trim()) {
              const headerText = `📎 Anexos (${items.length})\n${groupHeader.trim()}`;
              await actions.sendText(headerText);
            }
            await actions.uploadAndSendQueue(items);
          })();
        }}
        onCancel={() => actions.clearPendingFiles()}
        onAddFiles={(more) => handleIncomingFiles(more)}
        onRemove={(idx) => actions.removePendingFile(idx)}
        onRename={(idx, name) => actions.renamePendingFile(idx, name)}
      />

      <ImageLightbox
        open={galleryOpen}
        images={galleryImages}
        startIndex={galleryIndex}
        onClose={() => setGalleryOpen(false)}
        onDownload={handleGalleryDownload}
      />
    </div>
  );
}

export function EmptyChat() {
  return (
    <div className="flex flex-col items-center justify-center h-full text-center px-8">
      <div className="w-20 h-20 rounded-2xl bg-primary/10 flex items-center justify-center mb-4">
        <MessageSquare className="w-10 h-10 text-primary" />
      </div>
      <h3 className="font-display text-xl font-semibold mb-2">Chat WhatsApp</h3>
      <p className="text-sm text-muted-foreground max-w-sm">
        Selecione uma conversa ao lado para visualizar e enviar mensagens via WhatsApp.
      </p>
    </div>
  );
}
