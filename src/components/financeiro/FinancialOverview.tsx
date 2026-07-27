import { Card } from '@/components/ui/card';
import { useFinancialOverview } from '@/hooks/finance/useFinancial';
import { formatBRL } from '@/lib/finance';
import { TrendingUp, TrendingDown, Loader2, Wallet, ArrowDownCircle, ArrowUpCircle, Scale } from 'lucide-react';

export function FinancialOverview() {
  const { data, isLoading } = useFinancialOverview();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const l = data?.leads;
  const e = data?.entries;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-sm font-medium text-muted-foreground mb-3">Fichas (Pipeline)</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <Kpi
            label="Valor Total"
            value={formatBRL(l?.total_value)}
            sub={`${l?.count_total ?? 0} fichas`}
            icon={<Wallet className="w-4 h-4" />}
            tone="default"
          />
          <Kpi
            label="Realizado (Ganho)"
            value={formatBRL(l?.won_value)}
            sub={`${l?.count_won ?? 0} fichas`}
            icon={<TrendingUp className="w-4 h-4" />}
            tone="success"
          />
          <Kpi
            label="Perdido"
            value={formatBRL(l?.lost_value)}
            sub={`${l?.count_lost ?? 0} fichas`}
            icon={<TrendingDown className="w-4 h-4" />}
            tone="danger"
          />
          <Kpi
            label="Negociando"
            value={formatBRL(l?.open_value)}
            sub={`${l?.count_open ?? 0} fichas`}
            icon={<Scale className="w-4 h-4" />}
            tone="info"
          />
        </div>
      </div>

      <div>
        <h2 className="text-sm font-medium text-muted-foreground mb-3">Caixa</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <Kpi
            label="A Receber"
            value={formatBRL(e?.receivable_pending)}
            icon={<ArrowDownCircle className="w-4 h-4" />}
            tone="info"
          />
          <Kpi
            label="Recebido"
            value={formatBRL(e?.receivable_paid)}
            icon={<ArrowDownCircle className="w-4 h-4" />}
            tone="success"
          />
          <Kpi
            label="A Pagar"
            value={formatBRL(e?.payable_pending)}
            icon={<ArrowUpCircle className="w-4 h-4" />}
            tone="warning"
          />
          <Kpi
            label="Saldo Líquido"
            value={formatBRL(e?.net_balance)}
            sub="recebido − pago"
            icon={<Scale className="w-4 h-4" />}
            tone={Number(e?.net_balance ?? 0) >= 0 ? 'success' : 'danger'}
          />
        </div>
      </div>
    </div>
  );
}

function Kpi({ label, value, sub, icon, tone }: {
  label: string;
  value: string;
  sub?: string;
  icon: React.ReactNode;
  tone: 'default' | 'success' | 'danger' | 'info' | 'warning';
}) {
  const toneClass = {
    default: 'text-foreground',
    success: 'text-emerald',
    danger: 'text-rose',
    info: 'text-cyan',
    warning: 'text-amber',
  }[tone];
  return (
    <Card className="p-4">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs text-muted-foreground">{label}</span>
        <span className={toneClass}>{icon}</span>
      </div>
      <div className={`text-2xl font-semibold tabular-nums ${toneClass}`}>{value}</div>
      {sub && <div className="text-xs text-muted-foreground mt-1">{sub}</div>}
    </Card>
  );
}
