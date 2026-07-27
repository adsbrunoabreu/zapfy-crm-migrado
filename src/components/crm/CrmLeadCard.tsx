import { Banknote, Calendar, User, Tag, MoreHorizontal, ArrowRightLeft, Trash2, Trophy, XCircle, RotateCcw, Stethoscope, Syringe, ShieldPlus } from 'lucide-react';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { useContactPhoto } from '@/components/chat/chatHelpers';
import { useCompanyVertical } from '@/hooks/useCompanyVertical';

export interface CrmLeadTag {
  id: string;
  name: string;
  color: string | null;
}

export interface CrmLeadAssignee {
  id: string;
  full_name: string | null;
  email: string;
}

export interface CrmLeadData {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  value: number | null;
  status: string;
  created_at: string;
  assigned_to: string | null;
  assignee: CrmLeadAssignee | null;
  tags: CrmLeadTag[];
  hasPendingActivities: boolean;
  numeric_id?: number;
  tenant_seq?: number;
  avatar_url?: string | null;
  contact_photo_url?: string | null;
  medical_doctor_name?: string | null;
  medical_procedure_name?: string | null;
  procedures?: { id: string; name: string }[];
  insurance?: string | null;
}

interface CrmLeadCardProps {
  lead: CrmLeadData;
  onViewDetails: () => void;
  onEdit: () => void;
  onSendMessage: () => void;
  onTransfer: () => void;
  onDelete: () => void;
  onMarkWon?: () => void;
  onMarkLost?: () => void;
  onReopen?: () => void;
  className?: string;
}

// --- Utility functions ---

const avatarColors = [
  { bg: 'hsl(192 91% 36% / 0.15)', text: 'hsl(192 91% 36%)' },
  { bg: 'hsl(160 84% 36% / 0.15)', text: 'hsl(160 84% 36%)' },
  { bg: 'hsl(263 70% 50% / 0.15)', text: 'hsl(263 70% 50%)' },
  { bg: 'hsl(38 92% 50% / 0.15)', text: 'hsl(38 92% 50%)' },
  { bg: 'hsl(350 89% 60% / 0.15)', text: 'hsl(350 89% 60%)' },
  { bg: 'hsl(220 70% 50% / 0.15)', text: 'hsl(220 70% 50%)' },
];

function getAvatarColor(name: string) {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return avatarColors[Math.abs(hash) % avatarColors.length];
}

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

export function formatLeadCurrency(value: number | null) {
  if (value === null || value === undefined) return 'R$ 0,00';
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: 2,
  }).format(value);
}

// --- Component ---

export function CrmLeadCard({ lead, onViewDetails, onEdit, onSendMessage, onTransfer, onDelete, onMarkWon, onMarkLost, onReopen, className = '' }: CrmLeadCardProps) {
  const formattedValue = formatLeadCurrency(lead.value);
  const avatar = getAvatarColor(lead.name);
  const ownerName = lead.assignee?.full_name || lead.assignee?.email || null;
  const isWon = lead.status === 'won';
  const isLost = lead.status === 'lost';
  const isClosed = isWon || isLost;
  const cardId = lead.tenant_seq ? `#${String(lead.tenant_seq).padStart(4, '0')}` : (lead.numeric_id ? `#${lead.numeric_id}` : '');
  const { data: vertical } = useCompanyVertical();
  const isMedical = vertical === 'medical';
  const insuranceLabel = lead.insurance && lead.insurance.trim() ? lead.insurance.trim() : 'Particular';

  // WhatsApp profile photo (falls back to lead.avatar_url, then conversations.contact_photo_url, then initials)
  const photoUrl = useContactPhoto(
    lead.phone || '',
    lead.avatar_url ?? lead.contact_photo_url ?? null,
    lead.id,
  );

  return (
    <div
      className={`group relative bg-card rounded-xl border border-border/50 hover:border-border transition-all duration-200 overflow-hidden ${isClosed ? 'opacity-90' : ''} ${isWon ? 'border-l-2 border-l-emerald-500/60' : ''} ${isLost ? 'border-l-2 border-l-destructive/60' : ''} ${className}`}
      style={{ boxShadow: 'var(--crm-shadow-card)', borderRadius: 'var(--crm-radius)' }}
      onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.boxShadow = 'var(--crm-shadow-card-hover)'; }}
      onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.boxShadow = 'var(--crm-shadow-card)'; }}
      onClick={(e) => {
        if (!(e.target as HTMLElement).closest('[data-no-card-click]')) {
          onViewDetails();
        }
      }}
    >
      <div className="p-4">
        {/* Row 1: Avatar + Name + ID */}
        <div className="flex items-start gap-3 mb-1">
          <Avatar className="w-10 h-10 shrink-0">
            {photoUrl && <AvatarImage src={photoUrl} alt={lead.name} />}
            <AvatarFallback
              className="text-sm font-bold"
              style={{ backgroundColor: avatar.bg, color: avatar.text }}
            >
              {lead.name[0]?.toUpperCase()}
            </AvatarFallback>
          </Avatar>

          <div className="flex-1 min-w-0">
            <span className="font-semibold text-[15px] text-foreground block truncate leading-tight">
              {lead.name}
            </span>
            <span className="text-xs text-muted-foreground truncate block mt-0.5">{lead.phone || 'Sem telefone'}</span>
          </div>

          <div className="flex items-center gap-1.5 shrink-0 mt-0.5">
            {isWon && (
              <span
                aria-label="Lead ganho"
                title="Lead ganho"
                className="inline-flex items-center justify-center rounded-full p-1 bg-emerald-500/15 text-emerald-400 border border-emerald-500/30"
              >
                <Trophy className="w-3 h-3" />
              </span>
            )}
            {isLost && (
              <span
                aria-label="Lead perdido"
                title="Lead perdido"
                className="inline-flex items-center justify-center rounded-full p-1 bg-destructive/15 text-destructive border border-destructive/30"
              >
                <XCircle className="w-3 h-3" />
              </span>
            )}
            {cardId && (
              <span className="text-xs text-muted-foreground font-mono">{cardId}</span>
            )}
          </div>
        </div>

        {/* Row 2: Metadata padrão */}
        <div className="border-t border-border/30 pt-3 mt-3 space-y-2">
          <div className="flex items-center gap-2.5 text-[13px] text-muted-foreground">
            <User className="w-4 h-4 shrink-0" />
            {ownerName ? (
              <span className="truncate">{ownerName}</span>
            ) : (
              <span className="text-crm-no-owner truncate">Sem atendente</span>
            )}
          </div>
          <div className="flex items-center gap-2.5 text-[13px]">
            <Banknote className="w-4 h-4 shrink-0 text-muted-foreground" />
            <span className="font-medium text-foreground truncate">{formattedValue}</span>
          </div>
          <div className="flex items-center gap-2.5 text-[13px] text-muted-foreground">
            <Calendar className="w-4 h-4 shrink-0" />
            <span className="truncate">{formatDate(lead.created_at)}</span>
          </div>
        </div>

        {/* Row 2b: Bloco médico empilhado em largura total */}
        {isMedical && (
          <div className="border-t border-border/30 pt-3 mt-3 space-y-2">
            <div className="flex items-center gap-2.5 text-[13px] text-muted-foreground">
              <Stethoscope className="w-4 h-4 shrink-0" />
              {lead.medical_doctor_name ? (
                <span className="truncate" title={lead.medical_doctor_name}>{lead.medical_doctor_name}</span>
              ) : (
                <span className="truncate italic opacity-70">Sem médico</span>
              )}
            </div>
            <div className="flex items-center gap-2.5 text-[13px] text-muted-foreground">
              <Syringe className="w-4 h-4 shrink-0" />
              {(() => {
                const procs = lead.procedures ?? [];
                if (procs.length > 0) {
                  const first = procs[0].name;
                  const extra = procs.length - 1;
                  const titleAll = procs.map(p => p.name).join(', ');
                  return (
                    <span className="truncate flex items-center gap-1.5" title={titleAll}>
                      <span className="truncate">{first}</span>
                      {extra > 0 && (
                        <span className="shrink-0 text-[11px] font-medium px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground">
                          +{extra}
                        </span>
                      )}
                    </span>
                  );
                }
                if (lead.medical_procedure_name) {
                  return <span className="truncate" title={lead.medical_procedure_name}>{lead.medical_procedure_name}</span>;
                }
                return <span className="truncate italic opacity-70">Sem procedimento</span>;
              })()}
            </div>
            <div className="flex items-center gap-2.5 text-[13px] text-muted-foreground">
              <ShieldPlus className="w-4 h-4 shrink-0" />
              <span className="truncate" title={insuranceLabel}>{insuranceLabel}</span>
            </div>
          </div>
        )}



        {/* Row 3: Tags + Actions menu */}
        <div className="flex items-center gap-2 mt-3 pt-3 border-t border-border/30">
          <Tag className="w-3.5 h-3.5 shrink-0 text-muted-foreground" />
          <div className="flex-1 min-w-0 flex items-center gap-1.5 overflow-x-auto no-scrollbar">
            {lead.tags && lead.tags.length > 0 ? (
              <>
                {lead.tags.slice(0, 3).map(tag => (
                  <span
                    key={tag.id}
                    className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase whitespace-nowrap tracking-wide"
                    style={{
                      backgroundColor: `${tag.color || '#6366f1'}18`,
                      color: tag.color || '#6366f1',
                      border: `1px solid ${tag.color || '#6366f1'}30`,
                    }}
                  >
                    {tag.name}
                  </span>
                ))}
                {lead.tags.length > 3 && (
                  <span className="text-xs text-muted-foreground whitespace-nowrap">+{lead.tags.length - 3}</span>
                )}
              </>
            ) : (
              <span className="text-xs text-muted-foreground">Sem tags</span>
            )}
          </div>


          <div
            data-no-card-click
            className="shrink-0"
            onClick={(e) => e.stopPropagation()}
            onPointerDown={(e) => e.stopPropagation()}
          >
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  className="h-6 w-6 inline-flex items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-secondary/60 sm:opacity-0 group-hover:opacity-100 focus:opacity-100 transition"
                  aria-label="Ações do lead"
                >
                  <MoreHorizontal className="w-4 h-4" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-44">
                {!isClosed && onMarkWon && (
                  <DropdownMenuItem onClick={onMarkWon} className="text-emerald-500 focus:text-emerald-500">
                    <Trophy className="w-4 h-4 mr-2" /> Marcar Ganho
                  </DropdownMenuItem>
                )}
                {!isClosed && onMarkLost && (
                  <DropdownMenuItem onClick={onMarkLost} className="text-destructive focus:text-destructive">
                    <XCircle className="w-4 h-4 mr-2" /> Marcar Perdido
                  </DropdownMenuItem>
                )}
                {isClosed && onReopen && (
                  <DropdownMenuItem onClick={onReopen}>
                    <RotateCcw className="w-4 h-4 mr-2" /> Reabrir
                  </DropdownMenuItem>
                )}
                {(!isClosed || onReopen) && <DropdownMenuSeparator />}
                <DropdownMenuItem onClick={onTransfer}>
                  <ArrowRightLeft className="w-4 h-4 mr-2" /> Transferir
                </DropdownMenuItem>
                <DropdownMenuItem onClick={onDelete} className="text-destructive focus:text-destructive">
                  <Trash2 className="w-4 h-4 mr-2" /> Excluir
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </div>
    </div>
  );
}

// Simplified overlay card for drag
export function CrmLeadCardOverlay({ lead }: { lead: CrmLeadData }) {
  const formattedValue = formatLeadCurrency(lead.value);
  const avatar = getAvatarColor(lead.name);
  const photo = lead.avatar_url || lead.contact_photo_url || null;

  return (
    <div
      className="relative bg-card border border-primary/30 rounded-xl overflow-hidden w-[260px] rotate-2"
      style={{ boxShadow: 'var(--crm-shadow-card-hover)' }}
    >
      <div className="p-4">
        <div className="flex items-center gap-3">
          <Avatar className="w-10 h-10 shrink-0">
            {photo && <AvatarImage src={photo} alt={lead.name} />}
            <AvatarFallback
              className="text-sm font-bold"
              style={{ backgroundColor: avatar.bg, color: avatar.text }}
            >
              {lead.name[0]?.toUpperCase()}
            </AvatarFallback>
          </Avatar>
          <span className="font-semibold text-[15px] truncate block">{lead.name}</span>
        </div>
        <div className="text-[13px] font-medium text-foreground mt-2">{formattedValue}</div>
      </div>
    </div>
  );
}
