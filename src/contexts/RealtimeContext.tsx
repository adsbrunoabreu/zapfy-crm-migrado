/**
 * RealtimeContext — multiplex de Realtime do Supabase.
 *
 * - Abre 1 ÚNICO canal por empresa (filtro company_id), em vez de um canal
 *   por conversa. Reduz drasticamente o número de subscriptions WebSocket.
 * - Despacha INSERT/UPDATE/DELETE de `chat_messages` para os handlers
 *   registrados de cada conversa.
 * - Expõe estado global de conexão: online / reconnecting / offline.
 * - Reconnect robusto: detecta CHANNEL_ERROR/CLOSED/TIMED_OUT, sinaliza
 *   "reconnecting" e re-cria o canal com backoff. Ao voltar para online,
 *   dispara callbacks de catch-up (`onReconnect`).
 */
import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

export type RealtimeStatus = 'online' | 'reconnecting' | 'offline';

export interface ConversationRealtimeHandlers {
  onInsert?: (row: Record<string, unknown>) => void;
  onUpdate?: (row: Record<string, unknown>) => void;
  onDelete?: (row: Record<string, unknown>) => void;
}

interface RealtimeAPI {
  status: RealtimeStatus;
  subscribeConversation: (
    conversationId: string,
    handlers: ConversationRealtimeHandlers,
  ) => () => void;
  /** Recebe TODOS os eventos de chat_messages da empresa, independente de conversation_id. */
  subscribeAllChatMessages: (handlers: ConversationRealtimeHandlers) => () => void;
  /** Registra callback para ser chamado sempre que o canal voltar ao ar. */
  onReconnect: (cb: () => void) => () => void;
}

const RealtimeCtx = createContext<RealtimeAPI | null>(null);

const BACKOFF_MS = [1_000, 2_000, 5_000, 10_000, 20_000, 30_000];

export function RealtimeProvider({ children }: { children: ReactNode }) {
  const { profile } = useAuth();
  const companyId = profile?.company_id ?? null;

  const [status, setStatus] = useState<RealtimeStatus>(
    typeof navigator !== 'undefined' && navigator.onLine === false ? 'offline' : 'reconnecting',
  );

  const handlersRef = useRef<Map<string, Set<ConversationRealtimeHandlers>>>(new Map());
  const globalHandlersRef = useRef<Set<ConversationRealtimeHandlers>>(new Set());
  const reconnectCbsRef = useRef<Set<() => void>>(new Set());
  const channelRef = useRef<RealtimeChannel | null>(null);
  const reconnectAttemptRef = useRef(0);
  const reconnectTimerRef = useRef<number | null>(null);

  // Tracking de transição: dispara reconnect callbacks só quando saímos de
  // um estado degradado e voltamos para online.
  const prevStatusRef = useRef<RealtimeStatus>(status);

  useEffect(() => {
    if (prevStatusRef.current !== 'online' && status === 'online') {
      reconnectCbsRef.current.forEach((cb) => {
        try { cb(); } catch (e) { console.error('[Realtime] reconnect cb error', e); }
      });
    }
    prevStatusRef.current = status;
  }, [status]);

  // Detecta online/offline da rede.
  useEffect(() => {
    const handleOnline = () => {
      // Força re-subscribe após volta de rede.
      setStatus('reconnecting');
      reconnectAttemptRef.current = 0;
      scheduleReconnect(0);
    };
    const handleOffline = () => setStatus('offline');
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Sincroniza o JWT do Realtime quando o Supabase renova o token.
  // Sem isso, o servidor derruba o WebSocket ~1h após o login e o usuário
  // vê "Reconectando…" mesmo com o tab ocioso em primeiro plano.
  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'TOKEN_REFRESHED' || event === 'SIGNED_IN') {
        if (session?.access_token) {
          try {
            supabase.realtime.setAuth(session.access_token);
          } catch (e) {
            console.warn('[Realtime] setAuth failed', e);
          }
        }
      }
    });
    return () => subscription.unsubscribe();
  }, []);

  const dispatch = (
    event: 'INSERT' | 'UPDATE' | 'DELETE',
    row: Record<string, unknown>,
  ) => {
    // Fan-out global (sound, badges, etc.)
    globalHandlersRef.current.forEach((h) => {
      try {
        if (event === 'INSERT') h.onInsert?.(row);
        else if (event === 'UPDATE') h.onUpdate?.(row);
        else h.onDelete?.(row);
      } catch (e) {
        console.error('[Realtime] global handler error', e);
      }
    });

    const conversationId = (row?.conversation_id as string | undefined) ?? null;
    if (!conversationId) return;
    const set = handlersRef.current.get(conversationId);
    if (!set || set.size === 0) return;
    set.forEach((h) => {
      try {
        if (event === 'INSERT') h.onInsert?.(row);
        else if (event === 'UPDATE') h.onUpdate?.(row);
        else h.onDelete?.(row);
      } catch (e) {
        console.error('[Realtime] handler error', e);
      }
    });
  };

  const teardownChannel = () => {
    if (channelRef.current) {
      supabase.removeChannel(channelRef.current).catch(() => undefined);
      channelRef.current = null;
    }
  };

  const scheduleReconnect = (delayMs?: number) => {
    if (reconnectTimerRef.current) {
      window.clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }
    const attempt = reconnectAttemptRef.current;
    const wait =
      typeof delayMs === 'number' ? delayMs : BACKOFF_MS[Math.min(attempt, BACKOFF_MS.length - 1)];
    reconnectTimerRef.current = window.setTimeout(() => {
      reconnectAttemptRef.current = attempt + 1;
      buildChannel();
    }, wait);
  };

  const buildChannel = () => {
    if (!companyId) return;
    teardownChannel();

    const channel = supabase
      .channel(`realtime-company-${companyId}`, { config: { broadcast: { ack: false } } })
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'chat_messages',
          filter: `company_id=eq.${companyId}`,
        },
        (payload) => dispatch('INSERT', payload.new as Record<string, unknown>),
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'chat_messages',
          filter: `company_id=eq.${companyId}`,
        },
        (payload) => dispatch('UPDATE', payload.new as Record<string, unknown>),
      )
      .on(
        'postgres_changes',
        {
          event: 'DELETE',
          schema: 'public',
          table: 'chat_messages',
          filter: `company_id=eq.${companyId}`,
        },
        (payload) => dispatch('DELETE', payload.old as Record<string, unknown>),
      )
      .subscribe((s) => {
        if (s === 'SUBSCRIBED') {
          reconnectAttemptRef.current = 0;
          setStatus('online');
        } else if (s === 'CHANNEL_ERROR' || s === 'TIMED_OUT' || s === 'CLOSED') {
          setStatus(navigator.onLine === false ? 'offline' : 'reconnecting');
          // Recria o canal — supabase-js às vezes rejoin sozinho, mas
          // forçar garantia evita ficar preso em CLOSED silencioso.
          scheduleReconnect();
        }
      });

    channelRef.current = channel;
  };

  // (Re)cria canal sempre que a empresa do usuário mudar.
  useEffect(() => {
    if (!companyId) {
      teardownChannel();
      setStatus('offline');
      return;
    }
    setStatus('reconnecting');
    reconnectAttemptRef.current = 0;
    buildChannel();
    return () => {
      if (reconnectTimerRef.current) window.clearTimeout(reconnectTimerRef.current);
      teardownChannel();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyId]);

  // API estável: subscribe/onReconnect NÃO devem mudar de identidade quando
  // `status` flutua. Consumidores que precisam do status devem usar
  // `useRealtimeStatus()`.
  const subscribeConversationRef = useRef<RealtimeAPI['subscribeConversation']>(
    (conversationId, handlers) => {
      let set = handlersRef.current.get(conversationId);
      if (!set) {
        set = new Set();
        handlersRef.current.set(conversationId, set);
      }
      set.add(handlers);
      return () => {
        const s = handlersRef.current.get(conversationId);
        if (!s) return;
        s.delete(handlers);
        if (s.size === 0) handlersRef.current.delete(conversationId);
      };
    },
  );
  const subscribeAllChatMessagesRef = useRef<RealtimeAPI['subscribeAllChatMessages']>(
    (handlers) => {
      globalHandlersRef.current.add(handlers);
      return () => {
        globalHandlersRef.current.delete(handlers);
      };
    },
  );
  const onReconnectRef = useRef<RealtimeAPI['onReconnect']>((cb) => {
    reconnectCbsRef.current.add(cb);
    return () => { reconnectCbsRef.current.delete(cb); };
  });

  const api = useMemo<RealtimeAPI>(() => ({
    status,
    subscribeConversation: (conversationId, handlers) =>
      subscribeConversationRef.current(conversationId, handlers),
    subscribeAllChatMessages: (handlers) => subscribeAllChatMessagesRef.current(handlers),
    onReconnect: (cb) => onReconnectRef.current(cb),
  }), [status]);

  return <RealtimeCtx.Provider value={api}>{children}</RealtimeCtx.Provider>;
}

export function useRealtime(): RealtimeAPI {
  const ctx = useContext(RealtimeCtx);
  if (!ctx) {
    // Fallback no-op para testes ou árvores que ainda não montaram o provider.
    return {
      status: 'online',
      subscribeConversation: () => () => undefined,
      subscribeAllChatMessages: () => () => undefined,
      onReconnect: () => () => undefined,
    };
  }
  return ctx;
}
