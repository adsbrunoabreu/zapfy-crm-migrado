import { memo, useCallback } from 'react';
import { cn } from '@/lib/utils';
import { formatLeadCode } from '@/lib/format';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuSeparator, DropdownMenuTrigger, DropdownMenuLabel,
} from '@/components/ui/dropdown-menu';
import {
  Calendar, MoreHorizontal, Eye, Edit, Trash2,
  ArrowRightLeft, TrendingUp, ArrowUp, ArrowDown, ArrowUpDown,
} from 'lucide-react';
import type { Lead } from '@/hooks/useLeads';
import { statusConfig, getStageClassName, formatPhoneDisplay, formatCurrency, formatDate, SortKey } from './constants';

interface Props {
  leads: Lead[];
  sortKey: SortKey;
  sortDir: 'asc' | 'desc';
  onToggleSort: (key: SortKey) => void;
  selectedLeads: Set<string>;
  onSelectAll: (checked: boolean) => void;
  onSelectLead: (id: string, checked: boolean) => void;
  onOpenDetail: (lead: Lead) => void;
  onDelete: (lead: Lead) => void;
  onTransfer: (lead: Lead) => void;
  onSendToPipeline: (lead: Lead) => void;
}

interface HeadProps {
  label: string;
  sortField: SortKey;
  className?: string;
  sortKey: SortKey;
  sortDir: 'asc' | 'desc';
  onToggleSort: (key: SortKey) => void;
}

const SortableHead = memo(function SortableHead({ label, sortField, className = '', sortKey, sortDir, onToggleSort }: HeadProps) {
  return (
    <TableHead
      className={`font-semibold cursor-pointer select-none hover:text-foreground transition-colors ${className}`}
      onClick={() => onToggleSort(sortField)}
    >
      <div className="flex items-center gap-1">
        {label}
        {sortKey === sortField ? (
          sortDir === 'asc' ? <ArrowUp className="w-3.5 h-3.5" /> : <ArrowDown className="w-3.5 h-3.5" />
        ) : (
          <ArrowUpDown className="w-3.5 h-3.5 text-muted-foreground/50" />
        )}
      </div>
    </TableHead>
  );
});

export const LeadsTable = memo(function LeadsTable(props: Props) {
  const { leads, sortKey, sortDir, onToggleSort, selectedLeads, onSelectAll, onSelectLead,
    onOpenDetail, onDelete, onTransfer, onSendToPipeline } = props;

  const headProps = { sortKey, sortDir, onToggleSort };

  return (
    <Table>
      <TableHeader>
        <TableRow className="border-border/50 hover:bg-transparent">
          <TableHead className="w-[40px]">
            <Checkbox
              checked={selectedLeads.size === leads.length && leads.length > 0}
              onCheckedChange={(checked) => onSelectAll(!!checked)}
            />
          </TableHead>
          <SortableHead label="#" sortField="code" className="w-[70px]" {...headProps} />
          <SortableHead label="Lead" sortField="name" className="w-[22%]" {...headProps} />
          <SortableHead label="Pipeline" sortField="pipeline" className="w-[10%]" {...headProps} />
          <SortableHead label="Etapa" sortField="stage" className="w-[10%]" {...headProps} />
          <SortableHead label="Responsável" sortField="assignee" className="w-[14%]" {...headProps} />
          <SortableHead label="Valor" sortField="value" className="w-[10%]" {...headProps} />
          <SortableHead label="Status" sortField="status" className="w-[10%]" {...headProps} />
          <SortableHead label="Data" sortField="created_at" className="w-[12%]" {...headProps} />
          <TableHead className="w-[40px] font-semibold text-right">Ações</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {leads.map((lead, index) => (
          <LeadRow
            key={lead.id}
            lead={lead}
            index={index}
            selected={selectedLeads.has(lead.id)}
            onSelectLead={onSelectLead}
            onOpenDetail={onOpenDetail}
            onDelete={onDelete}
            onTransfer={onTransfer}
            onSendToPipeline={onSendToPipeline}
          />
        ))}
      </TableBody>
    </Table>
  );
});

interface RowProps {
  lead: Lead;
  index: number;
  selected: boolean;
  onSelectLead: (id: string, checked: boolean) => void;
  onOpenDetail: (lead: Lead) => void;
  onDelete: (lead: Lead) => void;
  onTransfer: (lead: Lead) => void;
  onSendToPipeline: (lead: Lead) => void;
}

const LeadRow = memo(function LeadRow({ lead, index, selected, onSelectLead, onOpenDetail, onDelete, onTransfer, onSendToPipeline }: RowProps) {
  const open = useCallback(() => onOpenDetail(lead), [lead, onOpenDetail]);
  return (
    <TableRow
      className="border-border/50 hover:bg-accent/50 cursor-pointer transition-colors h-16 animate-fade-in"
      style={{ animationDelay: `${Math.min(index * 30, 300)}ms` }}
    >
      <TableCell onClick={(e) => e.stopPropagation()}>
        <Checkbox checked={selected} onCheckedChange={(checked) => onSelectLead(lead.id, !!checked)} />
      </TableCell>
      <TableCell onClick={open} className="font-mono text-xs tabular-nums text-muted-foreground">
        {formatLeadCode((lead as any).tenant_seq)}
      </TableCell>
      <TableCell onClick={open}>
        <div className="min-w-0">
          <p className="font-medium truncate">{lead.name}</p>
          {lead.phone && <p className="text-xs text-muted-foreground truncate">{formatPhoneDisplay(lead.phone)}</p>}
        </div>
      </TableCell>
      <TableCell className="text-muted-foreground" onClick={open}>{lead.pipeline?.name || '-'}</TableCell>
      <TableCell onClick={open}>
        {lead.stage?.name ? (
          <Badge variant="outline" className={cn("text-xs", getStageClassName(lead.stage.name))}>{lead.stage.name}</Badge>
        ) : <span className="text-muted-foreground">-</span>}
      </TableCell>
      <TableCell onClick={open}>
        {lead.assignee ? (
          <span className="text-sm truncate">{lead.assignee.full_name || lead.assignee.email}</span>
        ) : <span className="text-muted-foreground text-sm">-</span>}
      </TableCell>
      <TableCell onClick={open}>
        <span className={cn("font-semibold", lead.value && lead.value > 0 ? "text-emerald" : "text-muted-foreground")}>
          {formatCurrency(lead.value)}
        </span>
      </TableCell>
      <TableCell onClick={open}>
        <Badge variant="outline" className={statusConfig[lead.status]?.className}>
          {statusConfig[lead.status]?.label || lead.status}
        </Badge>
      </TableCell>
      <TableCell onClick={open}>
        <div className="flex items-center gap-2 text-muted-foreground text-sm">
          <Calendar className="w-3.5 h-3.5 shrink-0" />
          <span>{formatDate(lead.created_at)}</span>
        </div>
      </TableCell>
      <TableCell onClick={(e) => e.stopPropagation()}>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="h-8 w-8"><MoreHorizontal className="w-4 h-4" /></Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuLabel className="text-xs text-muted-foreground font-semibold">{lead.name}</DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={open}><Eye className="w-4 h-4 mr-2" />Ver detalhes</DropdownMenuItem>
            <DropdownMenuItem onClick={open}><Edit className="w-4 h-4 mr-2" />Editar</DropdownMenuItem>
            <DropdownMenuItem onClick={() => onTransfer(lead)}>
              <ArrowRightLeft className="w-4 h-4 mr-2" />Transferir para...
            </DropdownMenuItem>
            {!lead.pipeline_id && (
              <DropdownMenuItem onClick={() => onSendToPipeline(lead)}>
                <TrendingUp className="w-4 h-4 mr-2" />Enviar para Pipeline
              </DropdownMenuItem>
            )}
            <DropdownMenuSeparator />
            <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={() => onDelete(lead)}>
              <Trash2 className="w-4 h-4 mr-2" />Excluir
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </TableCell>
    </TableRow>
  );
});
