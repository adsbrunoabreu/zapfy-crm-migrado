import { useState } from 'react';
import { Loader2 } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useUpdateLead, Lead } from '@/hooks/useLeads';
import type { Pipeline } from '@/hooks/usePipelines';

interface SendToPipelineDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  lead: Lead;
  pipelines: Pipeline[];
}

export function SendToPipelineDialog({ open, onOpenChange, lead, pipelines }: SendToPipelineDialogProps) {
  const [selectedPipelineId, setSelectedPipelineId] = useState('');
  const [selectedStageId, setSelectedStageId] = useState('');
  const updateLead = useUpdateLead();

  const selectedPipeline = pipelines.find(p => p.id === selectedPipelineId);
  const stages = selectedPipeline?.stages || [];

  const handlePipelineChange = (pipelineId: string) => {
    setSelectedPipelineId(pipelineId);
    const pipeline = pipelines.find(p => p.id === pipelineId);
    const firstStage = pipeline?.stages?.[0];
    setSelectedStageId(firstStage?.id || '');
  };

  const handleSubmit = () => {
    if (!selectedPipelineId || !selectedStageId) return;

    updateLead.mutate({
      id: lead.id,
      pipeline_id: selectedPipelineId,
      stage_id: selectedStageId,
    }, {
      onSuccess: () => {
        setSelectedPipelineId('');
        setSelectedStageId('');
        onOpenChange(false);
      }
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Enviar para Pipeline</DialogTitle>
          <p className="text-sm text-muted-foreground">
            Enviando <strong>{lead.name}</strong> para um pipeline
          </p>
        </DialogHeader>

        <div className="space-y-4 mt-4">
          <div className="space-y-1.5">
            <Label className="text-sm font-medium">Pipeline</Label>
            <Select value={selectedPipelineId} onValueChange={handlePipelineChange}>
              <SelectTrigger className="h-10">
                <SelectValue placeholder="Selecione o pipeline" />
              </SelectTrigger>
              <SelectContent>
                {pipelines.map(p => (
                  <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {stages.length > 0 && (
            <div className="space-y-1.5">
              <Label className="text-sm font-medium">Etapa</Label>
              <Select value={selectedStageId} onValueChange={setSelectedStageId}>
                <SelectTrigger className="h-10">
                  <SelectValue placeholder="Selecione a etapa" />
                </SelectTrigger>
                <SelectContent>
                  {stages.map(s => (
                    <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="flex justify-end gap-3 pt-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button onClick={handleSubmit} disabled={!selectedPipelineId || !selectedStageId || updateLead.isPending}>
              {updateLead.isPending && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
              Confirmar
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
