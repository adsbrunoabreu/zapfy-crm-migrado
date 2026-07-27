import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip as RTooltip, CartesianGrid } from 'recharts';
import type { MrrPoint } from '@/hooks/useMasterDashboardData';
import { InfoHint } from './InfoHint';

function formatBRL(v: number) {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

export function MrrProgressionChart({ data, target }: { data: MrrPoint[]; target?: number }) {
  return (
    <Card className="animate-fade-in h-full w-full min-w-0 flex flex-col">
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-1.5">
          Progressão do MRR
          <InfoHint
            title="Progressão do MRR"
            definition="Evolução da Receita Recorrente Mensal ao longo do período. Cada ponto representa o MRR no fim do bucket (dia ou mês)."
            formula="MRR = Σ valor mensal das assinaturas ativas no fim do bucket"
            note="Planos anuais são divididos por 12."
          />
        </CardTitle>
      </CardHeader>
      <CardContent className="flex-1 min-h-[18rem] min-w-0">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 8, right: 12, bottom: 0, left: -8 }}>
            <defs>
              <linearGradient id="mrrAreaGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity={0.45} />
                <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
            <XAxis dataKey="label" stroke="hsl(var(--muted-foreground))" fontSize={11} tickLine={false} axisLine={false} />
            <YAxis stroke="hsl(var(--muted-foreground))" fontSize={11} tickLine={false} axisLine={false}
              tickFormatter={v => v >= 1000 ? `R$${(v/1000).toFixed(0)}k` : `R$${v}`} />
            <RTooltip
              contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 8, fontSize: 12 }}
              formatter={(v: number) => [formatBRL(v), 'MRR']}
            />
            <Area type="monotone" dataKey="mrr" stroke="hsl(var(--primary))" strokeWidth={2}
              fill="url(#mrrAreaGrad)" animationDuration={600} />
          </AreaChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}
