import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useEffect } from 'react';
import { subscribeBroker } from '@/lib/realtimeBroker';

/**
 * Returns the number of CONVERSATIONS with at least one unread message
 * (WhatsApp-style). Usa o broker compartilhado — todos os consumidores
 * dividem o mesmo canal por empresa.
 */
function isRelevantUpdate(oldRow: any, newRow: any): boolean {
  if (!oldRow || !newRow) return true;
  return (
    (oldRow.unread_count ?? 0) !== (newRow.unread_count ?? 0) ||
    !!oldRow.is_archived !== !!newRow.is_archived ||
    (oldRow.instance_id ?? null) !== (newRow.instance_id ?? null)
  );
}

export function useUnreadConversations() {
  const { profile, user } = useAuth();
  const companyId = profile?.company_id;
  const userId = user?.id;
  const queryClient = useQueryClient();
  const queryKey = ['unread-conversations-count', companyId, userId];

  const query = useQuery({
    queryKey,
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc(
        'get_user_unread_conversations_count'
      );
      if (error) throw error;
      return Number(data ?? 0);
    },
    enabled: !!companyId && !!userId,
    staleTime: 30_000,
    refetchOnWindowFocus: true,
    retry: (failureCount, err: any) => {
      const code = err?.code || err?.status;
      if (code === '42883' || code === '42703' || code === 404 || code === '404') return false;
      return failureCount < 2;
    },
  });

  useEffect(() => {
    if (!companyId) return;

    let timer: ReturnType<typeof setTimeout> | null = null;
    const debouncedRefetch = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        queryClient.invalidateQueries({ queryKey });
      }, 400);
    };

    const unsubs: Array<() => void> = [];

    unsubs.push(
      subscribeBroker(companyId, {
        table: 'conversations',
        event: 'UPDATE',
        handler: ({ old: o, new: n }: any) => {
          if (isRelevantUpdate(o, n)) debouncedRefetch();
        },
      }),
    );

    unsubs.push(
      subscribeBroker(companyId, {
        table: 'conversations',
        event: 'INSERT',
        handler: ({ new: row }: any) => {
          if (row && !row.is_archived && (row.unread_count ?? 0) > 0) debouncedRefetch();
        },
      }),
    );

    return () => {
      if (timer) clearTimeout(timer);
      unsubs.forEach((u) => u());
    };
  }, [companyId, queryClient]);

  return query.data ?? 0;
}
