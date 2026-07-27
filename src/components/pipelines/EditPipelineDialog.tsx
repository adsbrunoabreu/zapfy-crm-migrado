import { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Loader2 } from 'lucide-react';
import { useUpdatePipeline, type Pipeline } from '@/hooks/usePipelines';

interface ContentProps {
  pipeline: Pipeline | null;
  onSaved?: () => void;
  onCancel?: () => void;
  showCancel?: boolean;
}

export function EditPipelineForm({ pipeline, onSaved, onCancel, showCancel = true }: ContentProps) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const update = useUpdatePipeline();

  useEffect(() => {
    if (pipeline) {
      setName(pipeline.name);
      setDescription(pipeline.description || '');
    }
  }, [pipeline]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pipeline || !name.trim()) return;
    await update.mutateAsync({ id: pipeline.id, name: name.trim(), description: description.trim() || null });
    onSaved?.();
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="pname">Nome *</Label>
        <Input id="pname" value={name} onChange={e => setName(e.target.value)} disabled={update.isPending} />
      </div>
      <div className="space-y-2">
        <Label htmlFor="pdesc">Descrição</Label>
        <Textarea id="pdesc" rows={3} value={description} onChange={e => setDescription(e.target.value)} disabled={update.isPending} />
      </div>
      <div className="flex justify-end gap-2 pt-2">
        {showCancel && (
          <Button type="button" variant="ghost" onClick={onCancel} disabled={update.isPending}>Cancelar</Button>
        )}
        <Button type="submit" variant="glow" disabled={update.isPending || !name.trim()}>
          {update.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
          Salvar
        </Button>
      </div>
    </form>
  );
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  pipeline: Pipeline | null;
}

export function EditPipelineDialog({ open, onOpenChange, pipeline }: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[420px]">
        <DialogHeader>
          <DialogTitle>Editar pipeline</DialogTitle>
          <DialogDescription>Atualize o nome e a descrição do pipeline.</DialogDescription>
        </DialogHeader>
        <div className="mt-2">
          <EditPipelineForm
            pipeline={pipeline}
            onSaved={() => onOpenChange(false)}
            onCancel={() => onOpenChange(false)}
          />
        </div>
      </DialogContent>
    </Dialog>
  );
}
