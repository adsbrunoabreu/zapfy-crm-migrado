import { Tag } from 'lucide-react';
import { TagChip, TagCreateRow } from '@/components/settings/TagsManager';
import { useTags } from '@/hooks/useTags';
import { useLeadTags, useAddTagToLead, useRemoveTagFromLead } from '@/hooks/useLeadTags';

export function LeadTagsSection({ leadId, locked = false }: { leadId: string; locked?: boolean }) {
  const { data: allTags } = useTags();
  const { data: leadTags } = useLeadTags(leadId);
  const addTagToLead = useAddTagToLead();
  const removeTagFromLead = useRemoveTagFromLead();

  const assignedIds = leadTags?.map((lt) => lt.tag_id) || [];
  const available = allTags?.filter((t) => !assignedIds.includes(t.id)) || [];

  return (
    <section className="rounded-xl border border-border bg-card/40 p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-semibold flex items-center gap-2">
          <Tag className="w-4 h-4 text-primary" />
          Tags
        </h4>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {leadTags && leadTags.length > 0 ? (
          leadTags.map((lt) => lt.tag && (
            <TagChip
              key={lt.id}
              tag={lt.tag}
              onRemove={locked ? undefined : () => removeTagFromLead.mutate({ leadId, tagId: lt.tag_id, tagName: lt.tag?.name })}
            />
          ))
        ) : (
          <span className="text-xs text-muted-foreground/60">Nenhuma tag atribuída</span>
        )}
      </div>
      {!locked && available.length > 0 && (
        <div className="border-t border-border/50 pt-2">
          <p className="text-[11px] text-muted-foreground mb-1.5">Disponíveis</p>
          <div className="flex flex-wrap gap-1.5">
            {available.map((tag) => (
              <button
                key={tag.id}
                type="button"
                onClick={() => addTagToLead.mutate({ leadId, tagId: tag.id, tagName: tag.name, tagColor: tag.color })}
                className="hover:opacity-80 transition-opacity"
              >
                <TagChip tag={tag} />
              </button>
            ))}
          </div>
        </div>
      )}
      {!locked && (
        <div className="border-t border-border/50 pt-2">
          <TagCreateRow compact placeholder="Nova tag..." />
        </div>
      )}
    </section>
  );
}
