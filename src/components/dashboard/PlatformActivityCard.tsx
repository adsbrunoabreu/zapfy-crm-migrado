import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Activity, Users, MessageSquare, Gauge } from 'lucide-react';
import { TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { cn } from '@/lib/utils';

interface Props {
  totalLeads: number;
  prevTotalLeads: number;
  messagesPeriod: number;
  prevMessagesPeriod: number;
  activeCompaniesUsing: number;
  totalCompanies: number;
  utilizationRate: number;
  periodLabel: string;
}

function delta(curr: number, prev: number) {
  if (prev === 0 && curr === 0) return { txt: '—', cls: 'text-muted-foreground', Icon: Minus };
  if (prev === 0) return { txt: 'Novo', cls: 'text-[hsl(var(--emerald))]', Icon: TrendingUp };
  const pct = ((curr - prev) / Math.abs(prev)) * 100;
  const Icon = pct > 0.5 ? TrendingUp : pct < -0.5 ? TrendingDown : Minus;
  const cls = pct > 0.5 ? 'text-[hsl(var(--emerald))]' : pct < -0.5 ? 'text-[hsl(var(--rose))]' : 'text-muted-foreground';
  return { txt: `${pct >= 0 ? '+' : ''}${pct.toFixed(1)}%`, cls, Icon };
}

function Row({ icon: Icon, label, value, deltaTxt, deltaCls, DeltaIcon }: any) {
  return (
    <div className="flex items-center justify-between py-2.5 border-b border-border/60 last:border-0">
      <div className="flex items-center gap-2.5 min-w-0">
        <div className="w-8 h-8 rounded-md bg-secondary flex items-center justify-center shrink-0">
          <Icon className="w-4 h-4 text-muted-foreground" />
        </div>
        <span className="text-sm text-muted-foreground truncate">{label}</span>
      </div>
      <div className="flex items-center gap-3 shrink-0">
        <span className="text-sm font-semibold tabular-nums">{value}</span>
        {deltaTxt && (
          <div className={cn('flex items-center gap-0.5 text-xs font-medium w-16 justify-end', deltaCls)}>
            <DeltaIcon className="w-3 h-3" />
            {deltaTxt}
          </div>
        )}
      </div>
    </div>
  );
}

export function PlatformActivityCard(props: Props) {
  const leadsD = delta(props.totalLeads, props.prevTotalLeads);
  const msgD = delta(props.messagesPeriod, props.prevMessagesPeriod);

  return (
    <Card className="animate-fade-in">
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <Activity className="w-4 h-4 text-muted-foreground" />
          Atividade da plataforma
        </CardTitle>
        <p className="text-xs text-muted-foreground">{props.periodLabel}</p>
      </CardHeader>
      <CardContent className="space-y-0">
        <Row icon={Users} label="Leads criados" value={props.totalLeads.toLocaleString('pt-BR')} deltaTxt={leadsD.txt} deltaCls={leadsD.cls} DeltaIcon={leadsD.Icon} />
        <Row icon={MessageSquare} label="Mensagens enviadas" value={props.messagesPeriod.toLocaleString('pt-BR')} deltaTxt={msgD.txt} deltaCls={msgD.cls} DeltaIcon={msgD.Icon} />
        <Row icon={Activity} label="Empresas com atividade" value={`${props.activeCompaniesUsing} / ${props.totalCompanies}`} />
        <Row icon={Gauge} label="Taxa de utilização" value={`${props.utilizationRate.toFixed(0)}%`} />
      </CardContent>
    </Card>
  );
}
