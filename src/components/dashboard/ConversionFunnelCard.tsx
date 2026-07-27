import { useState } from 'react';
import { Card } from '@/components/ui/card';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Info } from 'lucide-react';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';

const statusOrder = ['new', 'contacted', 'qualified', 'proposal', 'negotiation', 'won', 'lost'];
const statusLabels: Record<string, string> = { new: 'Novo', contacted: 'Contactado', qualified: 'Qualificado', proposal: 'Proposta', negotiation: 'Negociação', won: 'Ganho', lost: 'Perdido' };
const statusColors: Record<string, string> = { new: 'hsl(var(--chart-1))', contacted: 'hsl(var(--chart-2))', qualified: 'hsl(var(--chart-3))', proposal: 'hsl(var(--chart-4))', negotiation: 'hsl(var(--chart-5))', won: 'hsl(var(--emerald))', lost: 'hsl(var(--chart-7))' };

interface StageData { stage: string; count: number; color: string; }

interface Props {
  byStatus: Record<string, number>;
  pipelineStats: StageData[];
  total: number;
}

type ViewMode = 'status' | 'pipeline';

export function ConversionFunnelCard({ byStatus, pipelineStats, total }: Props) {
  const [view, setView] = useState<ViewMode>('pipeline');

  const items = view === 'status'
    ? statusOrder.map(s => ({ label: statusLabels[s], count: byStatus[s] || 0, color: statusColors[s] })).filter(i => i.count > 0)
    : pipelineStats.map(s => ({ label: s.stage, count: s.count, color: s.color }));

  return (
    <Card className="glass-card p-6">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <h3 className="font-display text-lg font-semibold">Funil de Conversão</h3>
          <TooltipProvider delayDuration={200}>
            <Tooltip>
              <TooltipTrigger asChild><Info className="w-4 h-4 text-muted-foreground/60 cursor-help" /></TooltipTrigger>
              <TooltipContent className="max-w-[240px] text-xs">
                {view === 'pipeline'
                  ? 'Distribuição dos leads pelas etapas configuradas no pipeline.'
                  : 'Distribuição dos leads pelo status comercial (Novo → Ganho/Perdido).'}
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
        <Tabs value={view} onValueChange={(v) => setView(v as ViewMode)}>
          <TabsList className="h-8">
            <TabsTrigger value="pipeline" className="text-xs px-3 h-7">Pipeline</TabsTrigger>
            <TabsTrigger value="status" className="text-xs px-3 h-7">Status</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>
      <div className="space-y-3">
        {items.length === 0 ? (
          <p className="text-muted-foreground text-center py-8">
            {view === 'pipeline' ? 'Nenhuma etapa de pipeline configurada.' : 'Nenhum lead encontrado.'}
          </p>
        ) : (
          items.map((item) => {
            const pct = total > 0 ? (item.count / total) * 100 : 0;
            return (
              <div key={item.label} className="space-y-1">
                <div className="flex items-center justify-between text-sm">
                  <div className="flex items-center gap-2">
                    <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: item.color }} />
                    <span className="text-muted-foreground">{item.label}</span>
                  </div>
                  <span className="font-medium">{item.count} ({pct.toFixed(0)}%)</span>
                </div>
                <div className="h-2 bg-secondary rounded-full overflow-hidden">
                  <div className="h-full rounded-full transition-all duration-500" style={{ width: `${pct}%`, backgroundColor: item.color }} />
                </div>
              </div>
            );
          })
        )}
      </div>
    </Card>
  );
}
