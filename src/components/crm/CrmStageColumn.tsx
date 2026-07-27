import { ArrowUp, ArrowDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { useDroppable, useDraggable } from '@dnd-kit/core';
import { CrmLeadCard, CrmLeadCardOverlay, formatLeadCurrency, type CrmLeadData } from './CrmLeadCard';
import { useNavigate } from 'react-router-dom';

interface StageData {
  id: string;
  name: string;
  color: string | null;
  position: number;
  pipeline_id: string;
  stage_type?: 'open' | 'won' | 'lost' | null;
  leads: CrmLeadData[];
}

interface CrmStageColumnProps {
  stage: StageData;
  onLeadClick: (lead: CrmLeadData) => void;
  onDeleteLead: (lead: CrmLeadData) => void;
  onTransferLead: (lead: CrmLeadData) => void;
  onMarkWon?: (lead: CrmLeadData) => void;
  onMarkLost?: (lead: CrmLeadData) => void;
  onReopen?: (lead: CrmLeadData) => void;
  sortDirection: 'asc' | 'desc';
  onToggleSort: () => void;
}

function DraggableCard({ lead, stageId, onViewDetails, onEdit, onSendMessage, onTransfer, onDelete, onMarkWon, onMarkLost, onReopen }: {
  lead: CrmLeadData;
  stageId: string;
  onViewDetails: () => void;
  onEdit: () => void;
  onSendMessage: () => void;
  onTransfer: () => void;
  onDelete: () => void;
  onMarkWon?: () => void;
  onMarkLost?: () => void;
  onReopen?: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: lead.id,
    data: { type: 'lead', lead, stageId },
  });

  const style: React.CSSProperties = {
    transform: transform ? `translate(${transform.x}px, ${transform.y}px)` : undefined,
    opacity: isDragging ? 0.3 : 1,
  };

  return (
    <div ref={setNodeRef} style={style} {...attributes} {...listeners}>
      <CrmLeadCard
        lead={lead}
        onViewDetails={onViewDetails}
        onEdit={onEdit}
        onSendMessage={onSendMessage}
        onTransfer={onTransfer}
        onDelete={onDelete}
        onMarkWon={onMarkWon}
        onMarkLost={onMarkLost}
        onReopen={onReopen}
        className="cursor-grab active:cursor-grabbing"
      />
    </div>
  );
}

export function CrmStageColumn({ stage, onLeadClick, onDeleteLead, onTransferLead, onMarkWon, onMarkLost, onReopen, sortDirection, onToggleSort }: CrmStageColumnProps) {
  const navigate = useNavigate();
  const totalValue = stage.leads.reduce((sum, lead) => sum + (lead.value || 0), 0);

  const { setNodeRef, isOver } = useDroppable({ id: stage.id });

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(value);
  };

  const sortedLeads = [...stage.leads].sort((a, b) => {
    const dateA = new Date(a.created_at).getTime();
    const dateB = new Date(b.created_at).getTime();
    return sortDirection === 'asc' ? dateA - dateB : dateB - dateA;
  });

  return (
    <div
      ref={setNodeRef}
      className={`flex flex-col w-[280px] shrink-0 h-full rounded-xl bg-crm-column border border-border/30 transition-all duration-200 ${
        isOver ? 'ring-2 ring-primary/50 ring-offset-2 ring-offset-background border-primary/30' : ''
      }`}
      style={{ borderRadius: 'var(--crm-radius)' }}
    >
      {/* Column Header */}
      <div className="p-4 shrink-0 bg-crm-column-header rounded-t-xl">
        <div className="flex items-center justify-between mb-1.5">
          <div className="flex items-center gap-2.5">
            <div
              className="w-3 h-3 rounded-full shrink-0"
              style={{ backgroundColor: stage.color || '#6366f1' }}
            />
            <h3 className="font-display font-semibold text-sm text-foreground">{stage.name}</h3>
          </div>
          <div className="flex items-center gap-1">
            <span className="text-[11px] font-medium text-muted-foreground bg-secondary/60 px-2 py-0.5 rounded-md">
              {stage.leads.length}
            </span>
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-foreground" onClick={onToggleSort}>
                    {sortDirection === 'asc' ? (
                      <ArrowUp className="w-3.5 h-3.5" />
                    ) : (
                      <ArrowDown className="w-3.5 h-3.5" />
                    )}
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="top" className="text-xs">
                  {sortDirection === 'asc' ? 'Mais antigos primeiro' : 'Mais recentes primeiro'}
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
        </div>
        <p className="text-xs font-medium text-muted-foreground">{formatCurrency(totalValue)}</p>
      </div>

      {/* Separator */}
      <div className="h-px bg-border/40 mx-3" />

      {/* Cards - Scrollable */}
      <div className={`p-2.5 space-y-2 flex-1 overflow-y-auto kanban-scroll min-h-0 transition-colors duration-200 ${
        isOver ? 'bg-primary/5' : ''
      }`}>
        {sortedLeads.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <p className="text-xs text-muted-foreground">Nenhum lead nesta etapa</p>
          </div>
        ) : (
          sortedLeads.map((lead, idx) => (
            <DraggableCard
              key={lead.id}
              lead={lead}
              stageId={stage.id}
              onViewDetails={() => onLeadClick(lead)}
              onEdit={() => onLeadClick(lead)}
              onSendMessage={() => {}}
              onTransfer={() => onTransferLead(lead)}
              onDelete={() => onDeleteLead(lead)}
              onMarkWon={onMarkWon ? () => onMarkWon(lead) : undefined}
              onMarkLost={onMarkLost ? () => onMarkLost(lead) : undefined}
              onReopen={onReopen ? () => onReopen(lead) : undefined}
            />
          ))
        )}
      </div>

      {/* Footer info: indica visualmente etapas de Ganho/Perda */}
      {(stage.stage_type === 'won' || stage.stage_type === 'lost') && (
        <div className="p-2.5 shrink-0">
          <div className="w-full h-9 flex items-center justify-center text-[11px] text-muted-foreground/70 italic">
            Etapa de {stage.stage_type === 'won' ? 'Ganho' : 'Perda'}
          </div>
        </div>
      )}
    </div>
  );
}

export { CrmLeadCardOverlay };
export type { StageData, CrmLeadData };
