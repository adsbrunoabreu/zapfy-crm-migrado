import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useRealtime } from '@/contexts/RealtimeContext';
import { useEffect, useCallback, useState, useMemo, useRef } from 'react';
import {
  compareMessages,
  mergeMessage,
  mergeBatch,
  normalizeFull,
  pickHigherStatus,
  isOutgoingPending,
} from '@/hooks/chat/messageStore';

export interface ChatMessage {
  id: string;
  company_id: string;
  conversation_id: string;
  remote_jid: string;
  message_id: string;
  from_me: boolean;
  message_type: string;
  content: string | null;
  media_url: string | null;
  media_storage_path?: string | null;
  media_mimetype: string | null;
  file_name: string | null;
  duration: number | null;
  latitude: number | null;
  longitude: number | null;
  quoted_message_id: string | null;
  reaction_emoji: string | null;
  status: string;
  sender_name: string | null;
  timestamp: string;
  created_at: string;
  /** Sequência monotônica do servidor — desempate de ordenação. */
  seq?: number;
  link_preview?: LinkPreview | null;
  /** ID estável para React keys, preservado entre otimista e confirmado. */
  client_id?: string;
  /** ID retornado pelo provider (Evolution/Cloud) — chave canônica de ACK. */
  provider_message_id?: string | null;
  /** 'evolution' | 'cloud_api'. */
  provider?: string | null;
  /** Marca local: mensagem removida pelo usuário antes do realtime confirmar. */
  _deletedLocally?: boolean;
  /** Marca local: mensagem editada (mostra "(editada)" no bubble). */
  _edited?: boolean;
  /** Quando a mensagem foi editada (servidor). */
  edited_at?: string | null;
}

export interface LinkPreview {
  url: string;
  title?: string | null;
  description?: string | null;
  image?: string | null;
  site_name?: string | null;
  favicon?: string | null;
  fetched_at?: string;
  error?: string | null;
}

const PAGE_SIZE = 200;
const INITIAL_PAGE_SIZE = 200;

const MESSAGE_COLUMNS = [
  'id', 'company_id', 'conversation_id', 'remote_jid', 'message_id',
  'from_me', 'message_type', 'content', 'media_url', 'media_storage_path',
  'media_mimetype', 'file_name', 'duration', 'latitude', 'longitude',
  'quoted_message_id', 'reaction_emoji', 'status', 'sender_name',
  'timestamp', 'created_at', 'link_preview', 'client_id', 'seq',
  'provider', 'provider_message_id', 'edited_at',
].join(',');

interface OutboundQueueStatus {
  client_id: string;
  status: string;
  provider_message_id: string | null;
  error: string | null;
}

export function useChatMessages(conversationId: string | null) {
  const { profile } = useAuth();
  const companyId = profile?.company_id;
  const queryClient = useQueryClient();
  const realtime = useRealtime();
  const [hasMore, setHasMore] = useState(true);
  const [loadingOlder, setLoadingOlder] = useState(false);

  const queryKey = useMemo(() => ['chat-messages', conversationId], [conversationId]);

  const query = useQuery({
    queryKey,
    queryFn: async () => {
      if (!conversationId) return [];
      // Carga inicial: últimas N mensagens por `seq desc` (sem filtro por
      // `created_at`). Antes filtrávamos por janela de 30 dias, o que
      // escondia o histórico de conversas antigas / importadas, mesmo
      // quando o registro estava gravado em chat_messages.
      const { data, error } = await supabase
        .from('chat_messages')
        .select(MESSAGE_COLUMNS)
        .eq('conversation_id', conversationId)
        .order('seq', { ascending: false })
        .order('timestamp', { ascending: false }) // fallback para linhas sem seq
        .limit(INITIAL_PAGE_SIZE);

      if (error) throw error;

      const list = normalizeFull((data || []) as unknown as ChatMessage[]);

      // Probe: existe alguma mensagem anterior à mais antiga carregada?
      let more = false;
      let minSeq: number | null = null;
      for (const m of list) {
        if (typeof m.seq === 'number' && (minSeq === null || m.seq < minSeq)) minSeq = m.seq;
      }
      if (minSeq !== null) {
        const probe = await supabase
          .from('chat_messages')
          .select('id')
          .eq('conversation_id', conversationId)
          .lt('seq', minSeq)
          .limit(1);
        more = !probe.error && (probe.data?.length || 0) > 0;
      } else {
        more = (data?.length || 0) >= INITIAL_PAGE_SIZE;
      }
      setHasMore(more);
      return list;
    },
    enabled: !!conversationId && !!companyId,
    staleTime: 5_000,
  });


  // Catch-up via seq após reconexão (paginado).
  const catchUp = useCallback(async () => {
    if (!conversationId) return;
    const current = queryClient.getQueryData<ChatMessage[]>(queryKey) || [];
    let maxSeq = 0;
    for (const m of current) {
      if (typeof m.seq === 'number' && m.seq > maxSeq) maxSeq = m.seq;
    }
    if (maxSeq === 0) return;

    const PAGE = 500;
    let cursor = maxSeq;
    let totalFetched = 0;
    const HARD_CAP = 5000;

    while (totalFetched < HARD_CAP) {
      const { data, error } = await supabase
        .from('chat_messages')
        .select(MESSAGE_COLUMNS)
        .eq('conversation_id', conversationId)
        .gt('seq', cursor)
        .order('seq', { ascending: true })
        .limit(PAGE);

      if (error) {
        console.error('[useChatMessages] catchUp error', error);
        return;
      }
      const batch = (data || []) as unknown as ChatMessage[];
      if (batch.length === 0) return;

      queryClient.setQueryData<ChatMessage[]>(queryKey, (old) =>
        mergeBatch(old || [], batch)
      );

      totalFetched += batch.length;
      const lastSeq = batch[batch.length - 1].seq;
      if (typeof lastSeq !== 'number' || batch.length < PAGE) return;
      cursor = lastSeq;
    }
  }, [conversationId, queryClient, queryKey]);

  // Refs estáveis para não recriar o subscribe a cada render.
  const queryKeyRef = useRef(queryKey);
  const catchUpRef = useRef(catchUp);
  useEffect(() => { queryKeyRef.current = queryKey; }, [queryKey]);
  useEffect(() => { catchUpRef.current = catchUp; }, [catchUp]);

  // Realtime: processa delta incremental, NUNCA reordena lista inteira.
  useEffect(() => {
    if (!conversationId || !companyId) return;

    const onInsert = (raw: Record<string, unknown>) => {
      const newMsg = raw as unknown as ChatMessage;
      queryClient.setQueryData<ChatMessage[]>(queryKeyRef.current, (old) =>
        mergeMessage(old || [], newMsg)
      );
    };

    const onUpdate = (raw: Record<string, unknown>) => {
      const updated = raw as unknown as ChatMessage;
      queryClient.setQueryData<ChatMessage[]>(queryKeyRef.current, (old) =>
        mergeMessage(old || [], updated)
      );
    };

    const onDelete = (raw: Record<string, unknown>) => {
      const deletedId = (raw as { id?: string })?.id;
      if (!deletedId) return;
      queryClient.setQueryData<ChatMessage[]>(queryKeyRef.current, (old) => {
        if (!old) return old;
        const idx = old.findIndex((m) => m.id === deletedId);
        if (idx === -1) return old;
        const next = old.slice();
        next.splice(idx, 1);
        return next;
      });
    };

    const unsub = realtime.subscribeConversation(conversationId, {
      onInsert, onUpdate, onDelete,
    });
    const unsubReconnect = realtime.onReconnect(() => { catchUpRef.current?.(); });

    // Sanity check: puxa qualquer INSERT por seq que tenha caído entre
    // o mount do hook e o SUBSCRIBED do canal (gap inicial).
    catchUpRef.current?.();

    // Recupera mensagens perdidas quando a aba volta a ficar visível ou a
    // rede reconecta — protege contra picos de 522/timeout no gateway que
    // podem ter derrubado eventos de realtime sem disparar reconnect.
    const onVisibility = () => {
      if (document.visibilityState === 'visible') catchUpRef.current?.();
    };
    const onOnline = () => { catchUpRef.current?.(); };
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('online', onOnline);

    return () => {
      unsub();
      unsubReconnect();
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('online', onOnline);
    };
    // Deps mínimas: NÃO incluir queryKey/catchUp/realtime (lidos via ref/escopo
    // estável); reassinar a cada render perde INSERTs entre unsub e subscribe.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversationId, companyId, queryClient]);

  // Safety-net: polling para mensagens otimistas presas em "sending".
  useEffect(() => {
    if (!conversationId || !companyId) return;
    const list = (query.data ?? []) as ChatMessage[];
    const pending = list.filter(
      (m) =>
        m.from_me &&
        (m.status === 'sending' || m.status === 'uploading' || m.status === 'pending' || m.status === 'queued') &&
        m.client_id &&
        m.id?.startsWith('optimistic-'),
    );
    if (pending.length === 0) return;

    const clientIds = pending.map((m) => m.client_id!) as string[];
    let attempts = 0;
    const MAX_ATTEMPTS = 45;
    const interval = window.setInterval(async () => {
      attempts++;
      const { data, error } = await supabase
        .from('chat_messages')
        .select(MESSAGE_COLUMNS)
        .eq('conversation_id', conversationId)
        .in('client_id', clientIds)
        .limit(200);

      if (!error && data && data.length > 0) {
        const rows = data as unknown as ChatMessage[];
        queryClient.setQueryData<ChatMessage[]>(queryKey, (old) =>
          mergeBatch(old || [], rows)
        );
      }

      const stillPending = (queryClient.getQueryData<ChatMessage[]>(queryKey) || []).filter(
        (m) =>
          m.from_me &&
          isOutgoingPending(m) &&
          m.client_id &&
          clientIds.includes(m.client_id) &&
          m.id?.startsWith('optimistic-'),
      );

      if (stillPending.length > 0) {
        const ids = stillPending.map((m) => m.client_id!) as string[];
        const { data: queueRows } = await supabase
          .from('outbound_message_queue')
          .select('client_id,status,provider_message_id,error')
          .eq('conversation_id', conversationId)
          .in('client_id', ids);

        if (queueRows && queueRows.length > 0) {
          const byClientId = new Map(
            (queueRows as unknown as OutboundQueueStatus[]).map((r) => [r.client_id, r]),
          );
          queryClient.setQueryData<ChatMessage[]>(queryKey, (old) => {
            if (!old) return old;
            let changed = false;
            const next = old.map((m) => {
              if (!m.client_id || !byClientId.has(m.client_id) || !m.id?.startsWith('optimistic-')) return m;
              const queue = byClientId.get(m.client_id)!;
              if (queue.status === 'sent' || queue.status === 'sent_persist_failed') {
                changed = true;
                return {
                  ...m,
                  status: 'sent',
                  provider_message_id: queue.provider_message_id || m.provider_message_id || null,
                  message_id: queue.provider_message_id || m.message_id,
                };
              }
              if (queue.status === 'dead' || queue.status === 'failed' || queue.status === 'cancelled') {
                changed = true;
                return { ...m, status: 'failed' };
              }
              return m;
            });
            return changed ? next : old;
          });
        }
      }

      if (attempts >= MAX_ATTEMPTS) {
        window.clearInterval(interval);
      }
    }, 2000);

    return () => window.clearInterval(interval);
  }, [conversationId, companyId, query.data, queryClient, queryKey]);

  const loadOlder = useCallback(async () => {
    if (!conversationId || loadingOlder || !hasMore) return;
    const current = queryClient.getQueryData<ChatMessage[]>(queryKey) || [];
    let oldestSeq: number | null = null;
    for (const m of current) {
      if (typeof m.seq === 'number' && (oldestSeq === null || m.seq < oldestSeq)) {
        oldestSeq = m.seq;
      }
    }
    if (oldestSeq === null) return;
    setLoadingOlder(true);
    try {
      const { data, error } = await supabase
        .from('chat_messages')
        .select(MESSAGE_COLUMNS)
        .eq('conversation_id', conversationId)
        .lt('seq', oldestSeq)
        .order('seq', { ascending: false })
        .limit(PAGE_SIZE);

      if (error) throw error;
      const older = (data || []) as unknown as ChatMessage[];
      setHasMore((data?.length || 0) === PAGE_SIZE);
      if (older.length > 0) {
        queryClient.setQueryData<ChatMessage[]>(queryKey, (old) =>
          mergeBatch(old || [], older)
        );
      }
    } finally {
      setLoadingOlder(false);
    }
  }, [conversationId, hasMore, loadingOlder, queryClient, queryKey]);

  // Helpers para cache local/otimista.
  const addOptimisticMessage = useCallback((msg: ChatMessage) => {
    queryClient.setQueryData<ChatMessage[]>(queryKey, (old) => {
      const withClientId = { ...msg, client_id: msg.client_id ?? msg.id };
      return mergeMessage(old || [], withClientId);
    });
  }, [queryClient, queryKey]);

  const replaceCachedMessage = useCallback((targetId: string, msg: ChatMessage) => {
    queryClient.setQueryData<ChatMessage[]>(queryKey, (old) => {
      if (!old) return [msg];
      const idx = old.findIndex(
        (item) => item.id === targetId || item.message_id === targetId
      );
      if (idx === -1) return mergeMessage(old, msg);
      const prev = old[idx];
      const merged: ChatMessage = {
        ...msg,
        client_id: prev.client_id ?? prev.id,
        status: pickHigherStatus(prev.status, msg.status),
      };
      const sortKeyChanged =
        isOutgoingPending(prev) !== isOutgoingPending(merged) ||
        prev.timestamp !== merged.timestamp ||
        prev.seq !== merged.seq;
      const next = old.slice();
      next[idx] = merged;
      if (!sortKeyChanged) return next;
      next.splice(idx, 1);
      let lo = 0, hi = next.length;
      while (lo < hi) {
        const mid = (lo + hi) >>> 1;
        if (compareMessages(next[mid], merged) <= 0) lo = mid + 1;
        else hi = mid;
      }
      next.splice(lo, 0, merged);
      return next;
    });
  }, [queryClient, queryKey]);

  const updateCachedMessage = useCallback((targetId: string, updater: (item: ChatMessage) => ChatMessage) => {
    queryClient.setQueryData<ChatMessage[]>(queryKey, (old) => {
      if (!old) return old;
      const idx = old.findIndex((item) => item.id === targetId || item.message_id === targetId);
      if (idx === -1) return old;
      const next = old.slice();
      next[idx] = updater(old[idx]);
      return next;
    });
  }, [queryClient, queryKey]);

  const removeCachedMessage = useCallback((targetId: string) => {
    queryClient.setQueryData<ChatMessage[]>(queryKey, (old) => {
      if (!old) return old;
      const idx = old.findIndex((item) => item.id === targetId || item.message_id === targetId);
      if (idx === -1) return old;
      const next = old.slice();
      next.splice(idx, 1);
      return next;
    });
  }, [queryClient, queryKey]);

  return {
    ...query,
    hasMore,
    loadingOlder,
    loadOlder,
    addOptimisticMessage,
    replaceCachedMessage,
    updateCachedMessage,
    removeCachedMessage,
  };
}
