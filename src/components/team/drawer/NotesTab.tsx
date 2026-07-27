import { useEffect, useState } from 'react';
import { format, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Loader2, Plus, Tag as TagIcon, Trash2, Pencil, X, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { useAuth } from '@/contexts/AuthContext';
import {
  useMemberNotes,
  useCreateMemberNote,
  useUpdateMemberNote,
  useDeleteMemberNote,
  useUpdateMemberTags,
} from '@/hooks/useMemberCrm';

interface Props {
  member: any;
}

export function NotesTab({ member }: Props) {
  const { profile } = useAuth();
  const isAdmin = profile?.role === 'admin' || profile?.role === 'master';

  // tags
  const [tags, setTags] = useState<string[]>(member?.tags ?? []);
  const [tagInput, setTagInput] = useState('');
  const tagMutation = useUpdateMemberTags();

  useEffect(() => {
    setTags(member?.tags ?? []);
  }, [member?.id]);

  const tagsDirty =
    JSON.stringify([...tags].sort()) !==
    JSON.stringify([...(member?.tags ?? [])].sort());

  const addTag = () => {
    const v = tagInput.trim().toLowerCase();
    if (!v || tags.includes(v) || v.length > 32) return;
    setTags([...tags, v].slice(0, 20));
    setTagInput('');
  };

  // notas
  const { data: notes = [], isLoading } = useMemberNotes(member?.id || null);
  const create = useCreateMemberNote();
  const update = useUpdateMemberNote();
  const del = useDeleteMemberNote();
  const [draft, setDraft] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingText, setEditingText] = useState('');

  return (
    <div className="space-y-4">
      {/* TAGS */}
      <section className="space-y-2">
        <h4 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
          <TagIcon className="w-3.5 h-3.5" /> Tags
        </h4>
        <div className="flex flex-wrap gap-1.5">
          {tags.length === 0 && (
            <p className="text-xs text-muted-foreground">Nenhuma tag.</p>
          )}
          {tags.map((t) => (
            <Badge key={t} variant="outline" className="gap-1 text-[11px] h-6 pl-2 pr-1">
              {t}
              {isAdmin && (
                <button
                  type="button"
                  onClick={() => setTags(tags.filter((x) => x !== t))}
                  className="hover:text-destructive"
                  aria-label={`Remover ${t}`}
                >
                  <X className="w-3 h-3" />
                </button>
              )}
            </Badge>
          ))}
        </div>
        {isAdmin && (
          <div className="flex gap-2">
            <Input
              value={tagInput}
              onChange={(e) => setTagInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  addTag();
                }
              }}
              placeholder="ex.: vendas, suporte"
              className="h-8 text-sm"
              maxLength={32}
            />
            <Button size="sm" variant="outline" onClick={addTag} disabled={!tagInput.trim()}>
              <Plus className="w-3.5 h-3.5" />
            </Button>
            <Button
              size="sm"
              variant="glow"
              disabled={!tagsDirty || tagMutation.isPending}
              onClick={() => tagMutation.mutate({ memberId: member.id, tags })}
            >
              {tagMutation.isPending && <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" />}
              Salvar
            </Button>
          </div>
        )}
      </section>

      {/* NOTAS */}
      <section className="space-y-2 pt-3 border-t border-border">
        <h4 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          Observações internas
        </h4>

        <div className="space-y-2">
          <Textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Anote algo sobre este membro (visível apenas internamente)..."
            rows={2}
            maxLength={4000}
            className="text-sm"
          />
          <div className="flex items-center justify-between">
            <span className="text-[11px] text-muted-foreground">
              {draft.length}/4000
            </span>
            <Button
              size="sm"
              variant="glow"
              disabled={!draft.trim() || create.isPending}
              onClick={() =>
                create.mutate(
                  { memberId: member.id, content: draft },
                  { onSuccess: () => setDraft('') },
                )
              }
            >
              {create.isPending && <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" />}
              Adicionar
            </Button>
          </div>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-6">
            <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
          </div>
        ) : notes.length === 0 ? (
          <p className="text-xs text-muted-foreground text-center py-3">
            Nenhuma observação ainda.
          </p>
        ) : (
          <div className="space-y-2">
            {notes.map((n) => {
              const editing = editingId === n.id;
              const own = n.author_id === profile?.id;
              const canEdit = own || isAdmin;
              return (
                <div
                  key={n.id}
                  className="rounded-md border border-border bg-card/40 p-2.5 space-y-1.5"
                >
                  {editing ? (
                    <Textarea
                      value={editingText}
                      onChange={(e) => setEditingText(e.target.value)}
                      rows={2}
                      maxLength={4000}
                      className="text-sm"
                    />
                  ) : (
                    <p className="text-sm whitespace-pre-wrap break-words">{n.content}</p>
                  )}
                  <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                    <span>
                      {format(parseISO(n.created_at), "dd MMM yyyy 'às' HH:mm", { locale: ptBR })}
                      {n.updated_at !== n.created_at && ' · editado'}
                    </span>
                    {canEdit && (
                      <div className="flex gap-1">
                        {editing ? (
                          <>
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-6 w-6"
                              onClick={() => {
                                update.mutate(
                                  { id: n.id, content: editingText },
                                  { onSuccess: () => setEditingId(null) },
                                );
                              }}
                              disabled={update.isPending}
                            >
                              <Check className="w-3.5 h-3.5" />
                            </Button>
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-6 w-6"
                              onClick={() => setEditingId(null)}
                            >
                              <X className="w-3.5 h-3.5" />
                            </Button>
                          </>
                        ) : (
                          <>
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-6 w-6"
                              onClick={() => {
                                setEditingId(n.id);
                                setEditingText(n.content);
                              }}
                            >
                              <Pencil className="w-3.5 h-3.5" />
                            </Button>
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-6 w-6 text-destructive hover:text-destructive"
                              onClick={() => del.mutate(n.id)}
                              disabled={del.isPending}
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </Button>
                          </>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
