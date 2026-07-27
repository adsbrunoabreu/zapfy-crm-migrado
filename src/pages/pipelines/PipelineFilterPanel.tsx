import { memo } from 'react';
import { Search } from 'lucide-react';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import type { PipelineFilters } from './usePipelineFilters';

interface Props {
  filters: PipelineFilters;
  setFilters: React.Dispatch<React.SetStateAction<PipelineFilters>>;
  toggleTag: (id: string) => void;
  pipelines: { id: string; name: string }[] | undefined;
  selectedPipelineId: string | null;
  onSelectPipeline: (id: string) => void;
  teamMembers: { id: string; name: string }[] | undefined;
  tags: { id: string; name: string; color?: string | null }[] | undefined;
  doctors?: { id: string; name: string }[];
  procedures?: { id: string; name: string }[];
  showMedicalFilters?: boolean;
}

export const PipelineFilterPanel = memo(function PipelineFilterPanel({
  filters, setFilters, toggleTag, pipelines, selectedPipelineId, onSelectPipeline, teamMembers, tags,
  doctors, procedures, showMedicalFilters,
}: Props) {
  return (
    <>
      <div className="space-y-3">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/80">Seleção</span>
        {pipelines && pipelines.length > 0 && (
          <div className="space-y-1.5">
            <Label className="text-xs font-medium text-muted-foreground">Pipeline</Label>
            <Select value={selectedPipelineId || ''} onValueChange={onSelectPipeline}>
              <SelectTrigger className="bg-secondary/50 border-border/50 h-9">
                <SelectValue placeholder="Selecione um pipeline" />
              </SelectTrigger>
              <SelectContent>
                {pipelines.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        )}
        <div className="space-y-1.5">
          <Label className="text-xs font-medium text-muted-foreground">Responsável</Label>
          <Select
            value={filters.assignedTo || 'all'}
            onValueChange={(value) => setFilters(prev => ({ ...prev, assignedTo: value === 'all' ? null : value }))}
          >
            <SelectTrigger className="bg-secondary/50 border-border/50 h-9">
              <SelectValue placeholder="Todos" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos</SelectItem>
              <SelectItem value="unassigned">Não atribuído</SelectItem>
              {teamMembers?.map((m) => <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        {showMedicalFilters && (
          <>
            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-muted-foreground">Médico</Label>
              <Select
                value={filters.doctorId || 'all'}
                onValueChange={(value) => setFilters(prev => ({ ...prev, doctorId: value === 'all' ? null : value }))}
              >
                <SelectTrigger className="bg-secondary/50 border-border/50 h-9">
                  <SelectValue placeholder="Todos" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  <SelectItem value="none">Sem médico</SelectItem>
                  {doctors?.map((d) => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-muted-foreground">Procedimento</Label>
              <Select
                value={filters.procedureId || 'all'}
                onValueChange={(value) => setFilters(prev => ({ ...prev, procedureId: value === 'all' ? null : value }))}
              >
                <SelectTrigger className="bg-secondary/50 border-border/50 h-9">
                  <SelectValue placeholder="Todos" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  <SelectItem value="none">Sem procedimento</SelectItem>
                  {procedures?.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </>
        )}
      </div>


      <div className="space-y-3 pt-3 border-t border-border/40">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/80">Busca</span>
        <div className="space-y-1.5">
          <Label className="text-xs font-medium text-muted-foreground">Buscar lead</Label>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Nome do lead..."
              value={filters.searchQuery}
              onChange={(e) => setFilters(prev => ({ ...prev, searchQuery: e.target.value }))}
              className="pl-9 h-9"
            />
          </div>
        </div>
      </div>

      <div className="space-y-3 pt-3 border-t border-border/40">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/80">Intervalos</span>
        <div className="space-y-1.5">
          <Label className="text-xs font-medium text-muted-foreground">Valor (R$)</Label>
          <div className="flex gap-2">
            <Input type="number" placeholder="Mínimo" value={filters.minValue}
              onChange={(e) => setFilters(prev => ({ ...prev, minValue: e.target.value }))} className="flex-1 h-9" />
            <Input type="number" placeholder="Máximo" value={filters.maxValue}
              onChange={(e) => setFilters(prev => ({ ...prev, maxValue: e.target.value }))} className="flex-1 h-9" />
          </div>
        </div>
      </div>

      {tags && tags.length > 0 && (
        <div className="space-y-3 pt-3 border-t border-border/40">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/80">Marcadores</span>
          <div className="space-y-1.5">
            <Label className="text-xs font-medium text-muted-foreground">Tags</Label>
            <div className="flex flex-wrap gap-2">
              {tags.map((tag) => (
                <div key={tag.id} className="flex items-center space-x-2">
                  <Checkbox id={`tag-${tag.id}`} checked={filters.tagIds.includes(tag.id)} onCheckedChange={() => toggleTag(tag.id)} />
                  <label htmlFor={`tag-${tag.id}`} className="text-sm cursor-pointer flex items-center gap-1.5">
                    <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: tag.color || '#6366f1' }} />
                    {tag.name}
                  </label>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  );
});
