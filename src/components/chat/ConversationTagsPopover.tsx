import { useState } from 'react';
import { Tag as TagIcon, Loader2 } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { useTags } from '@/hooks/useTags';
import { useAddTagToLead, useRemoveTagFromLead } from '@/hooks/useLeadTags';
import { useQueryClient } from '@tanstack/react-query';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

interface ConversationTagsPopoverProps {
  leadId: string | null;
  currentTagIds: string[];
}

/**
 * Botão compacto que abre um popover para adicionar/remover tags do lead
 * vinculado à conversa, sem sair da lista.
 */
export function ConversationTagsPopover({ leadId, currentTagIds }: ConversationTagsPopoverProps) {
  const [open, setOpen] = useState(false);
  const { data: allTags = [] } = useTags();
  const addTag = useAddTagToLead();
  const removeTag = useRemoveTagFromLead();
  const queryClient = useQueryClient();
  const pending = addTag.isPending || removeTag.isPending;

  const handleToggle = async (tagId: string, tagName: string, tagColor?: string | null) => {
    if (!leadId) {
      toast.error('Esta conversa ainda não está vinculada a um lead.');
      return;
    }
    try {
      if (currentTagIds.includes(tagId)) {
        await removeTag.mutateAsync({ leadId, tagId, tagName });
      } else {
        await addTag.mutateAsync({ leadId, tagId, tagName, tagColor: tagColor || undefined });
      }
      // refresca o cache global usado pelo Chat
      queryClient.invalidateQueries({ queryKey: ['company-lead-tags'] });
    } catch (e) {
      // o hook já dispara toast em onError
    }
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            setOpen((v) => !v);
          }}
          className={cn(
            'shrink-0 inline-flex items-center justify-center rounded-md w-7 h-7',
            'text-muted-foreground hover:text-foreground hover:bg-background/80',
            'opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity',
            open && 'opacity-100 bg-background/80 text-foreground'
          )}
          title={leadId ? 'Gerenciar tags' : 'Conversa sem lead vinculado'}
          disabled={!leadId}
        >
          <TagIcon className="w-3.5 h-3.5" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        className="w-60 p-2"
        align="end"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-2 py-1 mb-1 flex items-center justify-between">
          <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Tags do lead
          </span>
          {pending && <Loader2 className="w-3 h-3 animate-spin text-muted-foreground" />}
        </div>
        <div className="max-h-64 overflow-y-auto">
          {allTags.length === 0 ? (
            <p className="text-xs text-muted-foreground px-2 py-3 text-center">
              Nenhuma tag cadastrada
            </p>
          ) : (
            allTags.map((tag) => {
              const active = currentTagIds.includes(tag.id);
              return (
                <button
                  key={tag.id}
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleToggle(tag.id, tag.name, tag.color);
                  }}
                  disabled={pending}
                  className={cn(
                    'w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-left text-sm transition-colors',
                    active ? 'bg-accent' : 'hover:bg-accent/60',
                    pending && 'opacity-60 cursor-wait'
                  )}
                >
                  <span
                    className="w-3 h-3 rounded-full shrink-0 border border-border"
                    style={{ backgroundColor: tag.color || '#888' }}
                  />
                  <span className="flex-1 truncate">{tag.name}</span>
                  {active && <span className="text-primary text-xs">✓</span>}
                </button>
              );
            })
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
