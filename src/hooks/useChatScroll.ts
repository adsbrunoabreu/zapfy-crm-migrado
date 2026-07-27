import { useCallback, useEffect, useRef, useState } from 'react';
import type { ListRange, VirtuosoHandle } from 'react-virtuoso';
import type { ChatMessage } from '@/hooks/useChatMessages';

const getKey = (m?: ChatMessage) =>
  m?.client_id || m?.message_id || m?.id || null;

/**
 * Auto-scroll do chat. Regras:
 *  - Ao trocar de conversa: pino no fim por ~2s (cobre carga lenta).
 *  - Mensagem nova chega: se está no fim (ou se é própria), rola pro fim.
 *    Senão, conta como "não lida abaixo" e mostra botão.
 *  - Conteúdo lazy (imagens/áudios) carregando: re-rola pro fim **somente**
 *    se o usuário ainda está no fim. Qualquer interação de scroll do usuário
 *    cancela o pino inicial imediatamente para não "puxar de volta".
 *
 * Importante: evitamos rolagens concorrentes com o `followOutput` do Virtuoso
 * coalescendo as chamadas via `requestAnimationFrame` e mantendo state
 * idempotente (sem setState desnecessário) para não disparar loops de
 * `totalListHeightChanged` durante o re-mount do bubble otimista→confirmado.
 */
export function useChatScroll(conversationId: string, messages: ChatMessage[]) {
  const virtuosoRef = useRef<VirtuosoHandle>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const isInitialPinRef = useRef(true);
  const isAtBottomRef = useRef(true);
  const userInteractedRef = useRef(false);
  const upwardScrollIntentAtRef = useRef(0);
  // Trava de rolagem: quando o usuário rola para cima, NENHUM auto-scroll
  // (mídia carregando, mensagens novas, próprias ou de terceiros) leva o chat
  // de volta ao fim. A trava só é liberada quando o usuário clica em "ir para
  // o final" ou rola manualmente até o fundo.
  const scrollLockedRef = useRef(false);
  const lastKeyRef = useRef<string | null>(null);
  const lastLengthRef = useRef(0);
  const lastConvRef = useRef<string>('');

  const [showJumpToBottom, setShowJumpToBottom] = useState(false);
  const [unreadBelow, setUnreadBelow] = useState(0);
  // Refs espelhando o state para evitar setState idempotente.
  const showJumpToBottomRef = useRef(false);
  const unreadBelowRef = useRef(0);

  const setShowJumpToBottomSafe = useCallback((v: boolean) => {
    if (showJumpToBottomRef.current === v) return;
    showJumpToBottomRef.current = v;
    setShowJumpToBottom(v);
  }, []);
  const setUnreadBelowSafe = useCallback((v: number | ((c: number) => number)) => {
    const next = typeof v === 'function' ? (v as (c: number) => number)(unreadBelowRef.current) : v;
    if (unreadBelowRef.current === next) return;
    unreadBelowRef.current = next;
    setUnreadBelow(next);
  }, []);

  const cancelInitialPin = useCallback((markAwayFromBottom = false) => {
    if (isInitialPinRef.current) isInitialPinRef.current = false;
    userInteractedRef.current = true;
    if (markAwayFromBottom) {
      upwardScrollIntentAtRef.current = Date.now();
      isAtBottomRef.current = false;
      scrollLockedRef.current = true;
      setShowJumpToBottomSafe(true);
    }
  }, [setShowJumpToBottomSafe]);

  // Coalescing de rolagens: no máximo uma chamada por frame.
  const rafScrollRef = useRef<number | null>(null);
  const performScrollNow = useCallback(() => {
    rafScrollRef.current = null;
    const v = virtuosoRef.current;
    if (!v) return;
    if (!isAtBottomRef.current && scrollLockedRef.current) return;
    v.scrollToIndex({ index: 'LAST', behavior: 'auto', align: 'end' });
  }, []);
  const scheduleScrollToBottom = useCallback(() => {
    if (rafScrollRef.current != null) return;
    rafScrollRef.current = requestAnimationFrame(performScrollNow);
  }, [performScrollNow]);

  const scrollToBottom = useCallback(() => {
    upwardScrollIntentAtRef.current = 0;
    isAtBottomRef.current = true;
    scrollLockedRef.current = false;
    setShowJumpToBottomSafe(false);
    setUnreadBelowSafe(0);
    scheduleScrollToBottom();
  }, [setShowJumpToBottomSafe, setUnreadBelowSafe, scheduleScrollToBottom]);

  // Listeners de interação do usuário: cancelam o pino inicial assim que
  // ele rolar com wheel/touch/teclado (PageUp, ArrowUp, Home).
  useEffect(() => {
    const el = messagesContainerRef.current;
    if (!el) return;
    let touchStartY = 0;
    const onWheel = (e: WheelEvent) => { if (e.deltaY < 0) cancelInitialPin(true); };
    const onTouchStart = (e: TouchEvent) => { touchStartY = e.touches[0]?.clientY ?? 0; };
    const onTouchMove = (e: TouchEvent) => {
      const y = e.touches[0]?.clientY ?? touchStartY;
      cancelInitialPin(y >= touchStartY);
    };
    const onKey = (e: KeyboardEvent) => {
      if (['PageUp', 'ArrowUp', 'Home'].includes(e.key)) cancelInitialPin(true);
    };
    el.addEventListener('wheel', onWheel, { passive: true });
    el.addEventListener('touchstart', onTouchStart, { passive: true });
    el.addEventListener('touchmove', onTouchMove, { passive: true });
    el.addEventListener('keydown', onKey);
    return () => {
      el.removeEventListener('wheel', onWheel);
      el.removeEventListener('touchstart', onTouchStart);
      el.removeEventListener('touchmove', onTouchMove);
      el.removeEventListener('keydown', onKey);
    };
  }, [cancelInitialPin, conversationId]);

  // Reset de estado ao trocar de conversa, com pino inicial de 2s.
  useEffect(() => {
    if (lastConvRef.current === conversationId) return;
    lastConvRef.current = conversationId;
    isInitialPinRef.current = true;
    isAtBottomRef.current = true;
    userInteractedRef.current = false;
    upwardScrollIntentAtRef.current = 0;
    scrollLockedRef.current = false;
    lastKeyRef.current = null;
    lastLengthRef.current = 0;
    setShowJumpToBottomSafe(false);
    setUnreadBelowSafe(0);
    const t = setTimeout(() => { isInitialPinRef.current = false; }, 2000);
    return () => clearTimeout(t);
  }, [conversationId, setShowJumpToBottomSafe, setUnreadBelowSafe]);

  // Reage a mudanças no array de mensagens.
  useEffect(() => {
    if (!conversationId) return;
    const len = messages.length;
    const lastKey = getKey(messages[len - 1]);
    const prevLen = lastLengthRef.current;
    const prevKey = lastKeyRef.current;

    // Primeira carga (ou conversa recém-aberta com mensagens).
    if (prevLen === 0 && len > 0) {
      lastLengthRef.current = len;
      lastKeyRef.current = lastKey;
      scrollToBottom();
      return;
    }

    // Nada mudou de tamanho nem identidade do último → ignora (é só update de status).
    if (len === prevLen && lastKey === prevKey) return;

    lastLengthRef.current = len;
    lastKeyRef.current = lastKey;

    if (len <= prevLen) return; // remoção/reordenação: não interfere

    const last = messages[len - 1];
    const lastIsMine = !!last?.from_me;
    const newCount = len - prevLen;

    // Trava ativa: nada de auto-scroll. Apenas conta como não-lida (se não for própria).
    if (scrollLockedRef.current) {
      if (!lastIsMine) {
        setUnreadBelowSafe((c) => c + newCount);
        setShowJumpToBottomSafe(true);
      }
      return;
    }

    // Mensagem própria sempre rola; pino inicial só rola se o usuário ainda
    // não interagiu; demais casos exigem que ele esteja no fim.
    const shouldFollow =
      lastIsMine ||
      (isInitialPinRef.current && !userInteractedRef.current) ||
      isAtBottomRef.current;

    if (shouldFollow) {
      scrollToBottom();
      // Mensagem própria: tail-settle único após o layout final (status icon,
      // sombra e remount de key client_id→message_id já estabilizados).
      if (lastIsMine) {
        const id = window.setTimeout(() => {
          if (!isAtBottomRef.current || scrollLockedRef.current) return;
          scheduleScrollToBottom();
        }, 80);
        return () => window.clearTimeout(id);
      }
    } else {
      setUnreadBelowSafe((c) => c + newCount);
      setShowJumpToBottomSafe(true);
    }
  }, [conversationId, messages, scrollToBottom, scheduleScrollToBottom, setShowJumpToBottomSafe, setUnreadBelowSafe]);

  const handleAtBottomStateChange = useCallback((atBottom: boolean) => {
    isAtBottomRef.current = atBottom;
    if (!atBottom) {
      // Sair do fim conta como interação: cancela o pino inicial e arma a trava.
      userInteractedRef.current = true;
      scrollLockedRef.current = true;
      if (isInitialPinRef.current) isInitialPinRef.current = false;
      setShowJumpToBottomSafe(true);
    } else {
      // Voltou ao fim por scroll natural: libera a trava.
      scrollLockedRef.current = false;
      setShowJumpToBottomSafe(false);
      setUnreadBelowSafe(0);
    }
  }, [setShowJumpToBottomSafe, setUnreadBelowSafe]);

  const handleRangeChanged = useCallback((_range: ListRange, _totalItems: number) => {
    // A área renderizada inclui overscan; portanto `endIndex` pode apontar para
    // o último item mesmo quando o usuário já rolou para cima. O estado real de
    // fundo fica exclusivamente com `atBottomStateChange`, evitando puxar o chat
    // de volta durante carregamento de mídia.
  }, []);

  // Mídia/fontes/imagens carregando mudam a altura. Só re-rola se o usuário
  // ainda está no fim e a trava não está ativa. Usa rAF coalescido para
  // não competir com o `followOutput` do Virtuoso.
  const handleTotalListHeightChanged = useCallback(() => {
    if (scrollLockedRef.current) return;
    if (Date.now() - upwardScrollIntentAtRef.current < 1500) return;
    if (userInteractedRef.current && !isAtBottomRef.current) return;
    if (isAtBottomRef.current) scheduleScrollToBottom();
  }, [scheduleScrollToBottom]);

  const handleDeferredContentLoaded = useCallback(() => {
    if (scrollLockedRef.current) return;
    if (Date.now() - upwardScrollIntentAtRef.current < 1500) return;
    if (userInteractedRef.current && !isAtBottomRef.current) return;
    if (isAtBottomRef.current) scheduleScrollToBottom();
  }, [scheduleScrollToBottom]);

  const shouldFollowOutput = useCallback((virtuosoAtBottom: boolean) => {
    if (scrollLockedRef.current) return false;
    if (Date.now() - upwardScrollIntentAtRef.current < 1500) return false;
    return isAtBottomRef.current || virtuosoAtBottom ? 'auto' : false;
  }, []);

  return {
    virtuosoRef,
    messagesContainerRef,
    isInitialPinRef,
    showJumpToBottom,
    setShowJumpToBottom: setShowJumpToBottomSafe,
    unreadBelow,
    setUnreadBelow: setUnreadBelowSafe,
    scrollToBottom,
    handleAtBottomStateChange,
    handleRangeChanged,
    handleTotalListHeightChanged,
    handleDeferredContentLoaded,
    shouldFollowOutput,
  };
}
