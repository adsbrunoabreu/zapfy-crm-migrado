import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { TrendingUp, TrendingDown, Activity, AlertTriangle } from 'lucide-react';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip as RTooltip, Cell } from 'recharts';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import type { ChurnValidationReport } from '@/lib/churnValidation';

interface Props {
  churnRate: number;
  prevChurnRate: number;
  retentionRate: number;
  nrr: number;
  churnByMonth: { month: string; rate: number }[];
  validation?: ChurnValidationReport;
}

function churnColor(rate: number) {
  if (rate < 5) return 'text-[hsl(var(--emerald))]';
  if (rate < 10) return 'text-[hsl(var(--amber))]';
  return 'text-[hsl(var(--rose))]';
}
function churnBg(rate: number) {
  if (rate < 5) return 'hsl(var(--emerald))';
  if (rate < 10) return 'hsl(var(--amber))';
  return 'hsl(var(--rose))';
}

export function ChurnAnalysisCard({ churnRate, prevChurnRate, retentionRate, nrr, churnByMonth, validation }: Props) {
  const churnDelta = churnRate - prevChurnRate;
  const TrendIcon = churnDelta >= 0 ? TrendingUp : TrendingDown;

  const errors = validation?.issues.filter(i => i.severity === 'error').length ?? 0;
  const warns = validation?.issues.filter(i => i.severity === 'warn').length ?? 0;
  const showAlert = errors + warns > 0;
  const alertTone = errors > 0 ? 'text-[hsl(var(--rose))]' : 'text-[hsl(var(--amber))]';

  return (
    <Card className="animate-fade-in h-full w-full min-w-0 flex flex-col">
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <Activity className="w-4 h-4 text-muted-foreground" />
          Churn & Retenção
          {showAlert && validation && (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button type="button" className={cn('ml-auto inline-flex items-center gap-1 text-xs font-medium', alertTone)}>
                    <AlertTriangle className="w-3.5 h-3.5" />
                    {errors + warns} {errors + warns === 1 ? 'aviso' : 'avisos'}
                  </button>
                </TooltipTrigger>
                <TooltipContent side="left" className="max-w-xs">
                  <div className="space-y-1.5 text-xs">
                    <p className="font-semibold">Inconsistências detectadas</p>
                    {validation.issues.slice(0, 5).map((i, idx) => (
                      <p key={idx} className="text-muted-foreground">
                        <span className={cn(
                          'font-medium mr-1',
                          i.severity === 'error' ? 'text-[hsl(var(--rose))]' :
                          i.severity === 'warn' ? 'text-[hsl(var(--amber))]' : 'text-[hsl(var(--cyan))]'
                        )}>[{i.severity}]</span>
                        {i.message}
                      </p>
                    ))}
                    {validation.issues.length > 5 && (
                      <p className="text-muted-foreground italic">+ {validation.issues.length - 5} no console (DevTools).</p>
                    )}
                  </div>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-5 flex-1 min-w-0">
        <div className="grid grid-cols-3 gap-3">
          <div className="space-y-1 p-3 rounded-lg border border-border/60 bg-card/50">
            <p className="text-[11px] uppercase tracking-wide text-muted-foreground font-medium">Churn</p>
            <p className={cn('text-2xl font-bold tabular-nums', churnColor(churnRate))}>{churnRate.toFixed(1)}%</p>
            <div className={cn('flex items-center gap-1 text-xs font-medium',
              churnDelta > 0 ? 'text-[hsl(var(--rose))]' : churnDelta < 0 ? 'text-[hsl(var(--emerald))]' : 'text-muted-foreground')}>
              <TrendIcon className="w-3 h-3" />
              {churnDelta >= 0 ? '+' : ''}{churnDelta.toFixed(1)}pp
            </div>
          </div>
          <div className="space-y-1 p-3 rounded-lg border border-border/60 bg-card/50">
            <p className="text-[11px] uppercase tracking-wide text-muted-foreground font-medium">Retenção</p>
            <p className="text-2xl font-bold tabular-nums text-[hsl(var(--emerald))]">{retentionRate.toFixed(1)}%</p>
            <p className="text-xs text-muted-foreground">do período</p>
          </div>
          <div className="space-y-1 p-3 rounded-lg border border-border/60 bg-card/50">
            <p className="text-[11px] uppercase tracking-wide text-muted-foreground font-medium">NRR (12m)</p>
            <p className={cn('text-2xl font-bold tabular-nums',
              nrr >= 100 ? 'text-[hsl(var(--emerald))]' : 'text-[hsl(var(--rose))]')}>
              {nrr.toFixed(0)}%
            </p>
            <p className="text-xs text-muted-foreground">{nrr >= 100 ? 'Expansão' : 'Contração'}</p>
          </div>
        </div>
        <div>
          <p className="text-xs text-muted-foreground mb-2">Churn nos últimos 6 meses</p>
          <div className="h-32">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={churnByMonth} margin={{ top: 4, right: 8, bottom: 0, left: -16 }}>
                <XAxis dataKey="month" stroke="hsl(var(--muted-foreground))" fontSize={11} tickLine={false} axisLine={false} />
                <YAxis stroke="hsl(var(--muted-foreground))" fontSize={11} tickLine={false} axisLine={false} tickFormatter={v => `${v}%`} />
                <RTooltip
                  cursor={{ fill: 'hsl(var(--muted) / 0.4)' }}
                  contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 8, fontSize: 12 }}
                  formatter={(v: number) => [`${v.toFixed(1)}%`, 'Churn']}
                />
                <Bar dataKey="rate" radius={[4, 4, 0, 0]}>
                  {churnByMonth.map((d, i) => (
                    <Cell key={i} fill={churnBg(d.rate)} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
