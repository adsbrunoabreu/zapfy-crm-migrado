import { memo } from 'react';
import { Card } from '@/components/ui/card';
import { Users, TrendingUp, DollarSign, UserX } from 'lucide-react';
import { formatCurrency } from './constants';

interface Props {
  totalLeads: number;
  newLeads: number;
  totalValue: number;
  unassignedLeads: number;
}

export const LeadsSummaryCards = memo(function LeadsSummaryCards({ totalLeads, newLeads, totalValue, unassignedLeads }: Props) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-2 xl:grid-cols-4 gap-4">
      <Card className="glass-card p-4 flex items-center gap-4">
        <div className="h-11 w-11 rounded-xl bg-cyan/15 flex items-center justify-center shrink-0">
          <Users className="h-5 w-5 text-cyan" />
        </div>
        <div>
          <p className="text-sm text-muted-foreground">Total de Contatos</p>
          <p className="text-2xl font-bold">{totalLeads}</p>
        </div>
      </Card>
      <Card className="glass-card p-4 flex items-center gap-4">
        <div className="h-11 w-11 rounded-xl bg-emerald/15 flex items-center justify-center shrink-0">
          <TrendingUp className="h-5 w-5 text-emerald" />
        </div>
        <div>
          <p className="text-sm text-muted-foreground">Contatos Novos</p>
          <p className="text-2xl font-bold">{newLeads}</p>
        </div>
      </Card>
      <Card className="glass-card p-4 flex items-center gap-4">
        <div className="h-11 w-11 rounded-xl bg-amber/15 flex items-center justify-center shrink-0">
          <DollarSign className="h-5 w-5 text-amber" />
        </div>
        <div>
          <p className="text-sm text-muted-foreground">Valor Total</p>
          <p className="text-2xl font-bold">{formatCurrency(totalValue)}</p>
        </div>
      </Card>
      <Card className="glass-card p-4 flex items-center gap-4">
        <div className="h-11 w-11 rounded-xl bg-rose/15 flex items-center justify-center shrink-0">
          <UserX className="h-5 w-5 text-rose" />
        </div>
        <div>
          <p className="text-sm text-muted-foreground">Sem Responsável</p>
          <p className="text-2xl font-bold">{unassignedLeads}</p>
        </div>
      </Card>
    </div>
  );
});
