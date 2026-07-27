import { useState } from 'react';
import { Plus, Trash2, Loader2 } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { useTags, useCreateTag, useDeleteTag, type Tag } from '@/hooks/useTags';
import { cn } from '@/lib/utils';

export const TAG_COLORS = [
  '#6366f1', '#8b5cf6', '#ec4899', '#ef4444',
  '#f59e0b', '#10b981', '#14b8a6', '#06b6d4',
  '#3b82f6', '#84cc16', '#a855f7', '#71717a',
];

interface TagChipProps {
  tag: Tag;
  onRemove?: () => void;
  removing?: boolean;
}

export function TagChip({ tag, onRemove, removing }: TagChipProps) {
  const color = tag.color || '#6366f1';
  return (
    <span
      className="inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full border font-medium"
      style={{
        backgroundColor: `${color}20`,
        borderColor: `${color}60`,
        color,
      }}
    >
      {tag.name}
      {onRemove && (
        <button
          type="button"
          onClick={onRemove}
          disabled={removing}
          className="hover:opacity-70 disabled:opacity-50 transition-opacity"
          aria-label={`Remover tag ${tag.name}`}
        >
          {removing ? <Loader2 className="w-3 h-3 animate-spin" /> : <Trash2 className="w-3 h-3" />}
        </button>
      )}
    </span>
  );
}

interface ColorPickerProps {
  value: string;
  onChange: (color: string) => void;
}

export function TagColorPicker({ value, onChange }: ColorPickerProps) {
  const [open, setOpen] = useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="h-9 w-9 rounded-md border border-border shrink-0 flex items-center justify-center hover:opacity-80 transition-opacity"
          style={{ backgroundColor: value }}
          title="Escolher cor"
        >
          <span className="sr-only">Cor</span>
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-2" align="end">
        <div className="grid grid-cols-6 gap-1.5">
          {TAG_COLORS.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => {
                onChange(c);
                setOpen(false);
              }}
              className={cn(
                'h-7 w-7 rounded-md border-2 transition-all hover:scale-110',
                value === c ? 'border-foreground' : 'border-transparent'
              )}
              style={{ backgroundColor: c }}
              aria-label={c}
            />
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}

interface TagCreateRowProps {
  placeholder?: string;
  compact?: boolean;
  onCreated?: (tag: Tag) => void;
}

/**
 * Linha "criar tag" reutilizável: input + cor + botão Adicionar.
 * Mesmo padrão visual de "Motivos de encerramento".
 */
export function TagCreateRow({ placeholder = 'Nova tag', compact, onCreated }: TagCreateRowProps) {
  const [name, setName] = useState('');
  const [color, setColor] = useState(TAG_COLORS[0]);
  const create = useCreateTag();

  const submit = async () => {
    const v = name.trim();
    if (!v) return;
    const tag = await create.mutateAsync({ name: v, color });
    setName('');
    if (tag) onCreated?.(tag);
  };

  return (
    <div className="flex gap-2">
      <Input
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), submit())}
        placeholder={placeholder}
        className={compact ? 'h-8 text-sm' : 'h-9'}
        disabled={create.isPending}
      />
      <TagColorPicker value={color} onChange={setColor} />
      <Button
        variant="outline"
        size={compact ? 'sm' : 'default'}
        onClick={submit}
        disabled={!name.trim() || create.isPending}
      >
        {create.isPending ? (
          <Loader2 className="w-4 h-4 mr-1 animate-spin" />
        ) : (
          <Plus className="w-4 h-4 mr-1" />
        )}
        Adicionar
      </Button>
    </div>
  );
}

/**
 * Tela completa de gestão de tags da empresa.
 */
export default function TagsManager() {
  const { data: tags = [], isLoading } = useTags();
  const deleteTag = useDeleteTag();
  const [pendingDelete, setPendingDelete] = useState<Tag | null>(null);

  const confirmDelete = async () => {
    if (!pendingDelete) return;
    await deleteTag.mutateAsync(pendingDelete.id);
    setPendingDelete(null);
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="font-display text-lg font-semibold">Tags</h2>
        <p className="text-sm text-muted-foreground">
          Crie e organize as tags usadas em conversas, leads e atendimentos.
        </p>
      </div>

      <div className="space-y-3">
        <Label>Nova tag</Label>
        <TagCreateRow />

        <div className="flex flex-wrap gap-2 pt-2 min-h-[2rem]">
          {isLoading ? (
            <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
          ) : tags.length === 0 ? (
            <span className="text-sm text-muted-foreground">Nenhuma tag cadastrada.</span>
          ) : (
            tags.map((t) => (
              <TagChip
                key={t.id}
                tag={t}
                onRemove={() => setPendingDelete(t)}
                removing={deleteTag.isPending && pendingDelete?.id === t.id}
              />
            ))
          )}
        </div>
      </div>

      <AlertDialog open={!!pendingDelete} onOpenChange={(o) => !o && setPendingDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover tag "{pendingDelete?.name}"?</AlertDialogTitle>
            <AlertDialogDescription>
              A tag será removida de todos os leads e conversas que a utilizam. Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Remover
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
