import { useState } from 'react';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useCreatePipeline, useCreateStage } from '@/hooks/usePipelines';

interface CreatePipelineDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onPipelineCreated?: (pipelineId: string) => void;
}

const DEFAULT_STAGES = [
  { name: 'Novo', color: '#6b7280', position: 0 },
  { name: 'Em Contato', color: '#3b82f6', position: 1 },
  { name: 'Negociando', color: '#f59e0b', position: 2 },
  { name: 'Fechado', color: '#10b981', position: 3 },
];

export function CreatePipelineDialog({ open, onOpenChange, onPipelineCreated }: CreatePipelineDialogProps) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [createDefaultStages, setCreateDefaultStages] = useState(true);

  const createPipeline = useCreatePipeline();
  const createStage = useCreateStage();

  const isLoading = createPipeline.isPending;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    try {
      const pipeline = await createPipeline.mutateAsync({ 
        name: name.trim(), 
        description: description.trim() || undefined 
      });

      if (createDefaultStages && pipeline) {
        // Create default stages sequentially
        for (const stage of DEFAULT_STAGES) {
          await createStage.mutateAsync({
            ...stage,
            pipeline_id: pipeline.id,
          });
        }
      }

      setName('');
      setDescription('');
      setCreateDefaultStages(true);
      onOpenChange(false);
      onPipelineCreated?.(pipeline.id);
    } catch (error) {
      // Error handled by mutation
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Novo Pipeline</DialogTitle>
          <DialogDescription>
            Crie um novo funil de vendas para gerenciar seus leads.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 mt-4">
          <div className="space-y-2">
            <Label htmlFor="name">Nome do Pipeline *</Label>
            <Input
              id="name"
              placeholder="Ex: Crédito Consignado"
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={isLoading}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">Descrição (opcional)</Label>
            <Textarea
              id="description"
              placeholder="Descreva o objetivo deste pipeline..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              disabled={isLoading}
              rows={3}
            />
          </div>

          <div className="flex items-center space-x-2">
            <Checkbox
              id="defaultStages"
              checked={createDefaultStages}
              onCheckedChange={(checked) => setCreateDefaultStages(checked as boolean)}
              disabled={isLoading}
            />
            <Label htmlFor="defaultStages" className="text-sm font-normal cursor-pointer">
              Criar com etapas padrão (Novo, Em Contato, Negociando, Fechado)
            </Label>
          </div>

          <div className="flex justify-end gap-3 pt-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isLoading}
            >
              Cancelar
            </Button>
            <Button type="submit" variant="glow" disabled={isLoading || !name.trim()}>
              {isLoading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Criar Pipeline
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
