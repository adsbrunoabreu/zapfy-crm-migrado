import { memo, useState } from 'react';
import { Search, Tag as TagIcon, ArrowUpDown, Plus, CheckSquare } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { SORT_OPTIONS } from './constants';
import { useMarkAllConversationsRead } from '@/hooks/useConversations';
import type { Tag as TagType } from '@/hooks/useTags';
import type { SortMode } from './types';

interface Props {
  searchTerm: string;
  onSearchChange: (v: string) => void;
  selectedTagIds: string[];
  setSelectedTagIds: (next: string[]) => void;
  toggleTag: (id: string) => void;
  allTags: TagType[];
  tagCounts: Map<string, number>;
  sortMode: SortMode;
  setSortMode: (m: SortMode) => void;
  onNewConversation: () => void;
  onOpenAdvancedSearch?: () => void;
  visibleUnreadIds?: string[];
  totalUnread?: number;
  onEnterSelectionMode?: () => void;
}

export const ConversationListToolbar = memo(function ConversationListToolbar({
  searchTerm, onSearchChange, selectedTagIds, setSelectedTagIds, toggleTag,
  allTags, tagCounts, sortMode, setSortMode, onNewConversation, onOpenAdvancedSearch,
  visibleUnreadIds, totalUnread, onEnterSelectionMode,
}: Props) {
  const markAllRead = useMarkAllConversationsRead();
  const [busy, setBusy] = useState(false);
  const visibleUnreadCount = visibleUnreadIds?.length ?? 0;
  const hasUnread = visibleUnreadCount > 0;

  const handleMarkAll = async () => {
    if (!hasUnread || busy) return;
    setBusy(true);
    try {
      const n = await markAllRead(visibleUnreadIds);
      toast.success(n > 0 ? `${n} conversa${n > 1 ? 's' : ''} marcada${n > 1 ? 's' : ''} como lida${n > 1 ? 's' : ''}` : 'Nada a marcar');
    } catch (e: any) {
      toast.error(e?.message || 'Falha ao marcar como lidas');
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="h-14 px-3 border-b border-border/50 bg-card/50 flex items-center gap-2 shrink-0">
      <div className="relative flex-1 min-w-0">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          placeholder="Pesquisar conversa..."
          value={searchTerm}
          onChange={(e) => onSearchChange(e.target.value)}
          className="pl-9 h-9 bg-secondary/50 border-border/50"
        />
      </div>
      <Popover>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            size="icon"
            className={cn('shrink-0 relative', selectedTagIds.length > 0 && 'border-primary text-primary')}
            title="Filtrar por tag"
          >
            <TagIcon className="w-4 h-4" />
            {selectedTagIds.length > 0 && (
              <span className="absolute -top-1 -right-1 inline-flex items-center justify-center bg-primary text-primary-foreground text-[10px] font-semibold leading-none rounded-full h-[18px] min-w-[18px] px-1 border border-background">
                {selectedTagIds.length}
              </span>
            )}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-64 p-2" align="end">
          <div className="flex items-center justify-between px-2 py-1 mb-1">
            <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Filtrar por tag</span>
            {selectedTagIds.length > 0 && (
              <button onClick={() => setSelectedTagIds([])} className="text-xs text-primary hover:underline">Limpar</button>
            )}
          </div>
          <div className="max-h-64 overflow-y-auto">
            {allTags.length === 0 ? (
              <p className="text-xs text-muted-foreground px-2 py-3 text-center">Nenhuma tag cadastrada</p>
            ) : (
              allTags.map((tag) => {
                const active = selectedTagIds.includes(tag.id);
                const count = tagCounts.get(tag.id) || 0;
                return (
                  <button
                    key={tag.id}
                    onClick={() => toggleTag(tag.id)}
                    className={cn(
                      'w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-left text-sm transition-colors',
                      active ? 'bg-accent' : 'hover:bg-accent/60',
                      count === 0 && !active && 'opacity-50'
                    )}
                  >
                    <span className="w-3 h-3 rounded-full shrink-0 border border-border" style={{ backgroundColor: tag.color || '#888' }} />
                    <span className="flex-1 truncate">{tag.name}</span>
                    <span className={cn(
                      'text-[11px] tabular-nums px-1.5 py-0.5 rounded-full min-w-[22px] text-center',
                      active ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'
                    )}>{count}</span>
                    {active && <span className="text-primary text-xs">✓</span>}
                  </button>
                );
              })
            )}
          </div>
        </PopoverContent>
      </Popover>
      <Popover>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            size="icon"
            className={cn('shrink-0 relative', sortMode !== 'recent' && 'border-primary text-primary')}
            title="Ordenar conversas"
          >
            <ArrowUpDown className="w-4 h-4" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-64 p-2" align="end">
          <div className="px-2 py-1 mb-1">
            <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Ordenar por</span>
          </div>
          <div className="flex flex-col">
            {SORT_OPTIONS.map((opt) => {
              const active = sortMode === opt.value;
              const disabled = opt.value === 'selected-tags' && selectedTagIds.length === 0;
              return (
                <button
                  key={opt.value}
                  onClick={() => !disabled && setSortMode(opt.value)}
                  disabled={disabled}
                  className={cn(
                    'w-full flex items-start gap-2 px-2 py-2 rounded-md text-left transition-colors',
                    active ? 'bg-accent' : 'hover:bg-accent/60',
                    disabled && 'opacity-50 cursor-not-allowed'
                  )}
                >
                  <span className="flex-1">
                    <span className="block text-sm font-medium">{opt.label}</span>
                    <span className="block text-[11px] text-muted-foreground leading-tight mt-0.5">
                      {disabled ? 'Selecione uma tag para ativar' : opt.description}
                    </span>
                  </span>
                  {active && <span className="text-primary text-xs mt-0.5">✓</span>}
                </button>
              );
            })}
          </div>
        </PopoverContent>
      </Popover>
      {onEnterSelectionMode && (
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="outline"
              size="icon"
              className="shrink-0"
              onClick={onEnterSelectionMode}
              aria-label="Selecionar conversas"
            >
              <CheckSquare className="w-4 h-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Selecionar conversas</TooltipContent>
        </Tooltip>
      )}
      <Tooltip>
        <TooltipTrigger asChild>
          <Button variant="default" size="icon" className="shrink-0" onClick={onNewConversation} aria-label="Nova conversa">
            <Plus className="w-4 h-4" />
          </Button>
        </TooltipTrigger>
        <TooltipContent>Nova conversa</TooltipContent>
      </Tooltip>
    </div>
  );
});
