import { useCallback, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  useConversations,
  conversationRecencyTs,
  sortByLastMessage,
  type Conversation,
} from '@/hooks/useConversations';
import { useTags, type Tag as TagType } from '@/hooks/useTags';
import { useCompanyLeadTags } from '@/hooks/useCompanyLeadTags';
import { useConversationTickets } from '@/hooks/useConversationTickets';
import { useArchivedConversationsCount } from '@/hooks/useConversations';
import type { StatusFilter, SortMode } from './types';

export function useConversationListState(conversations: Conversation[], searchTerm: string, selectedId?: string | null) {
  const [searchParams, setSearchParams] = useSearchParams();

  const selectedTagIds = useMemo(() => {
    const raw = searchParams.get('tags');
    if (!raw) return [] as string[];
    return raw.split(',').filter(Boolean);
  }, [searchParams]);

  const setSelectedTagIds = useCallback((next: string[]) => {
    setSearchParams((prev) => {
      const params = new URLSearchParams(prev);
      if (next.length === 0) params.delete('tags');
      else params.set('tags', next.join(','));
      return params;
    }, { replace: true });
  }, [setSearchParams]);

  const sortMode: SortMode = useMemo(() => {
    const raw = searchParams.get('sort');
    if (raw === 'selected-tags' || raw === 'most-tags' || raw === 'recent') return raw;
    return 'recent';
  }, [searchParams]);

  const setSortMode = useCallback((next: SortMode) => {
    setSearchParams((prev) => {
      const params = new URLSearchParams(prev);
      if (next === 'recent') params.delete('sort');
      else params.set('sort', next);
      return params;
    }, { replace: true });
  }, [setSearchParams]);

  const statusFilter: StatusFilter = useMemo(() => {
    const raw = searchParams.get('status');
    if (raw === 'unread' || raw === 'waiting' || raw === 'in_progress' || raw === 'closed' || raw === 'hidden') return raw;
    return 'all';
  }, [searchParams]);

  const setStatusFilter = useCallback((next: StatusFilter) => {
    setSearchParams((prev) => {
      const params = new URLSearchParams(prev);
      if (next === 'all') params.delete('status');
      else params.set('status', next);
      return params;
    }, { replace: true });
  }, [setSearchParams]);

  const { data: allTags = [] } = useTags();
  const { data: tagsByLead } = useCompanyLeadTags();
  const { data: ticketsByConv } = useConversationTickets();
  const { data: archivedCount = 0 } = useArchivedConversationsCount();
  const { data: activeConversationsForCounts = [] } = useConversations({
    archived: false,
    enabled: statusFilter === 'hidden',
  });
  const { data: archivedConversationsForClosed = [] } = useConversations({
    archived: true,
    enabled: statusFilter === 'closed',
  });

  const getTagsForConv = useCallback((conv: Conversation): TagType[] => {
    if (!conv.lead_id || !tagsByLead) return [];
    return tagsByLead.get(conv.lead_id) || [];
  }, [tagsByLead]);

  const classifyBucket = useCallback((conv: Conversation, ticket?: { status: string; assigned_to: string | null } | null): 'waiting' | 'in_progress' | 'closed' => {
    if (conv.closed_at) return 'closed';
    if (!ticket) return 'waiting';
    if (ticket.status === 'closed' || ticket.status === 'awaiting_rating') return 'closed';
    if (!ticket.assigned_to) return 'waiting';
    return 'in_progress';
  }, []);

  const effectiveConversations = useMemo(() => {
    if (statusFilter === 'closed') {
      const seen = new Set<string>();
      const merged: Conversation[] = [];
      for (const c of [...conversations, ...archivedConversationsForClosed]) {
        if (seen.has(c.id)) continue;
        seen.add(c.id);
        merged.push(c);
      }
      return sortByLastMessage(merged);
    }
    return sortByLastMessage(conversations);
  }, [conversations, archivedConversationsForClosed, statusFilter]);

  const countsSource = statusFilter === 'hidden'
    ? activeConversationsForCounts
    : statusFilter === 'closed'
      ? effectiveConversations
      : conversations;

  const statusCounts = useMemo(() => {
    const counts = { all: 0, unread: 0, waiting: 0, in_progress: 0, closed: 0, hidden: archivedCount };
    countsSource.forEach((c) => {
      counts.all += 1;
      const t = ticketsByConv?.get(c.id);
      const bucket = classifyBucket(c, t);
      counts[bucket] += 1;
      if (c.unread_count > 0) counts.unread += 1;
    });
    return counts;
  }, [countsSource, ticketsByConv, classifyBucket, archivedCount]);

  const tagCounts = useMemo(() => {
    const counts = new Map<string, number>();
    const term = searchTerm.toLowerCase();
    countsSource.forEach((c) => {
      if (term) {
        const matches =
          (c.contact_name || '').toLowerCase().includes(term) ||
          c.phone.includes(term) ||
          (c.last_message_text || '').toLowerCase().includes(term);
        if (!matches) return;
      }
      const tags = getTagsForConv(c);
      tags.forEach((t) => counts.set(t.id, (counts.get(t.id) || 0) + 1));
    });
    return counts;
  }, [countsSource, getTagsForConv, searchTerm]);

  const filtered = useMemo(() => effectiveConversations.filter(c => {
    const term = searchTerm.toLowerCase();
    const matchesText =
      (c.contact_name || '').toLowerCase().includes(term) ||
      c.phone.includes(term) ||
      (c.last_message_text || '').toLowerCase().includes(term);
    if (!matchesText) return false;

    if (selectedTagIds.length > 0) {
      const convTagIds = getTagsForConv(c).map((t) => t.id);
      if (!selectedTagIds.some((id) => convTagIds.includes(id))) return false;
    }

    if (statusFilter !== 'all' && statusFilter !== 'hidden') {
      const t = ticketsByConv?.get(c.id);
      if (statusFilter === 'unread') {
        if (c.unread_count <= 0) return false;
      } else {
        if (classifyBucket(c, t) !== statusFilter) return false;
      }
    }
    return true;
  }), [effectiveConversations, searchTerm, selectedTagIds, getTagsForConv, statusFilter, ticketsByConv, classifyBucket]);

  const grouped = useMemo(() => {
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);
    const startOfYesterday = new Date(startOfToday);
    startOfYesterday.setDate(startOfYesterday.getDate() - 1);
    const startOfWeek = new Date(startOfToday);
    startOfWeek.setDate(startOfWeek.getDate() - 7);

    const groups: { label: string; items: Conversation[] }[] = [
      { label: 'Hoje', items: [] },
      { label: 'Ontem', items: [] },
      { label: 'Esta semana', items: [] },
      { label: 'Anteriores', items: [] },
    ];

    filtered.forEach((c) => {
      const ts = conversationRecencyTs(c);
      if (ts >= startOfToday.getTime()) groups[0].items.push(c);
      else if (ts >= startOfYesterday.getTime()) groups[1].items.push(c);
      else if (ts >= startOfWeek.getTime()) groups[2].items.push(c);
      else groups[3].items.push(c);
    });

    groups.forEach((g) => {
      g.items.sort((a, b) => conversationRecencyTs(b) - conversationRecencyTs(a));
    });

    return groups;
  }, [filtered]);

  const toggleTag = useCallback((tagId: string) => {
    const next = selectedTagIds.includes(tagId)
      ? selectedTagIds.filter((id) => id !== tagId)
      : [...selectedTagIds, tagId];
    setSelectedTagIds(next);
  }, [selectedTagIds, setSelectedTagIds]);

  // ---- Modo de seleção em massa ----
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());

  const enterSelectionMode = useCallback(() => {
    setSelectionMode(true);
    setSelectedIds(new Set());
  }, []);

  const exitSelectionMode = useCallback(() => {
    setSelectionMode(false);
    setSelectedIds(new Set());
  }, []);

  const toggleSelectId = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const clearSelection = useCallback(() => {
    setSelectedIds(new Set());
  }, []);

  const visibleIds = useMemo(() => filtered.map((c) => c.id), [filtered]);
  const allVisibleSelected = visibleIds.length > 0 && visibleIds.every((id) => selectedIds.has(id));

  const toggleSelectAllVisible = useCallback(() => {
    setSelectedIds((prev) => {
      if (visibleIds.length > 0 && visibleIds.every((id) => prev.has(id))) {
        const next = new Set(prev);
        visibleIds.forEach((id) => next.delete(id));
        return next;
      }
      const next = new Set(prev);
      visibleIds.forEach((id) => next.add(id));
      return next;
    });
  }, [visibleIds]);

  return {
    allTags,
    selectedTagIds,
    setSelectedTagIds,
    toggleTag,
    sortMode,
    setSortMode,
    statusFilter,
    setStatusFilter,
    statusCounts,
    tagCounts,
    filtered,
    grouped,
    ticketsByConv,
    getTagsForConv,
    // selection
    selectionMode,
    enterSelectionMode,
    exitSelectionMode,
    selectedIds,
    toggleSelectId,
    clearSelection,
    allVisibleSelected,
    toggleSelectAllVisible,
  };
}
