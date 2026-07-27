import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useCallback, useEffect, useId, useRef } from 'react';
import {
  applyConversationUpdate,
  conversationRecencyTs as _recencyTs,
  sortByLastMessage as _sortByLastMessage,
} from './conversationListReducer';

export { applyConversationUpdate } from './conversationListReducer';

export interface Conversation {
  id: string;
  company_id: string;
  instance_id: string | null;
  instance_name: string;
  provider: string | null;
  remote_jid: string;
  phone: string;
  contact_name: string | null;
  contact_photo_url: string | null;
  last_message_text: string | null;
  last_message_at: string | null;
  unread_count: number;
  is_archived: boolean;
  closed_at: string | null;
  lead_id: string | null;
  assigned_to: string | null;
  assigned_at: string | null;
  created_at: string;
  updated_at: string;
}

export const conversationRecencyTs = _recencyTs;
export const sortByLastMessage = (list: Conversation[]) => _sortByLastMessage(list);

const CONVERSATION_COLUMNS =
  'id,company_id,instance_id,instance_name,provider,remote_jid,phone,' +
  'contact_name,contact_photo_url,last_message_text,last_message_at,' +
  'unread_count,is_archived,closed_at,lead_id,contact_id,assigned_to,assigned_at,created_at,updated_at';

const CONVERSATIONS_TIMEOUT_MS = 12_000;

const isRateLimited = (err: any) => {
  const code = err?.status ?? err?.code;
  const msg = `${err?.message ?? ''} ${err?.details ?? ''}`.toLowerCase();
  return code === 429 || code === '429' || msg.includes('rate limit') || msg.includes('too many requests');
};

const withTimeout = async <T,>(promise: PromiseLike<T>, ms: number): Promise<T> => {
  let timer: ReturnType<typeof setTimeout> | null = null;
  try {
    return await Promise.race([
      Promise.resolve(promise),
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => reject(new Error('Tempo limite ao carregar conversas')), ms);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
};

export function useConversations(options?: { archived?: boolean; enabled?: boolean }) {
  const archived = !!options?.archived;
  const enabledOpt = options?.enabled ?? true;
  const { profile } = useAuth();
  const companyId = profile?.company_id;
  const queryClient = useQueryClient();
  const instanceId = useId();
  const queryKey = ['conversations', companyId, archived ? 'archived' : 'active'];

  const query = useQuery({
    queryKey,
    queryFn: async () => {
      const { data, error } = await withTimeout(supabase
        .from('conversations')
        .select(CONVERSATION_COLUMNS)
        .eq('company_id', companyId)
        .eq('is_archived', archived)
        .order('last_message_at', { ascending: false, nullsFirst: false })
        .limit(500), CONVERSATIONS_TIMEOUT_MS);

      if (error) throw error;
      return sortByLastMessage((data || []) as unknown as Conversation[]);
    },
    enabled: !!companyId && enabledOpt,
    staleTime: 120_000,
    retry: (failureCount, error: any) => {
      if (isRateLimited(error)) return false;
      if (`${error?.message ?? ''}`.includes('Tempo limite')) return failureCount < 1;
      return failureCount < 2;
    },
  });

  // Realtime — mutação direta do cache. Evita refetch da lista inteira a cada
  // mensagem/ACK, que deixava o chat perceptivelmente lento.
  useEffect(() => {
    if (!companyId) return;

    let countRefreshTimer: ReturnType<typeof setTimeout> | null = null;
    const scheduleCountRefresh = () => {
      if (countRefreshTimer) clearTimeout(countRefreshTimer);
      countRefreshTimer = setTimeout(() => {
        queryClient.invalidateQueries({ queryKey: ['archived-conversations-count', companyId] });
      }, 1_500);
    };

    const matches = (c: Conversation) => !!c.is_archived === archived;

    const channel = supabase
      .channel(`conversations-changes-${companyId}-${archived ? 'a' : 'n'}-${instanceId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'conversations', filter: `company_id=eq.${companyId}` },
        (payload) => {
          const newConv = payload.new as Conversation;
          if (!matches(newConv)) return;
          queryClient.setQueryData<Conversation[]>(queryKey, (old) => {
            if (!old) return [newConv];
            if (old.some(c => c.id === newConv.id)) return old;
            return sortByLastMessage([newConv, ...old]);
          });
          scheduleCountRefresh();
        }
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'conversations', filter: `company_id=eq.${companyId}` },
        (payload) => {
          const updated = payload.new as Conversation;
          const previous = payload.old as Partial<Conversation> | undefined;
          if (!updated?.id) {
            queryClient.invalidateQueries({ queryKey });
            return;
          }
          queryClient.setQueryData<Conversation[]>(queryKey, (old) =>
            applyConversationUpdate(old, updated, archived),
          );
          // Reabertura automática (closed_at: non-null → null) precisa
          // recarregar o ticket ativo da conversa para refletir o novo
          // assigned_to escolhido pelo trigger no banco.
          if (previous?.closed_at && !updated.closed_at) {
            queryClient.invalidateQueries({
              queryKey: ['attendance-ticket', 'conversation', updated.id],
            });
            queryClient.invalidateQueries({ queryKey: ['conversation-tickets', companyId] });
          }
          // ⚠️ NÃO invalidar ['chat-messages', updated.id] aqui — o realtime
          // de chat_messages já mantém o cache atualizado. Invalidar causaria
          // refetch da página inteira a cada novo ACK e flicker visual.
          scheduleCountRefresh();
        }
      )
      .on(
        'postgres_changes',
        { event: 'DELETE', schema: 'public', table: 'conversations', filter: `company_id=eq.${companyId}` },
        (payload) => {
          const deletedId = (payload.old as any)?.id;
          if (deletedId) {
            const removeFrom = (key: unknown[]) => {
              queryClient.setQueryData<Conversation[]>(key as any, (old) => {
                if (!old) return old;
                return old.filter(c => c.id !== deletedId);
              });
            };
            // Remove do cache do filtro atual e do filtro oposto (archived/inbox)
            removeFrom(queryKey);
            removeFrom(['conversations', companyId, !archived, instanceId ?? 'all']);
            // Limpa caches órfãos da conversa excluída
            queryClient.removeQueries({ queryKey: ['chat-messages', deletedId] });
            queryClient.removeQueries({ queryKey: ['attendance-ticket', 'conversation', deletedId] });
            queryClient.removeQueries({ queryKey: ['attendance-tickets', 'history', deletedId] });
          }
          scheduleCountRefresh();
        }
      )
      .subscribe();

    // Safety net: se a aba ficou oculta por mais de 30s e voltou, refetch para
    // recuperar eventos eventualmente perdidos por queda silenciosa do WebSocket.
    let hiddenAt: number | null = null;
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') {
        hiddenAt = Date.now();
      } else if (document.visibilityState === 'visible') {
        if (hiddenAt && Date.now() - hiddenAt > 30_000) {
          queryClient.invalidateQueries({ queryKey });
        }
        hiddenAt = null;
      }
    };
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      if (countRefreshTimer) clearTimeout(countRefreshTimer);
      document.removeEventListener('visibilitychange', onVisibility);
      supabase.removeChannel(channel);
    };
  }, [companyId, queryClient, archived, instanceId]);

  return query;
}

export function useArchivedConversationsCount() {
  const { profile } = useAuth();
  const companyId = profile?.company_id;
  return useQuery({
    queryKey: ['archived-conversations-count', companyId],
    enabled: !!companyId,
    staleTime: 60_000,
    queryFn: async () => {
      const { count, error } = await supabase
        .from('conversations')
        .select('id', { head: true, count: 'exact' })
        .eq('company_id', companyId!)
        .eq('is_archived', true);
      if (error) throw error;
      return count ?? 0;
    },
  });
}

export function useMarkConversationRead() {
  const queryClient = useQueryClient();
  const { profile } = useAuth();
  const companyId = profile?.company_id;

  return useCallback(async (conversationId: string) => {
    let delta = 0;

    queryClient.setQueryData<Conversation[]>(['conversations', companyId, 'active'], (old) => {
      if (!old) return old;
      let changed = false;
      const next = old.map((c) => {
        if (c.id === conversationId && c.unread_count !== 0) {
          changed = true;
          delta = c.unread_count;
          return { ...c, unread_count: 0 };
        }
        return c;
      });
      return changed ? next : old;
    });

    if (delta > 0) {
      queryClient.setQueryData<number>(
        ['unread-conversations-total', companyId],
        (old) => Math.max(0, (old ?? 0) - delta)
      );
    }

    // RPC SECURITY DEFINER: zera unread_count e marca chat_messages recebidas
    // como 'read'. Evita race com RLS UPDATE e mantém status sincronizado.
    const { error } = await (supabase as any).rpc('mark_conversation_read', {
      _conversation_id: conversationId,
    });
    if (error) {
      queryClient.invalidateQueries({ queryKey: ['conversations', companyId, 'active'] });
      queryClient.invalidateQueries({ queryKey: ['unread-conversations-count', companyId] });
    }
  }, [queryClient, companyId]);
}

export function useMarkAllConversationsRead() {
  const queryClient = useQueryClient();
  const { profile } = useAuth();
  const companyId = profile?.company_id;

  return useCallback(async (conversationIds?: string[]) => {
    const idSet = conversationIds && conversationIds.length > 0 ? new Set(conversationIds) : null;

    // Otimismo: zera contadores na cache local imediatamente.
    queryClient.setQueryData<Conversation[]>(['conversations', companyId, 'active'], (old) => {
      if (!old) return old;
      let changed = false;
      const next = old.map((c) => {
        if (c.unread_count > 0 && (!idSet || idSet.has(c.id))) {
          changed = true;
          return { ...c, unread_count: 0 };
        }
        return c;
      });
      return changed ? next : old;
    });
    queryClient.setQueryData<number>(['unread-conversations-total', companyId], 0);

    const { data, error } = await (supabase as any).rpc('mark_all_conversations_read', {
      _conversation_ids: conversationIds && conversationIds.length > 0 ? conversationIds : null,
    });
    if (error) {
      queryClient.invalidateQueries({ queryKey: ['conversations', companyId, 'active'] });
      queryClient.invalidateQueries({ queryKey: ['unread-conversations-count', companyId] });
      throw error;
    }
    return (data as number) ?? 0;
  }, [queryClient, companyId]);
}

export function usePatchConversationLocally() {
  const { profile } = useAuth();
  const queryClient = useQueryClient();
  const companyId = profile?.company_id;

  return useCallback((conversationId: string, patch: Partial<Conversation>) => {
    const key = ['conversations', companyId, 'active'];
    queryClient.setQueryData<Conversation[]>(key, (old) => {
      if (!old) return old;
      const idx = old.findIndex(c => c.id === conversationId);
      if (idx < 0) return old;
      const existing = old[idx];
      const merged = { ...existing, ...patch } as Conversation;

      // Garante anti-regressão de last_message_at (otimista nunca volta).
      if (existing.last_message_at && merged.last_message_at) {
        const te = new Date(existing.last_message_at).getTime();
        const tm = new Date(merged.last_message_at).getTime();
        if (te > tm) merged.last_message_at = existing.last_message_at;
      }

      // Calcula nova posição minimamente — só reordena se o ts subiu o
      // suficiente para passar algum vizinho. Caso contrário, substitui
      // in-place preservando a identidade dos vizinhos (sem flicker).
      const mergedTs = conversationRecencyTs(merged);
      let newIdx = 0;
      for (let i = 0; i < old.length; i++) {
        if (i === idx) continue;
        if (conversationRecencyTs(old[i]) > mergedTs) newIdx++;
        else break;
      }

      if (newIdx === idx) {
        const next = old.slice();
        next[idx] = merged;
        return next;
      }

      const without = old.slice();
      without.splice(idx, 1);
      without.splice(newIdx, 0, merged);
      return without;
    });
  }, [queryClient, companyId]);
}
