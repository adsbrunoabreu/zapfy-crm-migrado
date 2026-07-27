import { memo, useRef, useEffect } from 'react';
import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { PipelineSkeleton } from '@/components/skeletons/PageSkeletons';
import { CrmStageColumn } from '@/components/crm/CrmStageColumn';
import type { StageWithLeads } from '@/hooks/usePipelines';

type LeadType = StageWithLeads['leads'][0];

interface Props {
  pipelinesError: boolean;
  stagesError: boolean;
  errObj: any;
  isLoading: boolean;
  stages: StageWithLeads[] | undefined;
  filteredStages: StageWithLeads[] | undefined;
  pipelinesEmpty: boolean;
  isCompanyAdmin: boolean;
  sortDirections: Record<string, 'asc' | 'desc'>;
  onRetry: () => void;
  onCreatePipeline: () => void;
  onManageStages: () => void;
  onLeadClick: (lead: LeadType) => void;
  onDeleteLead: (lead: LeadType) => void;
  onTransferLead: (lead: LeadType) => void;
  onMarkWon: (lead: LeadType) => void;
  onMarkLost: (lead: LeadType) => void;
  onReopen: (lead: LeadType) => void;
  onToggleSort: (stageId: string) => void;
}

export const PipelineBoard = memo(function PipelineBoard({
  pipelinesError, stagesError, errObj, isLoading, stages, filteredStages,
  pipelinesEmpty, isCompanyAdmin, sortDirections, onRetry, onCreatePipeline, onManageStages,
  onLeadClick, onDeleteLead, onTransferLead, onMarkWon, onMarkLost, onReopen, onToggleSort,
}: Props) {
  const firstRenderRef = useRef(true);
  useEffect(() => { firstRenderRef.current = false; }, []);

  return (
    <div className="flex-1 min-h-0 overflow-x-auto overflow-y-hidden kanban-board px-4 lg:px-6 py-4 bg-background">
      {(pipelinesError || stagesError) ? (
        <div className="flex flex-col items-center justify-center h-full gap-3 text-center px-6">
          <p className="text-base font-medium text-foreground">Não foi possível carregar os pipelines</p>
          <p className="text-sm text-muted-foreground max-w-md">
            {(() => {
              const msg = `${errObj?.message ?? ''}`.toLowerCase();
              if (msg.includes('rate') || msg.includes('429') || msg.includes('too many')) {
                return 'Muitas requisições em pouco tempo. Aguarde alguns segundos e tente novamente.';
              }
              if (msg.includes('tempo limite') || msg.includes('failed to fetch')) {
                return 'A conexão demorou demais. Verifique sua internet e tente novamente.';
              }
              return errObj?.message || 'Tente novamente em instantes.';
            })()}
          </p>
          <Button variant="outline" onClick={onRetry}>Tentar novamente</Button>
        </div>
      ) : isLoading && !stages ? (
        <PipelineSkeleton />
      ) : !stages || stages.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-full gap-4">
          <p className="text-muted-foreground">
            {pipelinesEmpty ? 'Nenhum pipeline criado ainda.' : 'Nenhuma etapa neste pipeline.'}
          </p>
          {isCompanyAdmin && (
            <Button variant="glow" onClick={pipelinesEmpty ? onCreatePipeline : onManageStages}>
              <Plus className="w-4 h-4 mr-2" />
              {pipelinesEmpty ? 'Criar Pipeline' : 'Gerenciar Etapas'}
            </Button>
          )}
        </div>
      ) : (
        <div className="flex gap-3 h-full">
          {filteredStages?.map((stage, index) => (
            <div
              key={stage.id}
              className="animate-slide-up h-full"
              style={firstRenderRef.current ? { animationDelay: `${index * 60}ms` } : undefined}
            >
              <CrmStageColumn
                stage={stage}
                onLeadClick={onLeadClick}
                onDeleteLead={onDeleteLead}
                onTransferLead={onTransferLead}
                onMarkWon={onMarkWon}
                onMarkLost={onMarkLost}
                onReopen={onReopen}
                sortDirection={sortDirections[stage.id] || 'desc'}
                onToggleSort={() => onToggleSort(stage.id)}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
});
