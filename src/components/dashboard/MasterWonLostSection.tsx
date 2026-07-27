import { Trophy, XCircle, Target, Building2 } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { StatCard } from './StatCard';
import { InfoHint } from './InfoHint';
import { formatBRL } from '@/lib/format';
import type { MasterWonLostData } from '@/hooks/useMasterWonLostData';

interface Props {
  data: MasterWonLostData;
  periodLabel: string;
}

export function MasterWonLostSection({ data, periodLabel }: Props) {
  const { global, top_loss_reasons, companies } = data;
  const topReasons = top_loss_reasons.slice(0, 6);

  return (
    <section className="space-y-4 pt-4 border-t border-border">
      <div className="flex items-center gap-2">
        <div className="w-8 h-8 rounded-lg bg-[hsl(var(--emerald))]/15 flex items-center justify-center">
          <Trophy className="w-4 h-4 text-[hsl(var(--emerald))]" />
        </div>
        <div>
          <h2 className="text-lg font-semibold">Ganho vs Perda</h2>
          <p className="text-xs text-muted-foreground">
            Fechamentos da plataforma · {periodLabel}
          </p>
        </div>
      </div>

      {/* KPIs globais */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard
          label="Leads Ganhos"
          value={global.won_count.toLocaleString('pt-BR')}
          rawValue={global.won_count}
          countUp
          current={global.won_count} previous={0}
          icon={Trophy}
          iconColor="text-[hsl(var(--emerald))]"
          iconBg="bg-[hsl(var(--emerald))]/15"
          hint={{
            title: 'Leads Ganhos (plataforma)',
            definition: 'Leads marcados como ganho com closed_at no período, somando todas as empresas.',
            formula: 'COUNT(leads WHERE status=won AND closed_at BETWEEN período)',
          }}
        />
        <StatCard
          label="Leads Perdidos"
          value={global.lost_count.toLocaleString('pt-BR')}
          rawValue={global.lost_count}
          countUp
          current={global.lost_count} previous={0}
          invertDelta
          icon={XCircle}
          iconColor="text-destructive"
          iconBg="bg-destructive/15"
          hint={{
            title: 'Leads Perdidos (plataforma)',
            definition: 'Leads marcados como perdido com closed_at no período, somando todas as empresas.',
            formula: 'COUNT(leads WHERE status=lost AND closed_at BETWEEN período)',
          }}
        />
        <StatCard
          label="Win Rate"
          value={`${global.win_rate.toFixed(1)}%`}
          current={global.win_rate} previous={0}
          icon={Target}
          iconColor="text-[hsl(var(--emerald))]"
          iconBg="bg-[hsl(var(--emerald))]/15"
          hint={{
            title: 'Win Rate global',
            definition: 'Proporção de fechamentos que terminaram como ganho.',
            formula: 'Win Rate = ganhos / (ganhos + perdidos)',
          }}
        />
        <StatCard
          label="Loss Rate"
          value={`${global.loss_rate.toFixed(1)}%`}
          current={global.loss_rate} previous={0}
          invertDelta
          icon={XCircle}
          iconColor="text-destructive"
          iconBg="bg-destructive/15"
          hint={{
            title: 'Loss Rate global',
            definition: 'Proporção de fechamentos que terminaram como perdido.',
            formula: 'Loss Rate = perdidos / (ganhos + perdidos)',
          }}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-stretch">
        {/* Top motivos de perda (globais) */}
        <Card className="p-4 lg:p-5 flex flex-col">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h3 className="text-base font-semibold inline-flex items-center gap-1.5">
                Principais motivos de perda
                <InfoHint
                  title="Top motivos de perda"
                  definition="Distribuição dos motivos registrados nos leads marcados como perdido em todas as empresas."
                  formula="COUNT(leads) por loss_reason_id (ou texto livre)"
                />
              </h3>
              <p className="text-xs text-muted-foreground mt-0.5">
                {global.lost_count.toLocaleString('pt-BR')} leads perdidos · {formatBRL(global.lost_revenue)} em pipeline
              </p>
            </div>
          </div>
          {topReasons.length === 0 ? (
            <div className="flex-1 flex items-center justify-center text-sm text-muted-foreground py-8">
              Nenhum motivo de perda registrado no período.
            </div>
          ) : (
            <div className="space-y-3">
              {topReasons.map((r) => (
                <div key={r.label} className="space-y-1">
                  <div className="flex items-center justify-between text-sm">
                    <span className="font-medium truncate pr-2">{r.label}</span>
                    <span className="text-xs text-muted-foreground tabular-nums">
                      {r.count} · {r.percentage.toFixed(1)}%
                    </span>
                  </div>
                  <Progress value={r.percentage} className="h-1.5" />
                  {r.total_value > 0 && (
                    <p className="text-[11px] text-muted-foreground">
                      {formatBRL(r.total_value)} em valor perdido
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}
        </Card>

        {/* Tabela por empresa */}
        <Card className="p-4 lg:p-5 flex flex-col">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h3 className="text-base font-semibold inline-flex items-center gap-1.5">
                <Building2 className="w-4 h-4 text-muted-foreground" />
                Empresas com fechamentos
                <InfoHint
                  title="Empresas com fechamentos"
                  definition="Ranking de empresas pelo total de fechamentos (ganhos + perdidos) no período."
                  note="Exibe as 10 maiores por volume de fechamentos."
                />
              </h3>
              <p className="text-xs text-muted-foreground mt-0.5">
                {global.companies_with_closings} empresas com leads fechados
              </p>
            </div>
          </div>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Empresa</TableHead>
                  <TableHead className="text-right">Ganhos</TableHead>
                  <TableHead className="text-right">Perdidos</TableHead>
                  <TableHead className="text-right">Win rate</TableHead>
                  <TableHead>Top motivos</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {companies.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center text-sm text-muted-foreground py-6">
                      Nenhum fechamento no período.
                    </TableCell>
                  </TableRow>
                ) : (
                  companies.slice(0, 10).map((c) => (
                    <TableRow key={c.company_id}>
                      <TableCell className="font-medium">{c.company_name}</TableCell>
                      <TableCell className="text-right tabular-nums text-[hsl(var(--emerald))]">
                        {c.won_count}
                      </TableCell>
                      <TableCell className="text-right tabular-nums text-destructive">
                        {c.lost_count}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {c.win_rate.toFixed(1)}%
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1">
                          {c.top_loss_reasons.length === 0 ? (
                            <span className="text-xs text-muted-foreground">—</span>
                          ) : (
                            c.top_loss_reasons.map((r, i) => (
                              <Badge key={`${r.label}-${i}`} variant="outline" className="text-[10px]">
                                {r.label} · {r.count}
                              </Badge>
                            ))
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </Card>
      </div>
    </section>
  );
}
