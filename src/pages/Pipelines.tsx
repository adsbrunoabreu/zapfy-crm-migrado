import { useState, useMemo, useCallback } from 'react';
import { toast } from 'sonner';
import {
  DndContext, DragEndEvent, DragOverlay, DragStartEvent,
  closestCorners, PointerSensor, useSensor, useSensors,
} from '@dnd-kit/core';

import { usePipelines, usePipelineWithLeads, StageWithLeads, useUpdateLeadStage, useDeletePipeline } from '@/hooks/usePipelines';
import { useDeleteLead } from '@/hooks/useLeads';
import { useTags } from '@/hooks/useTags';
import { useTeamMembers } from '@/hooks/useTeamMembers';
import { useAuth } from '@/contexts/AuthContext';
import { usePlanLimitGuard } from '@/hooks/usePlanLimitGuard';
import { useRealtimePipeline } from '@/hooks/useRealtimePipeline';
import { useLeadOutcome } from '@/hooks/useLeadOutcome';

import { CrmLeadCardOverlay } from '@/components/crm/CrmLeadCard';
import { CreatePipelineDialog } from '@/components/pipelines/CreatePipelineDialog';
import { CreateStageDialog } from '@/components/pipelines/CreateStageDialog';
import { LeadDetailModal } from '@/components/pipelines/LeadDetailModal';

import { PipelineManageDrawer } from '@/components/pipelines/PipelineManageDrawer';
import { TransferLeadDialog } from '@/components/leads/TransferLeadDialog';
import { LeadOutcomeDialog } from '@/components/pipelines/LeadOutcomeDialog';
import { PlanLimitDialog } from '@/components/billing/PlanLimitDialog';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';

import { PipelinesHeader } from './pipelines/PipelinesHeader';
import { PipelineBoard } from './pipelines/PipelineBoard';
import { usePipelineSelection } from './pipelines/usePipelineSelection';
import { usePipelineFilters } from './pipelines/usePipelineFilters';

type LeadType = StageWithLeads['leads'][0];

export default function Pipelines() {
  const { isCompanyAdmin, profile } = useAuth();
  const { data: pipelines, isLoading: loadingPipelines, isError: pipelinesError, error: pipelinesErr, refetch: refetchPipelines } = usePipelines();
  const { data: tags } = useTags();
  const { data: teamMembers } = useTeamMembers();

  const { selectedPipelineId, setSelectedPipelineId, navigate } = usePipelineSelection(pipelines);
  const { data: stages, isLoading: loadingStages, isError: stagesError, error: stagesErr, refetch: refetchStages } = usePipelineWithLeads(selectedPipelineId);
  const deletePipeline = useDeletePipeline();
  useRealtimePipeline(selectedPipelineId);

  const { filters, setFilters, activeFiltersCount, clearFilters, toggleTag, filteredStages } = usePipelineFilters(stages);

  // Dialogs
  const [showNewPipelineDialog, setShowNewPipelineDialog] = useState(false);
  const [showPlanLimitDialog, setShowPlanLimitDialog] = useState(false);
  const planGuard = usePlanLimitGuard();
  const [showNewStageDialog, setShowNewStageDialog] = useState(false);
  const [showNewLeadDialog, setShowNewLeadDialog] = useState(false);
  const [showManageDrawer, setShowManageDrawer] = useState(false);
  const [manageDrawerTab, setManageDrawerTab] = useState<'editar' | 'etapas' | 'membros' | 'excluir'>('editar');
  const [newLeadStage, setNewLeadStage] = useState<{ id: string; name: string } | null>(null);
  const [selectedLead, setSelectedLead] = useState<LeadType | null>(null);
  const [showLeadModal, setShowLeadModal] = useState(false);
  const [leadToDelete, setLeadToDelete] = useState<LeadType | null>(null);
  const [leadToTransfer, setLeadToTransfer] = useState<LeadType | null>(null);
  const [showTransferDialog, setShowTransferDialog] = useState(false);
  const [outcomeTarget, setOutcomeTarget] = useState<{ lead: LeadType; mode: 'won' | 'lost' } | null>(null);
  const { reopen: reopenLeadMut } = useLeadOutcome();
  const [activeDragLead, setActiveDragLead] = useState<LeadType | null>(null);
  const [sortDirections, setSortDirections] = useState<Record<string, 'asc' | 'desc'>>({});

  const tryOpenNewPipeline = useCallback(() => {
    if (!planGuard.canAddPipeline) { setShowPlanLimitDialog(true); return; }
    setShowNewPipelineDialog(true);
  }, [planGuard.canAddPipeline]);

  const toggleSort = useCallback((stageId: string) => {
    setSortDirections(prev => ({ ...prev, [stageId]: prev[stageId] === 'asc' ? 'desc' : 'asc' }));
  }, []);

  const updateLeadStage = useUpdateLeadStage();
  const deleteLead = useDeleteLead();

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }));

  const handleDragStart = useCallback((event: DragStartEvent) => {
    const leadId = event.active.id as string;
    const allLeads = stages?.flatMap(s => s.leads) || [];
    setActiveDragLead(allLeads.find(l => l.id === leadId) || null);
  }, [stages]);

  const handleDragEnd = useCallback((event: DragEndEvent) => {
    setActiveDragLead(null);
    const { active, over } = event;
    if (!over || !stages) return;
    const leadId = active.id as string;
    const overId = over.id as string;
    let targetStage: StageWithLeads | null = stages.find(s => s.id === overId) || null;
    if (!targetStage) {
      for (const stage of stages) {
        if (stage.leads.some(l => l.id === overId)) { targetStage = stage; break; }
      }
    }
    if (!targetStage) return;
    const currentStage = stages.find(s => s.leads.some(l => l.id === leadId));
    if (!currentStage || currentStage.id === targetStage.id) return;
    updateLeadStage.mutate({ leadId, stageId: targetStage.id, stageName: targetStage.name });
  }, [stages, updateLeadStage]);

  const firstOpenStage = useMemo(() => {
    if (!stages) return null;
    const openStages = stages.filter(s => (s as any).stage_type === 'open');
    const pool = openStages.length > 0 ? openStages : stages;
    return [...pool].sort((a, b) => (a.position ?? 0) - (b.position ?? 0))[0] ?? null;
  }, [stages]);

  const handleNewLead = useCallback(() => {
    if (!selectedPipelineId || selectedPipelineId.startsWith('mock-')) return;
    if (!firstOpenStage) {
      toast.error('Este pipeline não tem nenhuma etapa aberta', {
        description: 'Crie uma etapa do tipo "Aberta" antes de adicionar leads.',
      });
      return;
    }
    setNewLeadStage({ id: firstOpenStage.id, name: firstOpenStage.name });
    setShowNewLeadDialog(true);
  }, [selectedPipelineId, firstOpenStage]);

  const handleLeadClick = useCallback((lead: LeadType) => {
    setSelectedLead(lead);
    setShowLeadModal(true);
  }, []);

  const handleDeleteLead = async () => {
    if (!leadToDelete) return;
    try { await deleteLead.mutateAsync(leadToDelete.id); }
    finally { setLeadToDelete(null); }
  };

  const handleSelectPipeline = useCallback((pipelineId: string) => {
    setSelectedPipelineId(pipelineId);
    navigate(`/pipelines/${pipelineId}`, { replace: true });
  }, [navigate, setSelectedPipelineId]);

  const handleManagePipeline = useCallback(() => {
    setManageDrawerTab('editar');
    setShowManageDrawer(true);
  }, []);

  const handleManageStages = useCallback(() => {
    setManageDrawerTab('etapas');
    setShowManageDrawer(true);
  }, []);

  const handleTransferLead = useCallback((lead: LeadType) => {
    setLeadToTransfer(lead);
    setShowTransferDialog(true);
  }, []);

  const handleMarkWon = useCallback((lead: LeadType) => setOutcomeTarget({ lead, mode: 'won' }), []);
  const handleMarkLost = useCallback((lead: LeadType) => setOutcomeTarget({ lead, mode: 'lost' }), []);
  const handleReopen = useCallback((lead: LeadType) => reopenLeadMut.mutate(lead.id), [reopenLeadMut]);

  const isLoading = loadingPipelines || loadingStages;
  const selectedPipelineName = pipelines?.find(p => p.id === selectedPipelineId)?.name;
  const pipelinesEmpty = !!pipelines && pipelines.length === 0;

  return (
    <DndContext sensors={sensors} collisionDetection={closestCorners} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
      <div className="h-full flex flex-col overflow-hidden bg-background">
        <PipelinesHeader
          pipelines={pipelines}
          selectedPipelineId={selectedPipelineId}
          selectedPipelineName={selectedPipelineName}
          onSelectPipeline={handleSelectPipeline}
          filters={filters}
          setFilters={setFilters}
          activeFiltersCount={activeFiltersCount}
          clearFilters={clearFilters}
          toggleTag={toggleTag}
          teamMembers={teamMembers}
          tags={tags}
          isCompanyAdmin={isCompanyAdmin}
          hasFirstOpenStage={!!firstOpenStage}
          firstOpenStageName={firstOpenStage?.name}
          onNewLead={handleNewLead}
          onManagePipeline={handleManagePipeline}
          onNewPipeline={tryOpenNewPipeline}
          canAddPipeline={planGuard.canAddPipeline}
          pipelineBlockedReason={planGuard.pipelineBlockedReason}
        />

        <PipelineBoard
          pipelinesError={pipelinesError}
          stagesError={stagesError}
          errObj={pipelinesErr || stagesErr}
          isLoading={isLoading}
          stages={stages}
          filteredStages={filteredStages}
          pipelinesEmpty={pipelinesEmpty}
          isCompanyAdmin={isCompanyAdmin}
          sortDirections={sortDirections}
          onRetry={() => { refetchPipelines(); refetchStages(); }}
          onCreatePipeline={tryOpenNewPipeline}
          onManageStages={handleManageStages}
          onLeadClick={handleLeadClick}
          onDeleteLead={(lead) => setLeadToDelete(lead)}
          onTransferLead={handleTransferLead}
          onMarkWon={handleMarkWon}
          onMarkLost={handleMarkLost}
          onReopen={handleReopen}
          onToggleSort={toggleSort}
        />

        <DragOverlay>
          {activeDragLead && <CrmLeadCardOverlay lead={activeDragLead} />}
        </DragOverlay>

        <CreatePipelineDialog
          open={showNewPipelineDialog}
          onOpenChange={setShowNewPipelineDialog}
          onPipelineCreated={(pipelineId) => setSelectedPipelineId(pipelineId)}
        />

        <PlanLimitDialog
          open={showPlanLimitDialog}
          onOpenChange={setShowPlanLimitDialog}
          resource="pipelines"
          message={planGuard.pipelineBlockedReason ?? undefined}
        />

        {selectedPipelineId && (
          <CreateStageDialog
            open={showNewStageDialog}
            onOpenChange={setShowNewStageDialog}
            pipelineId={selectedPipelineId}
            currentStagesCount={stages?.length || 0}
          />
        )}

        {selectedPipelineId && newLeadStage && (
          <LeadDetailModal
            open={showNewLeadDialog}
            onOpenChange={(open) => {
              setShowNewLeadDialog(open);
              if (!open) setNewLeadStage(null);
            }}
            lead={null}
            pipelineId={selectedPipelineId}
            stageId={newLeadStage.id}
            stageName={newLeadStage.name}
            defaultAssignedTo={profile?.id ?? null}
          />
        )}

        <LeadDetailModal open={showLeadModal} onOpenChange={setShowLeadModal} lead={selectedLead} />


        <LeadOutcomeDialog
          open={!!outcomeTarget}
          onOpenChange={(o) => { if (!o) setOutcomeTarget(null); }}
          mode={outcomeTarget?.mode || 'won'}
          leadId={outcomeTarget?.lead.id || null}
          leadName={outcomeTarget?.lead.name}
        />

        <TransferLeadDialog
          open={showTransferDialog}
          onOpenChange={(open) => { setShowTransferDialog(open); if (!open) setLeadToTransfer(null); }}
          lead={leadToTransfer ? {
            id: leadToTransfer.id, name: leadToTransfer.name,
            assigned_to: leadToTransfer.assigned_to, assignee: leadToTransfer.assignee,
          } : null}
        />

        <AlertDialog open={!!leadToDelete} onOpenChange={(open) => !open && setLeadToDelete(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Excluir Lead</AlertDialogTitle>
              <AlertDialogDescription>
                Tem certeza que deseja excluir o lead "{leadToDelete?.name}"? Esta ação não pode ser desfeita.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancelar</AlertDialogCancel>
              <AlertDialogAction
                onClick={(e) => { e.preventDefault(); handleDeleteLead(); }}
                disabled={deleteLead.isPending}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                {deleteLead.isPending ? 'Excluindo...' : 'Excluir'}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {selectedPipelineId && (() => {
          const currentPipeline = pipelines?.find(p => p.id === selectedPipelineId) || null;
          const stageList = (stages || []).map(s => ({
            id: s.id, name: s.name, color: s.color, position: s.position, pipeline_id: s.pipeline_id,
          }));
          return (
            <PipelineManageDrawer
              open={showManageDrawer}
              onOpenChange={setShowManageDrawer}
              pipeline={currentPipeline}
              stages={stageList}
              defaultTab={manageDrawerTab}
              onDeleted={() => setSelectedPipelineId(null)}
            />
          );
        })()}
      </div>
    </DndContext>
  );
}
