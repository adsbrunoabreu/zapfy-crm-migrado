import { Link } from 'react-router-dom';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { AlertCircle, ArrowRight } from 'lucide-react';
import { usePendingReceivables } from '@/hooks/finance/usePendingReceivables';
import { formatBRL } from '@/lib/finance';

/**
 * Alerta no topo do painel financeiro quando há contas a receber pendentes
 * (fichas marcadas como Ganho sem confirmação de pagamento).
 */
export function PendingReceivablesAlert() {
  const { data, isLoading } = usePendingReceivables();
  if (isLoading || !data || data.pending_count === 0) return null;

  return (
    <Card className="p-4 border-amber/40 bg-amber/5">
      <div className="flex items-start gap-3">
        <div className="rounded-full p-2 bg-amber/15 text-amber shrink-0">
          <AlertCircle className="w-4 h-4" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-foreground">
            {data.pending_count === 1
              ? '1 orçamento aguardando confirmação de pagamento'
              : `${data.pending_count} orçamentos aguardando confirmação de pagamento`}
          </p>
          <p className="text-xs text-muted-foreground mt-0.5">
            Total em aberto:{' '}
            <span className="font-medium text-foreground tabular-nums">
              {formatBRL(data.pending_value)}
            </span>{' '}
            — fichas marcadas como Ganho que ainda não viraram caixa.
          </p>
        </div>
        <Button asChild size="sm" variant="outline" className="shrink-0 border-amber/40 hover:bg-amber/10">
          <Link to="/financeiro?tab=receivables" className="gap-1.5">
            Revisar
            <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </Button>
      </div>
    </Card>
  );
}
