import { Card } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid } from 'recharts';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { formatBRL } from '@/lib/format';
import { cn } from '@/lib/utils';
import type { PipelineByUser } from '@/hooks/usePipelinePerformance';

interface Props { rows: PipelineByUser[] }

function formatHours(h: number | null | undefined): string {
  if (h == null || h < 0.01) return '—';
  if (h < 1) return `${Math.round(h * 60)}min`;
  if (h < 48) return `${h.toFixed(1)}h`;
  return `${(h / 24).toFixed(1)}d`;
}

export function TeamTab({ rows }: Props) {
  if (rows.length === 0) {
    return <Card className="p-6"><EmptyState title="Nenhum responsável com leads no período" /></Card>;
  }

  const closedTotal = rows.reduce((s, r) => s + r.won + r.lost, 0);
  const wonTotal = rows.reduce((s, r) => s + r.won, 0);
  const avgWinRate = closedTotal > 0 ? (wonTotal / closedTotal) * 100 : 0;

  const top10 = [...rows].slice(0, 10).map((r) => ({ name: r.name.split(' ')[0], Receita: Number(r.revenue) }));

  return (
    <div className="space-y-4">
      <Card className="p-5">
        <h3 className="text-sm font-medium mb-4">Top 10 por receita ganha</h3>
        <div className="h-[260px]">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={top10} layout="vertical" margin={{ left: 8 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis type="number" stroke="hsl(var(--muted-foreground))" fontSize={11} tickFormatter={(v) => formatBRL(Number(v))} />
              <YAxis type="category" dataKey="name" stroke="hsl(var(--muted-foreground))" fontSize={11} width={100} />
              <Tooltip
                formatter={(v: number) => formatBRL(v)}
                contentStyle={{ background: 'hsl(var(--popover))', border: '1px solid hsl(var(--border))', borderRadius: 8, fontSize: 12 }}
              />
              <Bar dataKey="Receita" fill="hsl(var(--violet))" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Card>

      <Card className="p-5">
        <h3 className="text-sm font-medium mb-4">Performance por responsável</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left border-b border-border text-xs uppercase text-muted-foreground">
                <th className="py-2 font-medium">Responsável</th>
                <th className="py-2 font-medium tabular-nums text-right">Leads</th>
                <th className="py-2 font-medium tabular-nums text-right">Ganhos</th>
                <th className="py-2 font-medium tabular-nums text-right">Perdidos</th>
                <th className="py-2 font-medium tabular-nums text-right">Win rate</th>
                <th className="py-2 font-medium tabular-nums text-right">Ticket médio</th>
                <th className="py-2 font-medium tabular-nums text-right">Tempo resposta</th>
                <th className="py-2 font-medium tabular-nums text-right">Receita</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const closed = r.won + r.lost;
                const winRate = closed > 0 ? (r.won / closed) * 100 : 0;
                const winColor =
                  closed === 0 ? 'text-muted-foreground'
                    : winRate >= avgWinRate ? 'text-emerald'
                    : winRate >= avgWinRate * 0.7 ? 'text-amber'
                    : 'text-destructive';
                return (
                  <tr key={r.user_id} className="border-b border-border/50 last:border-0">
                    <td className="py-2.5">
                      <div className="flex items-center gap-2">
                        <Avatar className="h-6 w-6">
                          <AvatarImage src={r.avatar_url ?? undefined} />
                          <AvatarFallback className="text-[10px]">{r.name.slice(0, 2).toUpperCase()}</AvatarFallback>
                        </Avatar>
                        <span className="truncate">{r.name}</span>
                      </div>
                    </td>
                    <td className="py-2.5 text-right tabular-nums">{r.leads}</td>
                    <td className="py-2.5 text-right tabular-nums text-emerald">{r.won}</td>
                    <td className="py-2.5 text-right tabular-nums text-destructive">{r.lost}</td>
                    <td className={cn('py-2.5 text-right tabular-nums font-medium', winColor)}>
                      {closed === 0 ? '—' : `${Math.round(winRate)}%`}
                    </td>
                    <td className="py-2.5 text-right tabular-nums text-muted-foreground">{r.avg_ticket ? formatBRL(r.avg_ticket) : '—'}</td>
                    <td className="py-2.5 text-right tabular-nums text-muted-foreground">{formatHours(r.avg_response_hours)}</td>
                    <td className="py-2.5 text-right tabular-nums">{formatBRL(r.revenue)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
