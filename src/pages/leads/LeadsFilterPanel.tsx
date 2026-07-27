import { memo } from 'react';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { DatePicker } from '@/components/ui/date-picker';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { statusConfig, LeadFilters } from './constants';

interface Props {
  filters: LeadFilters;
  setFilters: React.Dispatch<React.SetStateAction<LeadFilters>>;
  toggleStatus: (s: string) => void;
  pipelines: { id: string; name: string }[] | undefined;
  teamMembers: { id: string; name: string }[] | undefined;
}

export const LeadsFilterPanel = memo(function LeadsFilterPanel({ filters, setFilters, toggleStatus, pipelines, teamMembers }: Props) {
  return (
    <>
      <div className="space-y-2">
        <Label className="text-sm font-medium">Status</Label>
        <div className="grid grid-cols-2 gap-2">
          {Object.entries(statusConfig).map(([key, { label }]) => (
            <div key={key} className="flex items-center space-x-2">
              <Checkbox id={`status-${key}`} checked={filters.status.includes(key)} onCheckedChange={() => toggleStatus(key)} />
              <label htmlFor={`status-${key}`} className="text-sm cursor-pointer">{label}</label>
            </div>
          ))}
        </div>
      </div>

      <div className="space-y-2">
        <Label className="text-sm font-medium">Pipeline</Label>
        <Select
          value={filters.pipelineId || 'all'}
          onValueChange={(value) => setFilters(prev => ({ ...prev, pipelineId: value === 'all' ? null : value }))}
        >
          <SelectTrigger><SelectValue placeholder="Todos os pipelines" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos os pipelines</SelectItem>
            {pipelines?.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-2">
        <Label className="text-sm font-medium">Responsável</Label>
        <Select
          value={filters.assignedTo || 'all'}
          onValueChange={(value) => setFilters(prev => ({ ...prev, assignedTo: value === 'all' ? null : value }))}
        >
          <SelectTrigger><SelectValue placeholder="Todos" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos</SelectItem>
            <SelectItem value="unassigned">Não atribuído</SelectItem>
            {teamMembers?.map((m) => <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-2">
        <Label className="text-sm font-medium">Valor (R$)</Label>
        <div className="flex gap-2">
          <Input type="number" placeholder="Mínimo" value={filters.minValue} onChange={(e) => setFilters(prev => ({ ...prev, minValue: e.target.value }))} className="flex-1" />
          <Input type="number" placeholder="Máximo" value={filters.maxValue} onChange={(e) => setFilters(prev => ({ ...prev, maxValue: e.target.value }))} className="flex-1" />
        </div>
      </div>

      <div className="space-y-2">
        <Label className="text-sm font-medium">Data de criação</Label>
        <div className="flex gap-2">
          <DatePicker value={filters.dateFrom || undefined} onChange={(d) => setFilters(prev => ({ ...prev, dateFrom: d || null }))} placeholder="De" className="flex-1" />
          <DatePicker value={filters.dateTo || undefined} onChange={(d) => setFilters(prev => ({ ...prev, dateTo: d || null }))} placeholder="Até" className="flex-1" />
        </div>
      </div>
    </>
  );
});
