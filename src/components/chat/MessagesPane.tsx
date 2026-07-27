import { forwardRef, memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, type HTMLAttributes, type RefObject } from 'react';
import { Virtuoso, type FollowOutputCallback, type ItemProps, type ListRange, type VirtuosoHandle } from 'react-virtuoso';
import { Loader2, MessageSquare, ChevronDown, ChevronUp, Paperclip } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { ChatSystemDivider } from '@/components/chat/ChatSystemDivider';
import { MessageBubble } from '@/components/chat/MessageBubble';
import { ChatOverflowDebugOverlay } from '@/components/chat/ChatOverflowDebugOverlay';
import type { ChatMessage } from '@/hooks/useChatMessages';
import type { TicketEvent } from '@/hooks/useAttendanceTickets';
import { format, isToday, isYesterday } from 'date-fns';
import { ptBR } from 'date-fns/locale';

type FlatItem =
  | { type: 'date'; key: string; date: string }
  | { type: 'msg'; key: string; data: ChatMessage }
  | { type: 'event'; key: string; data: TicketEvent };

const isPendingOptimisticMessage = (m: ChatMessage) =>
  m.from_me &&
  (m.status === 'sending' || m.status === 'uploading' || m.status === 'pending' || m.status === 'queued') &&
  (m.id?.startsWith('optimistic-') || typeof m.seq !== 'number');

const VirtuosoScroller = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(
  ({ className, style, ...scrollerProps }, ref) => (
    <div
      {...scrollerProps}
      ref={ref}
      className={cn('chat-messages-scroll overflow-x-hidden px-[14px]', className)}
      style={{ ...style, overflowX: 'hidden' }}
    />
  )
);
VirtuosoScroller.displayName = 'VirtuosoScroller';

const VirtuosoItem = ({ children, style, item: _item, context: _context, ...itemProps }: ItemProps<FlatItem> & { context?: unknown }) => (
  <div {...itemProps} className="min-w-0 max-w-full overflow-hidden" style={{ ...style, maxWidth: '100%' }}>
    {children}
  </div>
);

interface Props {
  messages: ChatMessage[];
  ticketEvents: TicketEvent[];
  isLoading: boolean;
  hasMore: boolean;
  loadingOlder: boolean;
  loadOlder: () => void | Promise<unknown>;
  isContactTyping: boolean;
  isDragging: boolean;
  showJumpToBottom: boolean;
  unreadBelow: number;
  virtuosoRef: RefObject<VirtuosoHandle>;
  messagesContainerRef: RefObject<HTMLDivElement>;
  isInitialPinRef: RefObject<boolean>;
  setShowJumpToBottom: (v: boolean) => void;
  setUnreadBelow: (v: number) => void;
  scrollToBottom: () => void;
  onAtBottomStateChange: (atBottom: boolean) => void;
  onRangeChanged: (range: ListRange, totalItems: number) => void;
  onTotalListHeightChanged: () => void;
  onDeferredContentLoaded: () => void;
  followOutput: FollowOutputCallback;
  onReply: (m: ChatMessage) => void;
  onReact: (m: ChatMessage, emoji: string) => void;
  onDelete: (m: ChatMessage) => void;
  onEdit?: (m: ChatMessage, newText: string) => Promise<boolean | void> | void;
  onOpenImage?: (messageId: string) => void;
  onQuickReply?: (text: string, buttonId?: string | null) => void;
  onDragOver: (e: React.DragEvent) => void;
  onDragLeave: (e: React.DragEvent) => void;
  onDrop: (e: React.DragEvent) => void;
  jumpToMessageId?: string | null;
  onJumpHandled?: () => void;
  loadOlderForJump?: () => void | Promise<unknown>;
  hasMoreForJump?: boolean;
}

function MessagesPaneImpl(props: Props) {
  const {
    messages, ticketEvents, isLoading, hasMore, loadingOlder, loadOlder,
    isContactTyping, isDragging, showJumpToBottom, unreadBelow,
    virtuosoRef, messagesContainerRef, isInitialPinRef,
    setShowJumpToBottom, setUnreadBelow, scrollToBottom, onAtBottomStateChange, onRangeChanged, onTotalListHeightChanged, onDeferredContentLoaded, followOutput,
    onReply, onReact, onDelete, onEdit, onOpenImage, onQuickReply, onDragOver, onDragLeave, onDrop,
    jumpToMessageId, onJumpHandled, loadOlderForJump, hasMoreForJump,
  } = props;

  const flatItems = useMemo<FlatItem[]>(() => {
    type TimelineItem =
      | { kind: 'msg'; ts: number; pendingRank: number; data: ChatMessage }
      | { kind: 'event'; ts: number; pendingRank: number; data: TicketEvent };

    // Rede de segurança contra duplicatas que escapam do messageStore
    // (ex.: realtime + catchUp + AI runner inserindo a mesma linha sob
    // identidades ligeiramente diferentes). Ordem das chaves:
    //   1. id de DB (linhas reais persistidas)
    //   2. provider_message_id (ACK do provider — único por mensagem)
    //   3. message_id real (não-otimista)
    //   4. client_id (idempotency do browser)
    //   5. fallback: from_me|tipo|conteúdo|ts/2s
    const seenId = new Set<string>();
    const seenPmid = new Set<string>();
    const seenMsgId = new Set<string>();
    const seenClientId = new Set<string>();
    const seenContent = new Set<string>();
    const dedupedMessages: ChatMessage[] = [];
    for (const m of messages) {
      if (m.id && !m.id.startsWith('optimistic-')) {
        if (seenId.has(m.id)) continue;
        seenId.add(m.id);
      }
      const pmid = (m as unknown as { provider_message_id?: string | null }).provider_message_id;
      if (pmid) {
        if (seenPmid.has(pmid)) continue;
        seenPmid.add(pmid);
      }
      if (m.message_id && !m.message_id.startsWith('optimistic-')) {
        if (seenMsgId.has(m.message_id)) continue;
        seenMsgId.add(m.message_id);
      }
      if (m.client_id) {
        if (seenClientId.has(m.client_id)) continue;
        seenClientId.add(m.client_id);
      }
      const ts = new Date(m.timestamp).getTime();
      const trimmed = (m.content || '').trim();
      if (trimmed) {
        const contentKey = `${m.from_me ? 1 : 0}|${m.message_type}|${trimmed}|${Math.floor(ts / 2000)}`;
        if (seenContent.has(contentKey)) continue;
        seenContent.add(contentKey);
      }
      dedupedMessages.push(m);
    }


    // `messages` já vem ordenado canonicamente pelo messageStore.
    // Apenas mesclamos ticketEvents por timestamp via merge estável.
    const msgItems: TimelineItem[] = dedupedMessages.map((m) => ({
      kind: 'msg' as const,
      ts: new Date(m.timestamp).getTime(),
      pendingRank: isPendingOptimisticMessage(m) ? 1 : 0,
      data: m,
    }));
    const evtItems: TimelineItem[] = ticketEvents
      .filter((e) => e.event_type !== 'opened')
      .map((e) => ({
        kind: 'event' as const,
        ts: new Date(e.created_at).getTime(),
        pendingRank: 0,
        data: e,
      }));

    // Merge estável: mantém ordem de msgItems (canônica) e intercala eventos
    // pelo seu ts em relação ao ts do próximo msg. Pendentes vão para o fim.
    const nonPending: TimelineItem[] = [];
    const pending: TimelineItem[] = [];
    let mi = 0;
    let ei = 0;
    while (mi < msgItems.length || ei < evtItems.length) {
      const m = msgItems[mi];
      const e = evtItems[ei];
      if (!e) { nonPending.push(m); mi++; continue; }
      if (!m) { nonPending.push(e); ei++; continue; }
      // Pendente sempre depois (visualmente no rodapé).
      if (m.pendingRank === 1) { pending.push(m); mi++; continue; }
      if (e.ts <= m.ts) { nonPending.push(e); ei++; }
      else { nonPending.push(m); mi++; }
    }
    const items = nonPending.concat(pending);

    const out: FlatItem[] = [];
    let lastDayKey = -Infinity;
    for (const item of items) {
      const d = new Date(item.ts);
      // Chave do dia em ms locais — robusta a labels intermediários.
      const dayKey = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
      if (dayKey !== lastDayKey) {
        const label = isToday(d) ? 'Hoje'
          : isYesterday(d) ? 'Ontem'
          : format(d, "dd 'de' MMMM", { locale: ptBR });
        out.push({ type: 'date', key: `date-${dayKey}`, date: label });
        lastDayKey = dayKey;
      }
      if (item.kind === 'msg') {
        // Chave estável: prefere id real persistido (UUID do DB), depois
        // provider_message_id (canônico do provider), depois client_id
        // (idempotency do browser), por fim message_id/id. Evita que
        // bolha otimista e linha real reusem a mesma chave do client_id.
        const m = item.data;
        const pmid = (m as { provider_message_id?: string | null }).provider_message_id;
        const stableKey =
          (m.id && !m.id.startsWith('optimistic-') ? m.id : null) ??
          pmid ??
          (m.message_id && !m.message_id.startsWith('optimistic-') ? m.message_id : null) ??
          m.client_id ??
          m.message_id ??
          m.id;
        out.push({ type: 'msg', key: stableKey, data: m });
      } else {
        out.push({ type: 'event', key: `evt-${item.data.id}`, data: item.data });
      }
    }
    return out;
  }, [messages, ticketEvents]);

  const messagesByMessageId = useMemo(() => {
    const map = new Map<string, ChatMessage>();
    for (const m of messages) map.set(m.message_id, m);
    return map;
  }, [messages]);

  // Âncora de prepend: ao carregar mensagens antigas, fixamos a posição
  // visual de uma mensagem já existente (1ª 'msg' do topo) e re-aplicamos
  // o ajuste enquanto o conteúdo cresce (ex.: imagens/áudios carregando)
  // dentro de uma janela curta. Isso evita reposicionamento incorreto
  // mesmo quando o `scrollHeight` muda em mais de uma etapa.
  const prependAnchorRef = useRef<{
    messageId: string;
    anchorTop: number;   // posição absoluta do anchor dentro do scroller
    scrollTop: number;   // scrollTop no momento da captura
    expiresAt: number;
  } | null>(null);

  const getScroller = useCallback(() => (
    messagesContainerRef.current?.querySelector<HTMLDivElement>('.chat-messages-scroll') ?? null
  ), [messagesContainerRef]);

  const measureAnchorTop = useCallback((scroller: HTMLDivElement, messageId: string): number | null => {
    const safeId = (window.CSS && typeof window.CSS.escape === 'function')
      ? window.CSS.escape(messageId)
      : messageId.replace(/"/g, '\\"');
    const el = scroller.querySelector<HTMLElement>(`[data-message-id="${safeId}"]`);
    if (!el) return null;
    const elRect = el.getBoundingClientRect();
    const scRect = scroller.getBoundingClientRect();
    return elRect.top - scRect.top + scroller.scrollTop;
  }, []);

  const adjustForAnchor = useCallback(() => {
    const a = prependAnchorRef.current;
    if (!a) return;
    if (Date.now() > a.expiresAt) { prependAnchorRef.current = null; return; }
    const sc = getScroller();
    if (!sc) return;
    const newTop = measureAnchorTop(sc, a.messageId);
    if (newTop == null) return;
    // Mantém a posição visual: visualTop = anchorTop - scrollTop = const
    const targetScrollTop = newTop - a.anchorTop + a.scrollTop;
    if (Math.abs(targetScrollTop - sc.scrollTop) < 0.5) return;
    sc.scrollTop = Math.max(0, targetScrollTop);
  }, [getScroller, measureAnchorTop]);

  // Re-aplica logo após o React refletir o prepend no DOM.
  useLayoutEffect(() => {
    adjustForAnchor();
  }, [flatItems.length, adjustForAnchor]);

  // Observa mudanças de altura no conteúdo virtualizado e mantém a âncora
  // corrigida durante a janela ativa (mídia carregando, etc.).
  useEffect(() => {
    const sc = getScroller();
    if (!sc) return;
    const inner = (sc.firstElementChild as HTMLElement | null) ?? sc;
    const ro = new ResizeObserver(() => adjustForAnchor());
    ro.observe(inner);
    return () => ro.disconnect();
  }, [getScroller, adjustForAnchor, isLoading, messages.length === 0]);

  const handleStartReached = useCallback(() => {
    if (!hasMore || loadingOlder) return;
    const sc = getScroller();
    if (sc) {
      // Escolhe a 1ª mensagem real (ignora dividers de data) como âncora.
      const firstMsg = flatItems.find((it): it is Extract<FlatItem, { type: 'msg' }> => it.type === 'msg');
      if (firstMsg) {
        const id = firstMsg.data.message_id;
        const top = measureAnchorTop(sc, id);
        if (top != null) {
          prependAnchorRef.current = {
            messageId: id,
            anchorTop: top,
            scrollTop: sc.scrollTop,
            expiresAt: Date.now() + 2000,
          };
        }
      }
    }
    void loadOlder();
  }, [getScroller, hasMore, loadOlder, loadingOlder, flatItems, measureAnchorTop]);

  // Jump to a specific message (from advanced search). Carrega páginas
  // mais antigas até encontrar a mensagem e então rola até ela com highlight.
  const lastJumpAttemptRef = useRef<string | null>(null);
  useEffect(() => {
    if (!jumpToMessageId) {
      lastJumpAttemptRef.current = null;
      return;
    }
    const idx = flatItems.findIndex(
      (it) => it.type === 'msg' && it.data.message_id === jumpToMessageId
    );
    if (idx >= 0) {
      lastJumpAttemptRef.current = jumpToMessageId;
      requestAnimationFrame(() => {
        virtuosoRef.current?.scrollToIndex({ index: idx, align: 'center', behavior: 'smooth' });
        // highlight via class no item; aplicamos no DOM diretamente.
        setTimeout(() => {
          const el = messagesContainerRef.current?.querySelector(`[data-message-id="${jumpToMessageId}"]`);
          if (el) {
            el.classList.add('chat-message-jumped');
            setTimeout(() => el.classList.remove('chat-message-jumped'), 1800);
          }
        }, 250);
      });
      onJumpHandled?.();
      return;
    }
    // Não encontrado: tenta carregar mais antigas (uma vez por id)
    if (lastJumpAttemptRef.current === jumpToMessageId) return;
    if (hasMoreForJump && loadOlderForJump && !loadingOlder) {
      lastJumpAttemptRef.current = jumpToMessageId;
      const tryMore = async () => {
        await loadOlderForJump();
        // depois de carregar, o effect rodará de novo (deps mudam) — limpa o ref
        // para permitir nova tentativa caso ainda não esteja na página.
        lastJumpAttemptRef.current = null;
      };
      void tryMore();
    } else {
      onJumpHandled?.();
    }
  }, [jumpToMessageId, flatItems, hasMoreForJump, loadOlderForJump, loadingOlder, onJumpHandled, virtuosoRef, messagesContainerRef]);

  return (
    <div
      ref={messagesContainerRef}
      className={cn(
        'chat-overflow-guard flex-1 min-w-0 min-h-0 pl-6 pr-2 py-3 bg-[hsl(var(--chat-bg))] relative overflow-hidden',
        isDragging && 'ring-2 ring-primary/60 ring-inset',
      )}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
    >
      {isDragging && (
        <div className="absolute inset-0 z-20 flex items-center justify-center bg-background/70 backdrop-blur-sm pointer-events-none">
          <div className="px-6 py-4 rounded-xl border-2 border-dashed border-primary bg-card/80 text-sm font-medium text-primary flex items-center gap-2">
            <Paperclip className="w-4 h-4" />
            Solte o arquivo para anexar
          </div>
        </div>
      )}
      <ChatOverflowDebugOverlay containerRef={messagesContainerRef} />
      {isLoading ? (
        <div className="flex items-center justify-center h-full">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
      ) : messages.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-full text-center">
          <MessageSquare className="w-12 h-12 text-muted-foreground/30 mb-3" />
          <p className="text-sm text-muted-foreground">Nenhuma mensagem ainda</p>
          <p className="text-xs text-muted-foreground/70 mt-1">Envie uma mensagem para iniciar a conversa</p>
        </div>
      ) : (
        <Virtuoso
          ref={virtuosoRef}
          style={{ height: '100%', width: '100%' }}
          data={flatItems}
          computeItemKey={(_, item) => item.key}
          alignToBottom
          initialTopMostItemIndex={Math.max(0, flatItems.length - 1)}
          followOutput={followOutput}
          startReached={handleStartReached}
          atBottomStateChange={onAtBottomStateChange}
          rangeChanged={(range) => onRangeChanged(range, flatItems.length)}
          totalListHeightChanged={onTotalListHeightChanged}
          atBottomThreshold={80}
          increaseViewportBy={{ top: 600, bottom: 600 }}
          components={{
            Scroller: VirtuosoScroller,
            Item: VirtuosoItem,
            Header: () => (
              <div className="flex justify-center py-3">
                {loadingOlder ? (
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    Carregando histórico…
                  </div>
                ) : hasMore ? (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-8 text-xs gap-1.5"
                    onClick={() => void loadOlder()}
                  >
                    <ChevronUp className="w-3.5 h-3.5" />
                    Carregar mensagens anteriores
                  </Button>
                ) : messages.length > 0 ? (
                  <span className="text-[11px] text-muted-foreground/60">Início da conversa</span>
                ) : null}
              </div>
            ),
            // Espaço de segurança no rodapé: evita que a última bolha encoste
            // visualmente no composer durante um re-scroll em andamento.
            Footer: () => <div className="h-2" aria-hidden="true" />,
          }}
          itemContent={(_, item) => {
            if (item.type === 'date') {
              return (
                <div className="flex justify-center my-3">
                  <span className="bg-card border border-border/50 rounded-full px-3 py-1 text-xs text-muted-foreground shadow-sm">
                    {item.date}
                  </span>
                </div>
              );
            }
            if (item.type === 'event') {
              return <ChatSystemDivider event={item.data} />;
            }
            return (
              <MessageBubble
                msg={item.data}
                quotedMessage={item.data.quoted_message_id ? messagesByMessageId.get(item.data.quoted_message_id) ?? null : null}
                onDeferredContentLoaded={onDeferredContentLoaded}
                onReply={onReply}
                onReact={onReact}
                onDelete={onDelete}
                onEdit={onEdit}
                onOpenImage={onOpenImage}
                onQuickReply={onQuickReply}
              />
            );
          }}
        />
      )}
      {isContactTyping && (
        <div className="flex items-center gap-2 px-3 py-2" aria-live="polite">
          <div className="flex gap-1 items-center bg-[hsl(var(--chat-bubble-in))] rounded-lg px-3 py-2" style={{ boxShadow: 'var(--chat-bubble-shadow)' }}>
            <span className="w-2 h-2 rounded-full bg-muted-foreground/60 animate-bounce" style={{ animationDelay: '0ms' }} />
            <span className="w-2 h-2 rounded-full bg-muted-foreground/60 animate-bounce" style={{ animationDelay: '150ms' }} />
            <span className="w-2 h-2 rounded-full bg-muted-foreground/60 animate-bounce" style={{ animationDelay: '300ms' }} />
          </div>
          <span className="text-xs text-muted-foreground">digitando...</span>
        </div>
      )}

      {showJumpToBottom && (
        <button
          onClick={() => {
            scrollToBottom();
            setShowJumpToBottom(false);
            setUnreadBelow(0);
          }}
          aria-label="Ir para o final da conversa"
          className="absolute bottom-4 right-4 z-10 flex items-center gap-2 px-3 py-2 rounded-full bg-primary text-primary-foreground shadow-lg hover:bg-primary/90 transition-all text-xs font-medium"
        >
          <ChevronDown className="w-4 h-4" />
          {unreadBelow > 0 && (
            <span className="bg-primary-foreground/20 rounded-full px-1.5 py-0.5 text-[10px] font-semibold tabular-nums">
              {unreadBelow > 99 ? '99+' : unreadBelow}
            </span>
          )}
        </button>
      )}
    </div>
  );
}

export const MessagesPane = memo(MessagesPaneImpl);
