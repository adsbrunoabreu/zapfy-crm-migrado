import { memo } from 'react';
import { Plus, Settings2, Lock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { FilterPopoverButton } from '@/components/filters/FilterPopoverButton';
import { DateRangePicker } from '@/components/ui/date-range-picker';
import { OpportunityViewToggle } from '@/components/opportunities/OpportunityViewToggle';
import { PipelineFilterPanel } from './PipelineFilterPanel';
import type { PipelineFilters } from './usePipelineFilters';

interface Props {
  pipelines: { id: string; name: string }[] | undefined;
  selectedPipelineId: string | null;
  selectedPipelineName: string | undefined;
  onSelectPipeline: (id: string) => void;
  filters: PipelineFilters;
  setFilters: React.Dispatch<React.SetStateAction<PipelineFilters>>;
  activeFiltersCount: number;
  clearFilters: () => void;
  toggleTag: (id: string) => void;
  teamMembers: { id: string; name: string }[] | undefined;
  tags: { id: string; name: string; color?: string | null }[] | undefined;
  isCompanyAdmin: boolean;
  hasFirstOpenStage: boolean;
  firstOpenStageName: string | undefined;
  onNewLead: () => void;
  onManagePipeline: () => void;
  onNewPipeline: () => void;
  canAddPipeline: boolean;
  pipelineBlockedReason: string | null;
}

export const PipelinesHeader = memo(function PipelinesHeader({
  pipelines, selectedPipelineId, selectedPipelineName, onSelectPipeline,
  filters, setFilters, activeFiltersCount, clearFilters, toggleTag,
  teamMembers, tags, isCompanyAdmin, hasFirstOpenStage, firstOpenStageName,
  onNewLead, onManagePipeline, onNewPipeline, canAddPipeline, pipelineBlockedReason,
}: Props) {
  const isMock = selectedPipelineId?.startsWith('mock-');

  const title = selectedPipelineName ? `Pipeline ${selectedPipelineName}` : 'Pipelines';
  const subtitle = 'Gerencie seus leads através do funil de vendas';

  return (
    <div className="px-6 lg:px-8 py-4 border-b border-border/30 shrink-0 bg-crm-column-header backdrop-blur-sm">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-xl font-semibold text-foreground leading-tight truncate">{title}</h1>
          <p className="text-xs text-muted-foreground/80 mt-0.5">{subtitle}</p>
        </div>

        <div className="flex gap-2 items-center">
          <OpportunityViewToggle value="kanban" />
          <FilterPopoverButton activeCount={activeFiltersCount} onClear={clearFilters}>
            <PipelineFilterPanel
              filters={filters}
              setFilters={setFilters}
              toggleTag={toggleTag}
              pipelines={pipelines}
              selectedPipelineId={selectedPipelineId}
              onSelectPipeline={onSelectPipeline}
              teamMembers={teamMembers}
              tags={tags}
              doctors={[]}
              procedures={[]}
              showMedicalFilters={false}
            />
          </FilterPopoverButton>

          <DateRangePicker
            value={filters.dateRange ?? undefined}
            activePresetKey={filters.datePresetKey}
            onChange={(range, presetKey) => setFilters((prev) => ({ ...prev, dateRange: range, datePresetKey: presetKey }))}
            align="end"
            size="sm"
            placeholder="Período"
            className="h-9"
          />

          {selectedPipelineId && !isMock && (
            <Button
              variant="glow"
              className="h-9 gap-1.5 ml-auto"
              onClick={onNewLead}
              disabled={!hasFirstOpenStage}
              title={hasFirstOpenStage ? `Criar lead em "${firstOpenStageName}"` : 'Crie uma etapa aberta primeiro'}
            >
              <Plus className="w-4 h-4" />
              <span>Novo Lead</span>
            </Button>
          )}
          {isCompanyAdmin && (
            <>
              {selectedPipelineId && !isMock && (
                <Button variant="outline" className="h-9 gap-1.5" title="Gerenciar pipeline" onClick={onManagePipeline}>
                  <Settings2 className="w-4 h-4" />
                  <span className="hidden sm:inline">Gerenciar</span>
                </Button>
              )}
              <TooltipProvider delayDuration={200}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button variant="glow" onClick={onNewPipeline} className="h-9 ml-auto">
                      {canAddPipeline ? <Plus className="w-4 h-4 mr-2" /> : <Lock className="w-4 h-4 mr-2" />}
                      Novo Pipeline
                    </Button>
                  </TooltipTrigger>
                  {!canAddPipeline && pipelineBlockedReason && (
                    <TooltipContent>{pipelineBlockedReason}</TooltipContent>
                  )}
                </Tooltip>
              </TooltipProvider>
            </>
          )}
        </div>
      </div>
    </div>
  );
});
