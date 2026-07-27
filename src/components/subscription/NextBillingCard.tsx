import { Card } from '@/components/ui/card';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Subscription } from '@/hooks/useSubscriptions';
import { format, differenceInCalendarDays } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Calendar, RefreshCw, AlertTriangle, CalendarClock, Info } from 'lucide-react';

interface Props {
  subscription: Subscription | null;
  pendingPlanName?: string | null;
  loading?: boolean;
}

const formatBRL = (n: number) =>
  n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

export function NextBillingCard({ subscription, pendingPlanName, loading }: Props) {
  if (loading) return <Card className="glass-card p-6 animate-pulse h-40" />;
  if (!subscription) return null;

  const monthly = Number(subscription.monthly_price) || 0;
  const amount = subscription.billing_cycle === 'yearly' ? monthly * 12 : monthly;
  const endDate = subscription.current_period_end
    ? new Date(subscription.current_period_end)
    : null;
  const startDate = subscription.current_period_start
    ? new Date(subscription.current_period_start)
    : null;
  const cancelAtEnd = (subscription as any).cancel_at_period_end;

  let cycleInfo: {
    start: Date;
    end: Date;
    total: number;
    elapsed: number;
    remaining: number;
    pct: number;
    urgent: boolean;
    ending: boolean;
  } | null = null;
  if (startDate && endDate) {
    const now = new Date();
    const total = Math.max(1, differenceInCalendarDays(endDate, startDate));
    const elapsed = Math.min(total, Math.max(0, differenceInCalendarDays(now, startDate)));
    const remaining = Math.max(0, differenceInCalendarDays(endDate, now));
    const pct = Math.min(100, Math.max(0, (elapsed / total) * 100));
    cycleInfo = { start: startDate, end: endDate, total, elapsed, remaining, pct, urgent: remaining <= 3, ending: remaining <= 7 };
  }

  return (
    <Card className="glass-card p-6">
      <div className="flex items-center gap-2 text-muted-foreground text-xs uppercase tracking-wider">
        <Calendar className="w-3.5 h-3.5" />
        Próxima cobrança
      </div>

      {cancelAtEnd ? (
        <>
          <h2 className="text-2xl font-bold tracking-tight mt-1 text-rose">Sem renovação</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Acesso até {endDate ? format(endDate, "dd 'de' MMMM 'de' yyyy", { locale: ptBR }) : '—'}
          </p>
          <div className="mt-4 flex items-start gap-2 rounded-lg border border-rose/30 bg-rose/10 p-3 text-xs">
            <AlertTriangle className="w-4 h-4 text-rose shrink-0 mt-0.5" />
            <span>Sua assinatura foi marcada para cancelamento ao fim do período.</span>
          </div>
        </>
      ) : (
        <>
          <h2 className="text-2xl font-bold tracking-tight mt-1">{formatBRL(amount)}</h2>
          <p className="text-sm text-muted-foreground mt-1">
            {endDate ? `em ${format(endDate, "dd/MM/yyyy", { locale: ptBR })}` : 'Sem data definida'}
          </p>
          <div className="mt-4 flex items-center gap-2 text-xs text-muted-foreground">
            <RefreshCw className="w-3.5 h-3.5 text-emerald" />
            Renovação automática ativa
          </div>
          {pendingPlanName && (
            <div className="mt-3 rounded-lg border border-amber/30 bg-amber/10 p-3 text-xs">
              Mudança agendada para <strong>{pendingPlanName}</strong> ao fim do período.
            </div>
          )}
        </>
      )}

      {cycleInfo && (() => {
        const { start, end, total, elapsed, remaining, pct, urgent, ending } = cycleInfo;
        const barColor = urgent ? 'bg-rose-500' : ending ? 'bg-amber-400' : 'bg-primary';
        const remainingColor = urgent ? 'text-rose-400' : ending ? 'text-amber-400' : 'text-muted-foreground';
        return (
          <div className="mt-5 pt-4 border-t border-border/60 space-y-2">
            {urgent && (
              <div
                role="alert"
                className={`flex items-start gap-2.5 rounded-lg border px-3 py-2.5 ${
                  cancelAtEnd
                    ? 'border-rose-500/40 bg-rose-500/10 text-rose-200'
                    : 'border-amber-500/40 bg-amber-500/10 text-amber-200'
                } animate-pulse`}
              >
                <AlertTriangle className={`w-4 h-4 mt-0.5 shrink-0 ${cancelAtEnd ? 'text-rose-400' : 'text-amber-400'}`} />
                <div className="text-xs leading-relaxed">
                  <p className="font-semibold">
                    {remaining === 0
                      ? (cancelAtEnd ? 'Sua assinatura termina hoje' : 'Renovação hoje')
                      : (cancelAtEnd
                          ? `Sua assinatura termina em ${remaining} ${remaining === 1 ? 'dia' : 'dias'}`
                          : `Renovação em ${remaining} ${remaining === 1 ? 'dia' : 'dias'}`)}
                  </p>
                  <p className="opacity-80 mt-0.5">
                    {cancelAtEnd
                      ? `Reative antes de ${format(end, "dd 'de' MMMM", { locale: ptBR })} para evitar a interrupção do acesso.`
                      : `A cobrança será feita em ${format(end, "dd 'de' MMMM", { locale: ptBR })}. Garanta que seu método de pagamento esteja atualizado.`}
                  </p>
                </div>
              </div>
            )}
            <div className="flex items-center justify-between text-xs">
              <div className="flex items-center gap-1.5 text-muted-foreground">
                <CalendarClock className="w-3.5 h-3.5" />
                Período atual
              </div>
              <span className={`${remainingColor} ${urgent || ending ? 'font-medium' : ''}`}>
                {remaining === 0 ? 'Termina hoje' : `${remaining} ${remaining === 1 ? 'dia restante' : 'dias restantes'}`}
              </span>
            </div>
            <TooltipProvider delayDuration={150}>
              <div className="flex items-center gap-2">
                <div className="flex-1 h-1.5 rounded-full bg-muted/40 overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all ${barColor}`}
                    style={{ width: `${pct}%` }}
                  />
                </div>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      type="button"
                      aria-label="Detalhes do ciclo do plano"
                      className="text-muted-foreground hover:text-foreground transition-colors"
                    >
                      <Info className="w-3.5 h-3.5" />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="left" className="text-xs">
                    <div className="space-y-1">
                      <div className="flex justify-between gap-4">
                        <span className="text-muted-foreground">Início:</span>
                        <span className="font-medium">{format(start, "dd/MM/yyyy", { locale: ptBR })}</span>
                      </div>
                      <div className="flex justify-between gap-4">
                        <span className="text-muted-foreground">Fim:</span>
                        <span className="font-medium">{format(end, "dd/MM/yyyy", { locale: ptBR })}</span>
                      </div>
                      <div className="flex justify-between gap-4 pt-1 border-t border-border/60">
                        <span className="text-muted-foreground">Concluído:</span>
                        <span className="font-medium">{pct.toFixed(1)}%</span>
                      </div>
                    </div>
                  </TooltipContent>
                </Tooltip>
              </div>
            </TooltipProvider>
            <div className="flex items-center justify-between text-[11px] text-muted-foreground">
              <span>{format(start, "dd 'de' MMM", { locale: ptBR })}</span>
              <span>{elapsed} de {total} dias</span>
              <span>{format(end, "dd 'de' MMM yyyy", { locale: ptBR })}</span>
            </div>
          </div>
        );
      })()}
    </Card>
  );
}
