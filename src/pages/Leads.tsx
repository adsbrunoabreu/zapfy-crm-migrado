import { useState, useMemo, useCallback } from 'react';
import { PageShell } from '@/components/layout/PageShell';
import { Plus, Upload, Download, Trash2, Inbox, X } from 'lucide-react';
import { FilterBar } from '@/components/filters/FilterBar';
import { FilterPopoverButton } from '@/components/filters/FilterPopoverButton';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { useLeads, useDeleteLead, useBulkDeleteLeads, Lead } from '@/hooks/useLeads';
import { usePipelines } from '@/hooks/usePipelines';
import { useTeamMembers } from '@/hooks/useTeamMembers';
import { LeadDetailModal } from '@/components/pipelines/LeadDetailModal';
import { ImportLeadsDialog } from '@/components/leads/ImportLeadsDialog';
import { TransferLeadDialog } from '@/components/leads/TransferLeadDialog';

import { SendToPipelineDialog } from '@/components/leads/SendToPipelineDialog';
import { NewContactDialog } from '@/components/leads/NewContactDialog';
import { ContactSavedPrompt } from '@/components/chat/ContactSavedPrompt';
import { usePlanLimitGuard } from '@/hooks/usePlanLimitGuard';
import { PlanLimitBanner } from '@/components/billing/PlanLimitBanner';
import { LeadsSkeleton } from '@/components/skeletons/PageSkeletons';
import { OpportunityViewToggle } from '@/components/opportunities/OpportunityViewToggle';

import { LeadsSummaryCards } from './leads/LeadsSummaryCards';
import { LeadsFilterPanel } from './leads/LeadsFilterPanel';
import { LeadsTable } from './leads/LeadsTable';
import { LeadsPagination } from './leads/LeadsPagination';
import { LeadDeleteDialog, LeadBulkDeleteDialog } from './leads/LeadDeleteDialogs';
import { useLeadsFiltering } from './leads/useLeadsFiltering';
import { exportLeadsCsv } from './leads/leadsCsv';

export default function Leads() {
  const { data: leads, isLoading } = useLeads();
  const { data: pipelines } = usePipelines();
  const { data: teamMembers } = useTeamMembers();
  const deleteLead = useDeleteLead();
  const bulkDeleteLeads = useBulkDeleteLeads();
  const planGuard = usePlanLimitGuard();

  const {
    searchQuery, setSearchQuery,
    filters, setFilters,
    currentPage, setCurrentPage,
    totalPages, ITEMS_PER_PAGE,
    sortKey, sortDir, toggleSort,
    clearFilters, toggleStatus, activeFiltersCount,
    allFilteredLeads, filteredLeads,
  } = useLeadsFiltering(leads);

  const [selectedLeads, setSelectedLeads] = useState<Set<string>>(new Set());
  const [detailModalOpen, setDetailModalOpen] = useState(false);
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [leadToDelete, setLeadToDelete] = useState<Lead | null>(null);
  const [deleteConfirmation, setDeleteConfirmation] = useState('');
  const [bulkDeleteConfirmOpen, setBulkDeleteConfirmOpen] = useState(false);
  const [bulkDeleteConfirmation, setBulkDeleteConfirmation] = useState('');
  const [importModalOpen, setImportModalOpen] = useState(false);
  const [transferDialogOpen, setTransferDialogOpen] = useState(false);
  const [leadToTransfer, setLeadToTransfer] = useState<Lead | null>(null);
  const [createLeadOpen, setCreateLeadOpen] = useState(false);
  const [createLeadPrefill, setCreateLeadPrefill] = useState<{ id: string; name: string; phone: string | null; email: string | null } | null>(null);
  const [newContactOpen, setNewContactOpen] = useState(false);
  const [contactSavedPromptOpen, setContactSavedPromptOpen] = useState(false);
  const [lastSavedContact, setLastSavedContact] = useState<{ id: string; name: string; phone: string | null; email: string | null } | null>(null);
  const [sendToPipelineOpen, setSendToPipelineOpen] = useState(false);
  const [leadToSendToPipeline, setLeadToSendToPipeline] = useState<Lead | null>(null);

  const allLeads = leads || [];
  const stats = useMemo(() => ({
    totalLeads: allLeads.length,
    newLeads: allLeads.filter(l => l.status === 'new').length,
    totalValue: allLeads.reduce((sum, l) => sum + (l.value || 0), 0),
    unassignedLeads: allLeads.filter(l => !l.assigned_to).length,
  }), [allLeads]);

  const handleSelectAll = useCallback((checked: boolean) => {
    setSelectedLeads(checked ? new Set(filteredLeads.map(l => l.id)) : new Set());
  }, [filteredLeads]);

  const handleSelectLead = useCallback((leadId: string, checked: boolean) => {
    setSelectedLeads(prev => {
      const next = new Set(prev);
      if (checked) next.add(leadId); else next.delete(leadId);
      return next;
    });
  }, []);

  const openLeadDetail = useCallback((lead: Lead) => {
    setSelectedLead(lead);
    setDetailModalOpen(true);
  }, []);

  const openDeleteConfirm = useCallback((lead: Lead) => {
    setLeadToDelete(lead);
    setDeleteConfirmOpen(true);
  }, []);

  const openTransfer = useCallback((lead: Lead) => {
    setLeadToTransfer(lead);
    setTransferDialogOpen(true);
  }, []);

  const openSendToPipeline = useCallback((lead: Lead) => {
    setLeadToSendToPipeline(lead);
    setSendToPipelineOpen(true);
  }, []);

  const handleDeleteConfirm = () => {
    if (leadToDelete && deleteConfirmation === 'EXCLUIR') {
      deleteLead.mutate(leadToDelete.id, {
        onSuccess: () => {
          setDeleteConfirmOpen(false);
          setLeadToDelete(null);
          setDeleteConfirmation('');
        },
      });
    }
  };

  const handleBulkDeleteConfirm = () => {
    if (bulkDeleteConfirmation === 'EXCLUIR') {
      bulkDeleteLeads.mutate(Array.from(selectedLeads), {
        onSuccess: () => {
          setBulkDeleteConfirmOpen(false);
          setBulkDeleteConfirmation('');
          setSelectedLeads(new Set());
        },
      });
    }
  };

  if (isLoading && !leads) return <LeadsSkeleton />;

  return (
    <PageShell
      title="Contatos"
      subtitle="Gerencie todos os seus contatos em um só lugar"
      actions={
        <>
          <OpportunityViewToggle value="list" />
          {selectedLeads.size > 0 && (
            <Button variant="destructive" onClick={() => setBulkDeleteConfirmOpen(true)}>
              <Trash2 className="w-4 h-4 mr-2" />
              Excluir Selecionados ({selectedLeads.size})
            </Button>
          )}
          <Button variant="outline" onClick={() => setImportModalOpen(true)} disabled={!planGuard.canAddLead} title={planGuard.leadBlockedReason ?? undefined}>
            <Upload className="w-4 h-4 mr-2" />Importar
          </Button>
          <Button variant="outline" onClick={() => exportLeadsCsv(allFilteredLeads)} disabled={allFilteredLeads.length === 0}>
            <Download className="w-4 h-4 mr-2" />Exportar
          </Button>
          <Button variant="outline" onClick={() => setNewContactOpen(true)} disabled={!planGuard.canAddLead} title={planGuard.leadBlockedReason ?? undefined}>
            <Plus className="w-4 h-4 mr-2" />Cadastro Rápido
          </Button>
          <Button variant="glow" onClick={() => { setCreateLeadPrefill(null); setCreateLeadOpen(true); }} disabled={!planGuard.canAddLead} title={planGuard.leadBlockedReason ?? undefined}>
            <Plus className="w-4 h-4 mr-2" />Novo Lead
          </Button>
        </>
      }
    >
      {!planGuard.canAddLead && planGuard.leadBlockedReason && (
        <PlanLimitBanner message={planGuard.leadBlockedReason} />
      )}

      <LeadsSummaryCards {...stats} />

      <FilterBar
        searchValue={searchQuery}
        onSearchChange={(v) => { setSearchQuery(v); setCurrentPage(1); }}
        infoText={`${allFilteredLeads.length} resultados`}
        searchPlaceholder="Buscar por nome, email ou telefone..."
      >
        <FilterPopoverButton activeCount={activeFiltersCount} onClear={clearFilters}>
          <LeadsFilterPanel
            filters={filters}
            setFilters={setFilters}
            toggleStatus={toggleStatus}
            pipelines={pipelines}
            teamMembers={teamMembers}
          />
        </FilterPopoverButton>
      </FilterBar>

      <Card className="glass-card overflow-hidden">
        {filteredLeads.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 px-6">
            <div className="h-16 w-16 rounded-2xl bg-muted/50 flex items-center justify-center mb-4">
              <Inbox className="h-8 w-8 text-muted-foreground" />
            </div>
            <h3 className="text-lg font-semibold mb-1">Nenhum contato encontrado</h3>
            <p className="text-muted-foreground text-sm text-center max-w-sm mb-6">
              {searchQuery || activeFiltersCount > 0
                ? 'Tente ajustar os filtros ou a busca para encontrar seus contatos.'
                : 'Comece adicionando seu primeiro contato para gerenciar suas oportunidades.'}
            </p>
            {!searchQuery && activeFiltersCount === 0 && (
              <Button variant="glow"><Plus className="w-4 h-4 mr-2" />Novo Lead</Button>
            )}
            {(searchQuery || activeFiltersCount > 0) && (
              <Button variant="outline" onClick={() => { setSearchQuery(''); clearFilters(); }}>
                <X className="w-4 h-4 mr-2" />Limpar filtros
              </Button>
            )}
          </div>
        ) : (
          <LeadsTable
            leads={filteredLeads}
            sortKey={sortKey}
            sortDir={sortDir}
            onToggleSort={toggleSort}
            selectedLeads={selectedLeads}
            onSelectAll={handleSelectAll}
            onSelectLead={handleSelectLead}
            onOpenDetail={openLeadDetail}
            onDelete={openDeleteConfirm}
            onTransfer={openTransfer}
            onSendToPipeline={openSendToPipeline}
          />
        )}
      </Card>

      <LeadsPagination
        totalItems={allFilteredLeads.length}
        itemsPerPage={ITEMS_PER_PAGE}
        currentPage={currentPage}
        totalPages={totalPages}
        onPageChange={setCurrentPage}
      />

      <LeadDetailModal
        open={detailModalOpen}
        onOpenChange={setDetailModalOpen}
        lead={selectedLead ? {
          id: selectedLead.id, name: selectedLead.name, phone: selectedLead.phone,
          email: selectedLead.email, value: selectedLead.value, status: selectedLead.status,
          created_at: selectedLead.created_at,
        } : null}
      />

      <LeadDeleteDialog
        open={deleteConfirmOpen}
        onOpenChange={(open) => {
          setDeleteConfirmOpen(open);
          if (!open) { setDeleteConfirmation(''); setLeadToDelete(null); }
        }}
        leadName={leadToDelete?.name}
        confirmation={deleteConfirmation}
        setConfirmation={setDeleteConfirmation}
        onConfirm={handleDeleteConfirm}
        isPending={deleteLead.isPending}
      />

      <LeadBulkDeleteDialog
        open={bulkDeleteConfirmOpen}
        onOpenChange={(open) => {
          setBulkDeleteConfirmOpen(open);
          if (!open) setBulkDeleteConfirmation('');
        }}
        count={selectedLeads.size}
        confirmation={bulkDeleteConfirmation}
        setConfirmation={setBulkDeleteConfirmation}
        onConfirm={handleBulkDeleteConfirm}
        isPending={bulkDeleteLeads.isPending}
      />

      <ImportLeadsDialog open={importModalOpen} onOpenChange={setImportModalOpen} />

      <TransferLeadDialog
        open={transferDialogOpen}
        onOpenChange={(open) => { setTransferDialogOpen(open); if (!open) setLeadToTransfer(null); }}
        lead={leadToTransfer ? {
          id: leadToTransfer.id, name: leadToTransfer.name,
          assigned_to: leadToTransfer.assigned_to, assignee: leadToTransfer.assignee,
        } : null}
      />

      <LeadDetailModal
        open={createLeadOpen}
        onOpenChange={(v) => { setCreateLeadOpen(v); if (!v) setCreateLeadPrefill(null); }}
        lead={createLeadPrefill ? {
          id: createLeadPrefill.id,
          name: createLeadPrefill.name,
          phone: createLeadPrefill.phone,
          email: createLeadPrefill.email,
          value: null,
          status: 'new',
          created_at: new Date().toISOString(),
        } : null}
        prefill={createLeadPrefill ? null : undefined}
      />


      <NewContactDialog
        open={newContactOpen}
        onOpenChange={setNewContactOpen}
        onCreated={(contact) => {
          setLastSavedContact(contact);
          setContactSavedPromptOpen(true);
        }}
      />

      <ContactSavedPrompt
        open={contactSavedPromptOpen}
        onOpenChange={setContactSavedPromptOpen}
        onCreateLead={() => {
          setContactSavedPromptOpen(false);
          if (lastSavedContact) {
            setCreateLeadPrefill(lastSavedContact);
            setCreateLeadOpen(true);
          }
        }}
      />

      {leadToSendToPipeline && pipelines && pipelines.length > 0 && (
        <SendToPipelineDialog
          open={sendToPipelineOpen}
          onOpenChange={(v) => { setSendToPipelineOpen(v); if (!v) setLeadToSendToPipeline(null); }}
          lead={leadToSendToPipeline}
          pipelines={pipelines}
        />
      )}
    </PageShell>
  );
}
