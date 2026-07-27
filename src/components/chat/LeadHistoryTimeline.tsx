import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useLeadHistory, type LeadHistoryRow } from '@/hooks/useLeadHistory';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { supabase } from '@/integrations/supabase/client';
import {
  UserPlus,
  UserCog,
  Tag as TagIcon,
  TagsIcon,
  ArrowRightLeft,
  Ticket,
  CheckCircle2,
  CircleDot,
  Edit3,
  Workflow,
  Loader2,
  Flag,
  FolderOpen,
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface Props {
  leadId: string | null | undefined;
}

const STATUS_PT: Record<string, string> = {
  new: 'Novo',
  contacted: 'Contatado',
  qualified: 'Qualificado',
  proposal: 'Proposta',
  negotiation: 'Negociação',
  won: 'Ganho',
  lost: 'Perdido',
  on_hold: 'Em pausa',
};
const statusLabel = (v?: string | null) => (v ? STATUS_PT[v] ?? v : '-');

function iconFor(event: LeadHistoryRow['event_type']) {
  switch (event) {
    case 'lead_created': return UserPlus;
    case 'name_changed': return Edit3;
    case 'assigned_changed':
    case 'ticket_transferred': return ArrowRightLeft;
    case 'stage_changed':
    case 'pipeline_changed': return Workflow;
    case 'tag_added':
    case 'tag_removed': return event === 'tag_added' ? TagIcon : TagsIcon;
    case 'ticket_opened': return Ticket;
    case 'ticket_closed': return CheckCircle2;
    case 'ticket_priority_changed': return Flag;
    case 'ticket_category_changed': return FolderOpen;
    case 'status_changed': return UserCog;
    default: return CircleDot;
  }
}

function describe(row: LeadHistoryRow, stageNames: Record<string, string>): string {
  const p = row.payload || {};
  switch (row.event_type) {
    case 'lead_created':
      return `Lead criado${p.source ? ` via ${p.source}` : ''}`;
    case 'name_changed':
      return `Nome alterado de "${p.from || '-'}" para "${p.to || '-'}"`;
    case 'assigned_changed':
      return p.to_name
        ? `Atendente alterado para ${p.to_name}`
        : p.from_name
          ? `Atendente removido (era ${p.from_name})`
          : 'Atendente alterado';
    case 'stage_changed': {
      const from = p.to_stage_name || stageNames[p.from_stage_id] || null;
      const to = p.to_stage_name || stageNames[p.to_stage_id] || null;
      const fromN = p.from_stage_name || stageNames[p.from_stage_id] || null;
      if (to && fromN) return `Etapa alterada: ${fromN} → ${to}`;
      if (to) return `Movido para etapa "${to}"`;
      return 'Etapa alterada';
    }
    case 'pipeline_changed':
      return 'Pipeline alterado';
    case 'status_changed':
      return `Status: ${statusLabel(p.from)} → ${statusLabel(p.to)}`;
    case 'tag_added':
      return `Tag adicionada: ${p.tag_name || ''}`;
    case 'tag_removed':
      return `Tag removida: ${p.tag_name || ''}`;
    case 'ticket_opened':
      return `Ticket aberto ${p.ticket_code ? `(${p.ticket_code})` : ''}`.trim();
    case 'ticket_closed':
      return `Ticket encerrado${p.reason ? ` — ${p.reason}` : ''}`;
    case 'ticket_transferred':
      return p.to_name
        ? `Ticket transferido para ${p.to_name}`
        : 'Ticket transferido';
    case 'ticket_priority_changed':
      return p.to
        ? `Prioridade alterada para ${p.to}${p.from ? ` (era ${p.from})` : ''}`
        : 'Prioridade removida';
    case 'ticket_category_changed':
      return p.to
        ? `Categoria alterada para ${p.to}${p.from ? ` (era ${p.from})` : ''}`
        : 'Categoria removida';
    default:
      return row.event_type;
  }
}

export function LeadHistoryTimeline({ leadId }: Props) {
  const { data, isLoading } = useLeadHistory(leadId);

  const stageIds = useMemo(() => {
    const ids = new Set<string>();
    (data || []).forEach((r) => {
      if (r.event_type === 'stage_changed') {
        const p = r.payload || {};
        if (p.from_stage_id) ids.add(p.from_stage_id);
        if (p.to_stage_id) ids.add(p.to_stage_id);
      }
    });
    return Array.from(ids);
  }, [data]);

  const { data: stageNames = {} } = useQuery({
    queryKey: ['lead-history-stage-names', stageIds.sort().join(',')],
    enabled: stageIds.length > 0,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('pipeline_stages')
        .select('id, name')
        .in('id', stageIds);
      if (error) throw error;
      const map: Record<string, string> = {};
      (data || []).forEach((s: any) => { map[s.id] = s.name; });
      return map;
    },
  });

  if (!leadId) {
    return (
      <p className="text-xs text-muted-foreground/70 px-1 py-2">
        Vincule um lead para ver o histórico.
      </p>
    );
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-4">
        <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!data || data.length === 0) {
    return (
      <p className="text-xs text-muted-foreground/70 px-1 py-2">
        Sem eventos registrados ainda.
      </p>
    );
  }

  return (
    <ol className="relative space-y-3 pl-5 border-l border-border/50">
      {data.map((row) => {
        const Icon = iconFor(row.event_type);
        return (
          <li key={row.id} className="relative">
            <span
              className={cn(
                'absolute -left-[26px] top-0.5 w-5 h-5 rounded-full bg-card border border-border flex items-center justify-center text-muted-foreground'
              )}
            >
              <Icon className="w-3 h-3" />
            </span>
            <div className="text-xs">
              <p className="text-foreground/90 leading-snug">{describe(row, stageNames)}</p>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                {row.actor_name && <span>{row.actor_name} · </span>}
                {format(new Date(row.created_at), "dd 'de' MMM 'de' yyyy 'às' HH:mm", { locale: ptBR })}
              </p>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
