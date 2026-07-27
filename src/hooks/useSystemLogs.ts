import { useInfiniteQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useEffect, useMemo } from 'react';

export interface SystemLog {
  id: string;
  company_id: string | null;
  source: string;
  level: string;
  event: string;
  message: string;
  instance_name: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
}

export interface SystemLogsFilters {
  source?: string;
  level?: string;
  instanceName?: string;
  userId?: string;
  companyId?: string;
  dateFrom?: string;
  dateTo?: string;
  search?: string;
  pageSize?: number;
}

const DEFAULT_PAGE_SIZE = 50;

export function useSystemLogs(filters: SystemLogsFilters) {
  const { profile, isMaster } = useAuth();
  const userCompanyId = profile?.company_id;
  const queryClient = useQueryClient();
  const pageSize = filters.pageSize || DEFAULT_PAGE_SIZE;

  // Stable key for filters (ignore pageSize variations not relevant)
  const filterKey = useMemo(
    () => ({
      source: filters.source ?? null,
      level: filters.level ?? null,
      instanceName: filters.instanceName ?? null,
      userId: filters.userId ?? null,
      companyId: filters.companyId ?? null,
      dateFrom: filters.dateFrom ?? null,
      dateTo: filters.dateTo ?? null,
      search: filters.search ?? null,
      pageSize,
    }),
    [
      filters.source,
      filters.level,
      filters.instanceName,
      filters.userId,
      filters.companyId,
      filters.dateFrom,
      filters.dateTo,
      filters.search,
      pageSize,
    ]
  );

  const queryKey = ['system-logs', isMaster ? '__master__' : userCompanyId, filterKey];

  const query = useInfiniteQuery({
    queryKey,
    initialPageParam: null as string | null,
    queryFn: async ({ pageParam }) => {
      let q = (supabase as any)
        .from('system_logs')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(pageSize);

      // Tenant scoping. Master pode filtrar por uma empresa específica via filters.companyId.
      if (isMaster) {
        if (filters.companyId && filters.companyId !== 'all') {
          q = q.eq('company_id', filters.companyId);
        }
      } else if (userCompanyId) {
        q = q.eq('company_id', userCompanyId);
      }

      if (filters.source && filters.source !== 'all') q = q.eq('source', filters.source);
      if (filters.level && filters.level !== 'all') q = q.eq('level', filters.level);
      if (filters.instanceName && filters.instanceName !== 'all') {
        q = q.eq('instance_name', filters.instanceName);
      }
      if (filters.userId && filters.userId !== 'all') {
        q = q.eq('metadata->>user_id', filters.userId);
      }
      if (filters.dateFrom) q = q.gte('created_at', filters.dateFrom);
      if (filters.dateTo) q = q.lte('created_at', filters.dateTo);
      if (filters.search) {
        q = q.or(`message.ilike.%${filters.search}%,event.ilike.%${filters.search}%`);
      }

      // Keyset pagination: pageParam = created_at do último item da página anterior
      if (pageParam) {
        q = q.lt('created_at', pageParam);
      }

      const { data, error } = await q;
      if (error) throw error;
      return (data || []) as SystemLog[];
    },
    enabled: isMaster || !!userCompanyId,
    getNextPageParam: (lastPage) => {
      if (!lastPage || lastPage.length < pageSize) return undefined;
      return lastPage[lastPage.length - 1].created_at;
    },
    staleTime: 15_000,
    gcTime: 5 * 60_000,
    // Atualização periódica leve apenas para a primeira página (fallback ao realtime)
    refetchInterval: 60_000,
    refetchIntervalInBackground: false,
  });

  // Realtime: prepende inserts à primeira página em cache (sem refetch caro)
  useEffect(() => {
    if (!isMaster && !userCompanyId) return;

    const channelName = isMaster
      ? 'system-logs-master'
      : `system-logs-${userCompanyId}`;

    const channel = supabase
      .channel(channelName)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'system_logs',
          ...(isMaster ? {} : { filter: `company_id=eq.${userCompanyId}` }),
        },
        (payload) => {
          const newLog = payload.new as SystemLog;
          if (!newLog) return;

          // Aplica filtros client-side antes de inserir no cache
          if (filters.source && filters.source !== 'all' && newLog.source !== filters.source) return;
          if (filters.level && filters.level !== 'all' && newLog.level !== filters.level) return;
          if (filters.instanceName && filters.instanceName !== 'all' && newLog.instance_name !== filters.instanceName) return;
          if (filters.companyId && filters.companyId !== 'all' && newLog.company_id !== filters.companyId) return;
          if (filters.userId && filters.userId !== 'all') {
            const uid = (newLog.metadata as any)?.user_id;
            if (uid !== filters.userId) return;
          }
          if (filters.search) {
            const s = filters.search.toLowerCase();
            const hit =
              newLog.message?.toLowerCase().includes(s) ||
              newLog.event?.toLowerCase().includes(s);
            if (!hit) return;
          }

          queryClient.setQueryData<any>(queryKey, (old: any) => {
            if (!old || !Array.isArray(old.pages)) return old;
            const [first, ...rest] = old.pages;
            const firstArr: SystemLog[] = Array.isArray(first) ? first : [];
            if (firstArr.some((l) => l.id === newLog.id)) return old;
            const newFirst = [newLog, ...firstArr].slice(0, pageSize + 1);
            return { ...old, pages: [newFirst, ...rest] };
          });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isMaster, userCompanyId, JSON.stringify(filterKey)]);

  const logs = useMemo<SystemLog[]>(() => {
    const pages = (query.data as any)?.pages;
    if (!Array.isArray(pages)) return [];
    return pages.flat().filter(Boolean) as SystemLog[];
  }, [query.data]);

  return {
    ...query,
    logs,
  };
}
