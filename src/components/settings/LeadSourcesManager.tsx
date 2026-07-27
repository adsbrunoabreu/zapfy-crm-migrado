import { useEffect, useMemo, useState } from 'react';
import { Plus, Loader2, Trash2, GripVertical, ArrowDownAZ } from 'lucide-react';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { cn } from '@/lib/utils';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  useLeadSources, useCreateLeadSource, useUpdateLeadSource, useDeleteLeadSource,
  type LeadSource,
} from '@/hooks/useLeadSources';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { useQueryClient } from '@tanstack/react-query';

interface RowProps {
  source: LeadSource;
  editingValue: string | undefined;
  onEditChange: (v: string) => void;
  onCommit: () => void;
  onToggle: (v: boolean) => void;
  onDelete: () => void;
}

function SortableRow({ source, editingValue, onEditChange, onCommit, onToggle, onDelete }: RowProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: source.id });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        'flex items-center gap-3 px-3 py-2.5 bg-card/40 transition-colors',
        isDragging && 'opacity-60 bg-accent/40 shadow-lg z-10 relative ring-1 ring-border',
      )}
    >
      <button
        type="button"
        aria-label="Arrastar para reordenar"
        className="touch-none cursor-grab active:cursor-grabbing text-muted-foreground/50 hover:text-muted-foreground p-1 -ml-1 rounded hover:bg-accent/50 transition-colors"
        {...attributes}
        {...listeners}
      >
        <GripVertical className="w-4 h-4" />
      </button>
      <Input
        value={editingValue !== undefined ? editingValue : source.label}
        onChange={(e) => onEditChange(e.target.value.slice(0, 80))}
        onBlur={onCommit}
        onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
        className="flex-1 h-8 bg-transparent border-transparent hover:border-border focus:border-border"
      />
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Switch checked={source.is_active} onCheckedChange={onToggle} />
        <span className="w-10">{source.is_active ? 'Ativo' : 'Inativo'}</span>
      </div>
      <Button
        size="icon"
        variant="ghost"
        className="h-8 w-8 text-muted-foreground hover:text-destructive"
        onClick={onDelete}
      >
        <Trash2 className="w-4 h-4" />
      </Button>
    </div>
  );
}

export default function LeadSourcesManager() {
  const { data: sources, isLoading } = useLeadSources();
  const create = useCreateLeadSource();
  const update = useUpdateLeadSource();
  const remove = useDeleteLeadSource();
  const { toast } = useToast();
  const qc = useQueryClient();

  const [newLabel, setNewLabel] = useState('');
  const [editing, setEditing] = useState<Record<string, string>>({});
  const [confirmDelete, setConfirmDelete] = useState<{ id: string; label: string } | null>(null);
  // Cópia local para reordenação otimista
  const [items, setItems] = useState<LeadSource[]>([]);

  useEffect(() => { setItems(sources ?? []); }, [sources]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const handleAdd = async () => {
    const label = newLabel.trim();
    if (label.length < 2) return;
    const next = (items.length || 0) + 1;
    await create.mutateAsync({ label, sort_order: next });
    setNewLabel('');
  };

  const persistOrder = async (ordered: LeadSource[]) => {
    if (!ordered.length) return;
    const updates = ordered.map((s, idx) => ({ id: s.id, sort_order: idx + 1 }));
    // Persistência paralela (mais rápida que sequencial); rollback se algo falhar
    const results = await Promise.allSettled(
      updates.map((u) => supabase.from('lead_sources' as any).update({ sort_order: u.sort_order }).eq('id', u.id)),
    );
    const failed = results.some((r) => r.status === 'rejected' || (r.status === 'fulfilled' && (r.value as any)?.error));
    if (failed) {
      toast({ title: 'Erro ao salvar ordem', description: 'Não foi possível atualizar a ordem das origens.', variant: 'destructive' });
      qc.invalidateQueries({ queryKey: ['lead-sources'] });
      return;
    }
    qc.invalidateQueries({ queryKey: ['lead-sources'] });
  };

  const handleDragEnd = (e: DragEndEvent) => {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const oldIdx = items.findIndex((i) => i.id === active.id);
    const newIdx = items.findIndex((i) => i.id === over.id);
    if (oldIdx < 0 || newIdx < 0) return;
    const next = arrayMove(items, oldIdx, newIdx);
    setItems(next);
    persistOrder(next);
  };

  const sortAlphabetical = () => {
    const next = [...items].sort((a, b) => a.label.localeCompare(b.label, 'pt-BR', { sensitivity: 'base' }));
    setItems(next);
    persistOrder(next);
    toast({ title: 'Ordenado em ordem alfabética' });
  };

  const ids = useMemo(() => items.map((i) => i.id), [items]);

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="text-base font-semibold">Origens do lead</h3>
          <p className="text-sm text-muted-foreground mt-1">
            Cadastre as origens que aparecem no seletor ao criar um contato ou lead. Arraste pelo <GripVertical className="inline w-3 h-3 mx-0.5 align-middle" /> para reordenar.
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={sortAlphabetical}
          disabled={items.length < 2}
          className="shrink-0"
        >
          <ArrowDownAZ className="w-4 h-4 mr-2" />
          Ordem alfabética
        </Button>
      </div>

      <div className="flex gap-2">
        <Input
          value={newLabel}
          onChange={(e) => setNewLabel(e.target.value.slice(0, 80))}
          placeholder="Ex.: Instagram"
          onKeyDown={(e) => { if (e.key === 'Enter') handleAdd(); }}
        />
        <Button onClick={handleAdd} disabled={create.isPending || newLabel.trim().length < 2}>
          {create.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
          <span className="ml-2">Adicionar</span>
        </Button>
      </div>

      <div className="border border-border rounded-lg divide-y divide-border overflow-hidden">
        {isLoading ? (
          <div className="p-6 flex justify-center bg-card/40"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>
        ) : items.length === 0 ? (
          <p className="p-6 text-sm text-muted-foreground text-center bg-card/40">Nenhuma origem cadastrada.</p>
        ) : (
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <SortableContext items={ids} strategy={verticalListSortingStrategy}>
              {items.map((s) => (
                <SortableRow
                  key={s.id}
                  source={s}
                  editingValue={editing[s.id]}
                  onEditChange={(v) => setEditing((st) => ({ ...st, [s.id]: v }))}
                  onCommit={() => {
                    const v = editing[s.id];
                    if (v !== undefined && v.trim() && v !== s.label) {
                      update.mutate({ id: s.id, label: v.trim() });
                    }
                    setEditing((st) => { const c = { ...st }; delete c[s.id]; return c; });
                  }}
                  onToggle={(checked) => update.mutate({ id: s.id, is_active: checked })}
                  onDelete={() => setConfirmDelete({ id: s.id, label: s.label })}
                />
              ))}
            </SortableContext>
          </DndContext>
        )}
      </div>

      <AlertDialog open={!!confirmDelete} onOpenChange={(o) => !o && setConfirmDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir origem "{confirmDelete?.label}"?</AlertDialogTitle>
            <AlertDialogDescription>
              Leads e contatos que usaram esta origem continuam preservando o histórico, mas ela deixará de aparecer no seletor.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={async () => { if (confirmDelete) await remove.mutateAsync(confirmDelete.id); setConfirmDelete(null); }}
            >
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
