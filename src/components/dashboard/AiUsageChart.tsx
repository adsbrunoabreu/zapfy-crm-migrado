import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { TrendingUp } from 'lucide-react';
import { ResponsiveContainer, ComposedChart, XAxis, YAxis, Tooltip, Bar, Line, CartesianGrid, Legend } from 'recharts';
import { format, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import type { AiSeriesPoint } from '@/hooks/useMasterAiData';

interface Props {
  data: AiSeriesPoint[];
}

export function AiUsageChart({ data }: Props) {
  const chartData = (Array.isArray(data) ? data : [])
    .filter((d) => d && typeof d.day === 'string')
    .map((d) => {
      let label = '';
      try {
        label = format(parseISO(d.day), 'dd/MM', { locale: ptBR });
      } catch {
        label = String(d.day).slice(5, 10);
      }
      const cost = Number(d.cost);
      return {
        label,
        Mensagens: Number.isFinite(d.messages) ? Number(d.messages) : 0,
        Custo: Number.isFinite(cost) ? cost : 0,
        Erros: Number.isFinite(d.errors) ? Number(d.errors) : 0,
      };
    });

  return (
    <Card className="animate-fade-in h-full w-full min-w-0 flex flex-col">
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <TrendingUp className="w-4 h-4 text-muted-foreground" />
          Evolução de uso de IA
        </CardTitle>
        <p className="text-xs text-muted-foreground">Mensagens consumidas e custo estimado por dia</p>
      </CardHeader>
      <CardContent className="flex-1 min-w-0">
        {chartData.length === 0 ? (
          <div className="h-[260px] flex items-center justify-center text-sm text-muted-foreground">
            Sem uso de IA no período.
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={260}>
            <ComposedChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid stroke="hsl(var(--border))" strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="label" stroke="hsl(var(--muted-foreground))" fontSize={11} tickLine={false} />
              <YAxis yAxisId="left" stroke="hsl(var(--muted-foreground))" fontSize={11} tickLine={false} />
              <YAxis yAxisId="right" orientation="right" stroke="hsl(var(--muted-foreground))" fontSize={11} tickLine={false}
                tickFormatter={(v) => `R$${Number(v).toFixed(2)}`} />
              <Tooltip
                contentStyle={{ background: 'hsl(var(--popover))', border: '1px solid hsl(var(--border))', borderRadius: 8, fontSize: 12 }}
                formatter={(value: any, name: string) => {
                  if (name === 'Custo') return [`R$ ${Number(value).toFixed(4)}`, name];
                  return [Number(value).toLocaleString('pt-BR'), name];
                }}
              />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Bar yAxisId="left" dataKey="Mensagens" fill="hsl(var(--cyan))" radius={[4, 4, 0, 0]} isAnimationActive={false} />
              <Line yAxisId="right" type="monotone" dataKey="Custo" stroke="hsl(var(--amber))" strokeWidth={2} dot={false} isAnimationActive={false} />
              <Line yAxisId="left" type="monotone" dataKey="Erros" stroke="hsl(var(--rose))" strokeWidth={1.5} dot={false} isAnimationActive={false} />
            </ComposedChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  );
}
