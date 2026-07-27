import { useState } from 'react';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Loader2, Plus, Trash2, GripVertical, Check, X } from 'lucide-react';
import { useUpdateStage, useDeleteStage, useCreateStage, useReorderStages, type PipelineStage } from '@/hooks/usePipelines';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { DndContext, closestCenter, PointerSensor, useSensor, useSensors, DragEndEvent } from '@dnd-kit/core';
import { SortableContext, useSortable, verticalListSortingStrategy, arrayMove } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

const PRESET_COLORS = ['#6b7280','#3b82f6','#8b5cf6','#ec4899','#f59e0b','#10b981','#ef4444','#06b6d4'];

interface RowProps {
  stage: PipelineStage;
  onDelete: (s: PipelineStage) => void;
}

function StageRow({ stage, onDelete }: RowProps) {
  const update = useUpdateStage();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(stage.name);
  const [color, setColor] = useState(stage.color || '#6366f1');
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: stage.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  const save = async () => {
    if (!name.trim()) return;
    await update.mutateAsync({ id: stage.id, name: name.trim(), color });
    setEditing(false);
  };

  return (
    <div ref={setNodeRef} style={style} className="flex items-center gap-2 rounded-md border border-border bg-card p-2">
      <button {...attributes} {...listeners} className="cursor-grab text-muted-foreground hover:text-foreground" type="button">
        <GripVertical className="w-4 h-4" />
      </button>
      {editing ? (
        <>
          <Input
            value={name}
            onChange={e => setName(e.target.value)}
            className="h-8 flex-1"
            autoFocus
            maxLength={40}
          />
          <div className="flex gap-1">
            {PRESET_COLORS.map(c => (
              <button
                key={c}
                type="button"
                onClick={() => setColor(c)}
                className={`w-5 h-5 rounded-full border ${color === c ? 'border-foreground scale-110' : 'border-transparent'}`}
                style={{ backgroundColor: c }}
              />
            ))}
          </div>
          <Button size="icon" variant="ghost" onClick={save} disabled={update.isPending} className="h-8 w-8">
            {update.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
          </Button>
          <Button size="icon" variant="ghost" onClick={() => { setEditing(false); setName(stage.name); setColor(stage.color || '#6366f1'); }} className="h-8 w-8">
            <X className="w-4 h-4" />
          </Button>
        </>
      ) : (
        <>
          <span className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: stage.color || '#6366f1' }} />
          <span className="flex-1 text-sm truncate">{stage.name}</span>
          <Button size="sm" variant="ghost" onClick={() => setEditing(true)} className="h-8">Editar</Button>
          <Button size="icon" variant="ghost" onClick={() => onDelete(stage)} className="h-8 w-8 text-destructive hover:text-destructive">
            <Trash2 className="w-4 h-4" />
          </Button>
        </>
      )}
    </div>
  );
}

interface ContentProps {
  pipelineId: string;
  stages: PipelineStage[];
  scrollable?: boolean;
}

export function ManageStagesContent({ pipelineId, stages, scrollable = true }: ContentProps) {
  const create = useCreateStage();
  const reorder = useReorderStages();
  const del = useDeleteStage();
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState('');
  const [newColor, setNewColor] = useState(PRESET_COLORS[0]);
  const [stageToDelete, setStageToDelete] = useState<PipelineStage | null>(null);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = stages.findIndex(s => s.id === active.id);
    const newIndex = stages.findIndex(s => s.id === over.id);
    const next = arrayMove(stages, oldIndex, newIndex);
    await reorder.mutateAsync(next.map(s => s.id));
  };

  const handleAdd = async () => {
    const trimmed = newName.trim();
    if (!trimmed) return;
    if (stages.some(s => s.name.toLowerCase() === trimmed.toLowerCase())) {
      toast.error('Já existe uma etapa com esse nome');
      return;
    }
    await create.mutateAsync({
      name: trimmed,
      color: newColor,
      position: stages.length,
      pipeline_id: pipelineId,
    });
    setNewName('');
    setNewColor(PRESET_COLORS[(stages.length + 1) % PRESET_COLORS.length]);
    setAdding(false);
  };

  return (
    <>
      <div className={`space-y-2 ${scrollable ? 'max-h-[50vh] overflow-y-auto pr-1' : ''}`}>
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={stages.map(s => s.id)} strategy={verticalListSortingStrategy}>
            {stages.map(stage => (
              <StageRow key={stage.id} stage={stage} onDelete={setStageToDelete} />
            ))}
          </SortableContext>
        </DndContext>
        {stages.length === 0 && (
          <p className="text-sm text-muted-foreground text-center py-4">Nenhuma etapa criada ainda.</p>
        )}
      </div>

      {adding ? (
        <div className="flex items-center gap-2 rounded-md border border-border bg-card p-2 mt-3">
          <Input
            placeholder="Nome da etapa"
            value={newName}
            onChange={e => setNewName(e.target.value)}
            className="h-8 flex-1"
            autoFocus
            maxLength={40}
          />
          <div className="flex gap-1">
            {PRESET_COLORS.map(c => (
              <button
                key={c}
                type="button"
                onClick={() => setNewColor(c)}
                className={`w-5 h-5 rounded-full border ${newColor === c ? 'border-foreground scale-110' : 'border-transparent'}`}
                style={{ backgroundColor: c }}
              />
            ))}
          </div>
          <Button size="icon" variant="ghost" onClick={handleAdd} disabled={create.isPending || !newName.trim()} className="h-8 w-8">
            {create.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
          </Button>
          <Button size="icon" variant="ghost" onClick={() => { setAdding(false); setNewName(''); }} className="h-8 w-8">
            <X className="w-4 h-4" />
          </Button>
        </div>
      ) : (
        <Button variant="outline" className="w-full mt-3" onClick={() => setAdding(true)}>
          <Plus className="w-4 h-4 mr-2" /> Adicionar etapa
        </Button>
      )}

      <AlertDialog open={!!stageToDelete} onOpenChange={(o) => !o && !del.isPending && setStageToDelete(null)}>
        <AlertDialogContent className="border-destructive/40">
          <AlertDialogHeader>
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-md bg-destructive/15 border border-destructive/30 flex items-center justify-center shrink-0">
                <Trash2 className="w-5 h-5 text-destructive" />
              </div>
              <div className="space-y-1.5 min-w-0">
                <AlertDialogTitle className="text-base">
                  Excluir etapa{' '}
                  <span className="inline-flex items-center gap-1.5 align-middle">
                    <span
                      className="inline-block w-2.5 h-2.5 rounded-full border border-border"
                      style={{ backgroundColor: stageToDelete?.color || '#6366f1' }}
                    />
                    <span className="font-semibold text-foreground">"{stageToDelete?.name}"</span>
                  </span>
                  ?
                </AlertDialogTitle>
                <AlertDialogDescription className="text-xs text-muted-foreground leading-relaxed space-y-2">
                  <span className="block">
                    Esta ação é <strong className="text-destructive">permanente e não pode ser desfeita</strong>.
                    A etapa será removida deste pipeline.
                  </span>
                  <span className="block rounded-md bg-muted/40 border border-border px-2.5 py-2 text-muted-foreground">
                    Etapas que ainda contêm leads não podem ser excluídas — mova ou remova os leads antes de prosseguir.
                  </span>
                </AlertDialogDescription>
              </div>
            </div>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={del.isPending}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              disabled={del.isPending}
              onClick={async (e) => {
                e.preventDefault();
                if (stageToDelete) {
                  try {
                    await del.mutateAsync(stageToDelete.id);
                    setStageToDelete(null);
                  } catch {
                    /* toast tratado no hook; mantém modal aberto para feedback */
                  }
                }
              }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90 gap-2"
            >
              {del.isPending ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" /> Excluindo...
                </>
              ) : (
                <>
                  <Trash2 className="w-4 h-4" /> Excluir etapa
                </>
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  pipelineId: string;
  stages: PipelineStage[];
}

export function ManageStagesDialog({ open, onOpenChange, pipelineId, stages }: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[560px]">
        <DialogHeader>
          <DialogTitle>Gerenciar etapas</DialogTitle>
          <DialogDescription>
            Adicione, renomeie, reordene ou exclua etapas. Arraste pelo ícone à esquerda.
          </DialogDescription>
        </DialogHeader>
        <div className="mt-2">
          <ManageStagesContent pipelineId={pipelineId} stages={stages} />
        </div>
        <div className="flex justify-end pt-3">
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Fechar</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
