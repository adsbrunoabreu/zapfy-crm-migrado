import { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Loader2, Search, X } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { ChatSearchFiltersBar } from './ChatSearchFilters';
import { ChatSearchResultItem } from './ChatSearchResultItem';
import { useChatSearch, type ChatSearchFilters, type ChatSearchSnippet } from '@/hooks/chat/useChatSearch';

interface Props {
  open: boolean;
  onClose: () => void;
  onJump: (conversationId: string, messageId: string | null) => void;
}

const DEFAULT_FILTERS: ChatSearchFilters = {
  query: '',
  mode: 'auto',
  status: 'all',
  from: null,
  to: null,
  onlyAttachments: false,
};

export function ChatSearchPanel({ open, onClose, onJump }: Props) {
  const [filters, setFilters] = useState<ChatSearchFilters>(DEFAULT_FILTERS);

  // Reset on close
  useEffect(() => {
    if (!open) setFilters(DEFAULT_FILTERS);
  }, [open]);

  const update = (next: Partial<ChatSearchFilters>) =>
    setFilters((prev) => ({ ...prev, ...next }));

  const { data, isFetching, isError, error, hasNextPage, fetchNextPage, isFetchingNextPage } =
    useChatSearch(filters, open);

  const rows = useMemo(() => data?.pages.flat() ?? [], [data]);
  const total = rows.length;

  if (!open) return null;

  const debouncedQuery = filters.query.trim();

  return (
    <div className="absolute inset-0 z-30 flex flex-col bg-background border-r-2 border-border">
      <div className="h-14 px-3 border-b border-border/50 bg-card/50 flex items-center gap-2 shrink-0">
        <Button variant="ghost" size="icon" onClick={onClose} aria-label="Voltar">
          <ArrowLeft className="w-4 h-4" />
        </Button>
        <div className="relative flex-1 min-w-0">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            autoFocus
            placeholder="Buscar mensagens, telefone, nome..."
            value={filters.query}
            onChange={(e) => update({ query: e.target.value })}
            className="pl-9 pr-8 h-9 bg-secondary/50 border-border/50"
          />
          {filters.query && (
            <button
              type="button"
              onClick={() => update({ query: '' })}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              aria-label="Limpar"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      <ChatSearchFiltersBar filters={filters} onChange={update} totalCount={rows.length} />

      <div className="flex-1 overflow-y-auto p-2 flex flex-col gap-2">
        {isError && (
          <div className="text-xs text-destructive p-3 text-center">
            Erro ao buscar: {(error as Error)?.message || 'tente novamente'}
          </div>
        )}

        {!isFetching && rows.length === 0 && (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <Search className="w-10 h-10 text-muted-foreground/40 mb-3" />
            <p className="text-sm text-muted-foreground">
              {debouncedQuery || filters.status !== 'all' || filters.from || filters.to || filters.onlyAttachments
                ? 'Nenhum resultado encontrado'
                : 'Digite algo para buscar no histórico'}
            </p>
            <p className="text-xs text-muted-foreground/70 mt-1">
              Busca por texto, nome ou telefone do lead
            </p>
          </div>
        )}

        {rows.map((row) => (
          <ChatSearchResultItem
            key={row.conversation_id}
            row={row}
            query={debouncedQuery}
            onJump={(convId, snippet: ChatSearchSnippet) =>
              onJump(convId, snippet?.message_id ?? null)
            }
          />
        ))}

        {isFetching && (
          <div className="flex items-center justify-center py-4">
            <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
          </div>
        )}

        {hasNextPage && !isFetching && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => fetchNextPage()}
            disabled={isFetchingNextPage}
            className="self-center"
          >
            {isFetchingNextPage ? 'Carregando...' : 'Carregar mais'}
          </Button>
        )}
      </div>
    </div>
  );
}
