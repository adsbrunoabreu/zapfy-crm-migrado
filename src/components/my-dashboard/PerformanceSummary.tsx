import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { TrendingUp, CheckCircle2, Clock, XCircle, ArrowUpRight, ArrowDownRight, Minus } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';

interface PerformanceSummaryProps {
  wonCount: number;
  inProgress: number;
  lostCount: number;
  prevWonCount?: number;
  prevTotal?: number;
  total?: number;
  totalValue?: number;
  prevTotalValue?: number;
}

function calcChange(current: number, previous: number) {
  if (previous === 0) return current > 0 ? 100 : 0;
  return ((current - previous) / previous) * 100;
}

function ChangeIndicator({ current, previous }: { current: number; previous: number }) {
  const change = calcChange(current, previous);
  if (change === 0) return <Minus className="w-3.5 h-3.5 text-muted-foreground" />;
  const isPositive = change > 0;
  const Icon = isPositive ? ArrowUpRight : ArrowDownRight;
  return (
    <span className={`flex items-center gap-0.5 text-xs font-medium ${isPositive ? 'text-emerald' : 'text-rose'}`}>
      <Icon className="w-3.5 h-3.5" />
      {Math.abs(change).toFixed(0)}%
    </span>
  );
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 0 }).format(value);
}

export function PerformanceSummary({
  wonCount,
  inProgress,
  lostCount,
  prevWonCount = 0,
  prevTotal = 0,
  total = 0,
  totalValue = 0,
  prevTotalValue = 0,
}: PerformanceSummaryProps) {
  const prevInProgress = Math.max(prevTotal - prevWonCount - Math.round(prevTotal * (lostCount / Math.max(total, 1))), 0);
  const prevLost = Math.max(prevTotal - prevWonCount - prevInProgress, 0);

  const chartData = [
    { name: 'Fechados', atual: wonCount, anterior: prevWonCount },
    { name: 'Andamento', atual: inProgress, anterior: prevInProgress },
    { name: 'Perdidos', atual: lostCount, anterior: prevLost },
  ];

  const items = [
    {
      label: 'Leads Fechados',
      value: wonCount,
      prev: prevWonCount,
      icon: CheckCircle2,
      colorClass: 'text-emerald',
      bgClass: 'bg-emerald/10',
      borderClass: 'border-emerald/20',
    },
    {
      label: 'Em Andamento',
      value: inProgress,
      prev: prevInProgress,
      icon: Clock,
      colorClass: 'text-amber',
      bgClass: 'bg-amber/10',
      borderClass: 'border-amber/20',
    },
    {
      label: 'Perdidos',
      value: lostCount,
      prev: prevLost,
      icon: XCircle,
      colorClass: 'text-rose',
      bgClass: 'bg-rose/10',
      borderClass: 'border-rose/20',
    },
  ];

  const conversionRate = total > 0 ? ((wonCount / total) * 100).toFixed(1) : '0';
  const prevConversionRate = prevTotal > 0 ? ((prevWonCount / prevTotal) * 100).toFixed(1) : '0';

  return (
    <Card className="glass-card">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <TrendingUp className="w-5 h-5 text-primary" />
          Resumo de Performance
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* KPI Cards */}
        <div className="grid grid-cols-3 gap-3">
          {items.map((item) => (
            <div
              key={item.label}
              className={`p-3 rounded-xl ${item.bgClass} border ${item.borderClass} text-center`}
            >
              <item.icon className={`w-5 h-5 mx-auto mb-1 ${item.colorClass}`} />
              <p className={`text-2xl font-bold ${item.colorClass}`}>{item.value}</p>
              <p className="text-xs text-muted-foreground mt-0.5">{item.label}</p>
              <div className="mt-1 flex justify-center">
                <ChangeIndicator current={item.value} previous={item.prev} />
              </div>
            </div>
          ))}
        </div>

        {/* Conversion + Value summary */}
        <div className="grid grid-cols-2 gap-3">
          <div className="p-3 rounded-xl bg-primary/10 border border-primary/20 text-center">
            <p className="text-2xl font-bold text-primary">{conversionRate}%</p>
            <p className="text-xs text-muted-foreground">Taxa de Conversão</p>
            <div className="mt-1 flex justify-center">
              <ChangeIndicator current={parseFloat(conversionRate)} previous={parseFloat(prevConversionRate)} />
            </div>
          </div>
          <div className="p-3 rounded-xl bg-secondary/50 border border-border/50 text-center">
            <p className="text-2xl font-bold">{formatCurrency(totalValue)}</p>
            <p className="text-xs text-muted-foreground">Valor Total</p>
            <div className="mt-1 flex justify-center">
              <ChangeIndicator current={totalValue} previous={prevTotalValue} />
            </div>
          </div>
        </div>

        {/* Bar Chart */}
        <div>
          <p className="text-sm font-medium text-muted-foreground mb-3">Atual vs Período Anterior</p>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={chartData} barGap={4}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis dataKey="name" tick={{ fontSize: 12, fill: 'hsl(var(--muted-foreground))' }} />
              <YAxis allowDecimals={false} tick={{ fontSize: 12, fill: 'hsl(var(--muted-foreground))' }} />
              <Tooltip
                contentStyle={{
                  background: 'hsl(var(--card))',
                  border: '1px solid hsl(var(--border))',
                  borderRadius: '8px',
                  fontSize: '12px',
                }}
              />
              <Legend wrapperStyle={{ fontSize: '12px' }} />
              <Bar dataKey="atual" name="Atual" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
              <Bar dataKey="anterior" name="Anterior" fill="hsl(var(--muted-foreground) / 0.3)" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}
