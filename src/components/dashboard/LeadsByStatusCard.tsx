import { Card } from '@/components/ui/card';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Info } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RTooltip, ResponsiveContainer, Cell } from 'recharts';

const statusLabels: Record<string, string> = { new: 'Novo', contacted: 'Contactado', qualified: 'Qualificado', proposal: 'Proposta', negotiation: 'Negociação', won: 'Ganho', lost: 'Perdido' };
const statusColors: Record<string, string> = { new: 'hsl(var(--chart-1))', contacted: 'hsl(var(--chart-2))', qualified: 'hsl(var(--chart-3))', proposal: 'hsl(var(--chart-4))', negotiation: 'hsl(var(--chart-5))', won: 'hsl(var(--emerald))', lost: 'hsl(var(--chart-7))' };

interface Props { byStatus: Record<string, number>; }

export function LeadsByStatusCard({ byStatus }: Props) {
  const data = Object.entries(byStatus).map(([status, count]) => ({
    status: statusLabels[status] || status, count, color: statusColors[status] || 'hsl(var(--primary))',
  }));

  return (
    <Card className="glass-card p-6">
      <div className="flex items-center gap-2 mb-4">
        <h3 className="font-display text-lg font-semibold">Leads por Status</h3>
        <TooltipProvider delayDuration={200}>
          <Tooltip>
            <TooltipTrigger asChild><Info className="w-4 h-4 text-muted-foreground/60 cursor-help" /></TooltipTrigger>
            <TooltipContent className="max-w-[220px] text-xs">Distribuição dos leads por status atual no CRM.</TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>
      <div className="h-[260px]">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data}>
            <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
            <XAxis dataKey="status" className="text-xs fill-muted-foreground" tick={{ fontSize: 11 }} />
            <YAxis className="text-xs fill-muted-foreground" />
            <RTooltip contentStyle={{ backgroundColor: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: '8px', color: 'hsl(var(--foreground))' }} />
            <Bar dataKey="count" name="Leads" radius={[6, 6, 0, 0]}>
              {data.map((entry, index) => <Cell key={index} fill={entry.color} />)}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </Card>
  );
}
