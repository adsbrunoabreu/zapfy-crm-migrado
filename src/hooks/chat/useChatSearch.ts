import { useEffect, useState } from 'react';
import { useInfiniteQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

export type ChatSearchMode = 'auto' | 'phone' | 'text';
export type ChatSearchStatus = 'all' | 'unread' | 'waiting' | 'in_progress' | 'closed';

export interface ChatSearchSnippet {
  id: string;
  message_id: string;
  timestamp: string;
  message_type: string;
  from_me: boolean;
  content: string | null;
  file_name: string | null;
  media_mimetype: string | null;
}

export interface ChatSearchResultRow {
  conversation_id: string;
  lead_id: string | null;
  contact_name: string | null;
  phone: string;
  contact_photo_url: string | null;
  unread_count: number;
  ticket_status: string | null;
  ticket_assigned_to: string | null;
  conv_closed_at: string | null;
  last_message_at: string | null;
  match_count: number;
  snippets: ChatSearchSnippet[];
}

export interface ChatSearchFilters {
  query: string;
  mode: ChatSearchMode;
  status: ChatSearchStatus;
  from: Date | null;
  to: Date | null;
  onlyAttachments: boolean;
}

const PAGE = 20;

function useDebounced<T>(value: T, delay = 300): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return v;
}

export function useChatSearch(filters: ChatSearchFilters, enabled: boolean) {
  const { profile } = useAuth();
  const companyId = profile?.company_id;
  const debouncedQuery = useDebounced(filters.query.trim(), 300);

  const hasAnyFilter =
    debouncedQuery.length > 0 ||
    filters.status !== 'all' ||
    filters.from != null ||
    filters.to != null ||
    filters.onlyAttachments;

  const queryKey = [
    'chat-search',
    companyId,
    debouncedQuery,
    filters.mode,
    filters.status,
    filters.from?.toISOString() ?? null,
    filters.to?.toISOString() ?? null,
    filters.onlyAttachments,
  ];

  return useInfiniteQuery({
    queryKey,
    enabled: !!companyId && enabled && hasAnyFilter,
    initialPageParam: 0,
    queryFn: async ({ pageParam }) => {
      const offset = (pageParam as number) ?? 0;
      const { data, error } = await supabase.rpc('search_chat_history', {
        p_query: debouncedQuery || null,
        p_mode: filters.mode,
        p_status: filters.status,
        p_from: filters.from ? filters.from.toISOString() : null,
        p_to: filters.to ? filters.to.toISOString() : null,
        p_only_attachments: filters.onlyAttachments,
        p_limit: PAGE,
        p_offset: offset,
      });
      if (error) throw error;
      return (data || []) as unknown as ChatSearchResultRow[];
    },
    getNextPageParam: (lastPage, pages) => {
      if (!lastPage || lastPage.length < PAGE) return undefined;
      return pages.reduce((acc, p) => acc + p.length, 0);
    },
    staleTime: 30_000,
  });
}
