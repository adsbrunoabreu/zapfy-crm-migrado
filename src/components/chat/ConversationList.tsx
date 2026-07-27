import { useEffect, useMemo, useRef } from 'react';
import { AlertCircle, Loader2, MessageSquare, X } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { cn } from '@/lib/utils';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import type { Conversation } from '@/hooks/useConversations';
import { useConversationListState } from './conversation-list/useConversationListState';
import { ConversationListToolbar } from './conversation-list/ConversationListToolbar';
import { StatusFilterBar } from './conversation-list/StatusFilterBar';
import { ConversationListItem } from './conversation-list/ConversationListItem';
import { SelectionActionBar } from './conversation-list/SelectionActionBar';

interface Props {
  conversations: Conversation[];
  selectedId: string | null;
  onSelect: (c: Conversation) => void;
  searchTerm: string;
  onSearchChange: (v: string) => void;
  isLoading: boolean;
  error?: Error | null;
  onRetry?: () => void;
  onNewConversation: () => void;
  onOpenAdvancedSearch?: () => void;
}

export function ConversationList({
  conversations,
  selectedId,
  onSelect,
  searchTerm,
  onSearchChange,
  isLoading,
  error,
  onRetry,
  onNewConversation,
  onOpenAdvancedSearch,
}: Props) {
  const queryClient = useQueryClient();
  const { profile } = useAuth();
  const companyId = profile?.company_id;

  useEffect(() => {
    if (!companyId) return;
    const channel = supabase
      .channel(`lead-tags:${companyId}`)
      .on(
        'postgres_changes' as any,
        { event: '*', schema: 'public', table: 'lead_tags' },
        () => {
          queryClient.invalidateQueries({ queryKey: ['company-lead-tags'] });
        }
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [queryClient, companyId]);

  const {
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
    selectionMode,
    enterSelectionMode,
    exitSelectionMode,
    selectedIds,
    toggleSelectId,
    allVisibleSelected,
    toggleSelectAllVisible,
  } = useConversationListState(conversations, searchTerm, selectedId);

  const selectedItemRef = useRef<HTMLDivElement>(null);
  const lastScrolledIdRef = useRef<string | null>(null);
  const conversationsById = useMemo(
    () => new Map(conversations.map((conversation) => [conversation.id, conversation])),
    [conversations],
  );

  useEffect(() => {
    if (!selectedId) {
      lastScrolledIdRef.current = null;
      return;
    }
    // Só rola quando o selectedId MUDA (não em cada re-render por isLoading
    // ou por mutação da lista). Isso evita que a primeira conversa pareça
    // "sumir" quando o item selecionado é centralizado após cada UPDATE.
    if (lastScrolledIdRef.current === selectedId) return;
    const el = selectedItemRef.current;
    if (!el) return;

    const parent = el.closest('[data-conv-scroll]') as HTMLElement | null;
    const pRect = parent?.getBoundingClientRect();
    const rect = el.getBoundingClientRect();
    const fullyVisible =
      !!pRect && rect.top >= pRect.top && rect.bottom <= pRect.bottom;

    if (!fullyVisible) {
      el.scrollIntoView({ block: 'center', behavior: 'smooth' });
    }
    lastScrolledIdRef.current = selectedId;
  }, [selectedId]);

  return (
    <div className="relative flex flex-col h-full border-r-2 border-border min-w-0">
      <ConversationListToolbar
        searchTerm={searchTerm}
        onSearchChange={onSearchChange}
        selectedTagIds={selectedTagIds}
        setSelectedTagIds={setSelectedTagIds}
        toggleTag={toggleTag}
        allTags={allTags}
        tagCounts={tagCounts}
        sortMode={sortMode}
        setSortMode={setSortMode}
        onNewConversation={onNewConversation}
        onOpenAdvancedSearch={onOpenAdvancedSearch}
        visibleUnreadIds={filtered.filter((c) => c.unread_count > 0).map((c) => c.id)}
        onEnterSelectionMode={selectionMode ? undefined : enterSelectionMode}
      />


      {selectedTagIds.length > 0 && !selectionMode && (
        <div className="flex flex-wrap gap-1.5 px-3 py-2 border-b border-border/50 bg-card/30 shrink-0">
          {selectedTagIds.map((id) => {
            const tag = allTags.find((t) => t.id === id);
            if (!tag) return null;
            const color = tag.color || '#6366f1';
            return (
              <button
                key={id}
                type="button"
                onClick={() => toggleTag(id)}
                className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full border font-medium hover:opacity-80 transition-opacity"
                style={{
                  backgroundColor: `${color}20`,
                  borderColor: `${color}60`,
                  color,
                }}
                aria-label={`Remover filtro ${tag.name}`}
              >
                {tag.name}
                <X className="w-3 h-3" />
              </button>
            );
          })}
        </div>
      )}

      {selectionMode ? (
        <SelectionActionBar
          selectedIds={selectedIds}
          visibleCount={filtered.length}
          allVisibleSelected={allVisibleSelected}
          onToggleSelectAll={toggleSelectAllVisible}
          onClearSelection={() => toggleSelectAllVisible()}
          onExitSelectionMode={exitSelectionMode}
          ticketsByConv={ticketsByConv as any}
          conversationsById={conversationsById}
        />
      ) : (
        <StatusFilterBar
          statusFilter={statusFilter}
          setStatusFilter={setStatusFilter}
          statusCounts={statusCounts}
        />
      )}

      <div data-conv-scroll className="flex-1 overflow-y-auto conversations-scroll">
        {error ? (
          <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
            <AlertCircle className="w-10 h-10 text-destructive/70 mb-3" />
            <p className="text-sm text-foreground">Não foi possível carregar as conversas</p>
            <p className="text-xs text-muted-foreground mt-1 max-w-[240px]">
              {error.message?.includes('429') || error.message?.toLowerCase().includes('rate')
                ? 'Muitas requisições no momento. Aguarde alguns segundos e tente novamente.'
                : error.message || 'Tente novamente em instantes.'}
            </p>
            {onRetry && (
              <button
                type="button"
                onClick={onRetry}
                className="mt-4 text-xs font-medium text-primary hover:underline"
              >
                Tentar novamente
              </button>
            )}
          </div>
        ) : isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
            <MessageSquare className="w-10 h-10 text-muted-foreground/40 mb-3" />
            <p className="text-sm text-muted-foreground">
              {searchTerm ? 'Nenhuma conversa encontrada' : 'Nenhuma conversa ainda'}
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-1 p-2">
            {grouped.flatMap((group) => {
              if (group.items.length === 0) return [];
              return [
                <div
                  key={`header-${group.label}`}
                  className="sticky top-0 z-10 bg-background/95 backdrop-blur-sm px-2 py-1.5 mt-2 first:mt-0"
                >
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                    {group.label}
                  </span>
                </div>,
                ...group.items.map((conv) => {
                  const isSelected = selectedId === conv.id;
                  return (
                    <ConversationListItem
                      key={conv.id}
                      ref={isSelected ? selectedItemRef : undefined}
                      conv={conv}
                      isSelected={isSelected}
                      onSelect={onSelect}
                      tags={getTagsForConv(conv)}
                      ticket={ticketsByConv?.get(conv.id)}
                      selectionMode={selectionMode}
                      isChecked={selectedIds.has(conv.id)}
                      onToggleCheck={toggleSelectId}
                    />
                  );
                }),
              ];
            })}
          </div>
        )}
      </div>
    </div>
  );
}
