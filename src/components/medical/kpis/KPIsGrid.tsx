import { Skeleton } from '@/components/ui/skeleton';
import { StatCard } from '@/components/dashboard/StatCard';
import {
  DollarSign,
  Banknote,
  CalendarCheck,
  Calendar,
  UserX,
  UserCheck,
  UserPlus,
  Activity,
} from 'lucide-react';
import { formatBRL } from '@/lib/format';
import type { MedicalKPIsExtended } from '@/hooks/medical/useMedicalKPIs';

interface KPIsGridProps {
  kpis?: MedicalKPIsExtended;
  isLoading?: boolean;
}

export function KPIsGrid({ kpis, isLoading }: KPIsGridProps) {
  if (isLoading || !kpis) {
    return (
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">

        {Array.from({ length: 8 }).map((_, i) => (
          <Skeleton key={i} className="h-[112px] rounded-lg" />
        ))}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
      <StatCard
        label="Receita Realizada"
        value={formatBRL(kpis.revenue.current, { fraction: true })}
        current={kpis.revenue.current}
        previous={kpis.revenue.previous}
        icon={DollarSign}
        iconColor="text-[hsl(var(--emerald))]"
        iconBg="bg-[hsl(var(--emerald))]/10"
        hint={{
          title: 'Receita Realizada',
          definition: 'Soma dos pagamentos recebidos da clínica no período selecionado.',
          formula: 'Σ medical_payments WHERE status = received',
          note: `Hoje: ${formatBRL(kpis.daily_revenue, { fraction: true })}`,
        }}
      />

      <StatCard
        label="Ticket Médio"
        value={formatBRL(kpis.avg_ticket.current, { fraction: true })}
        current={kpis.avg_ticket.current}
        previous={kpis.avg_ticket.previous}
        icon={Banknote}
        iconColor="text-[hsl(var(--emerald))]"
        iconBg="bg-[hsl(var(--emerald))]/10"
        hint={{
          title: 'Ticket Médio',
          definition: 'Valor médio recebido por consulta concluída no período.',
          formula: 'receita / consultas_concluídas',
        }}
      />

      <StatCard
        label="Consultas Concluídas"
        value={kpis.completed_appointments.current.toLocaleString('pt-BR')}
        rawValue={kpis.completed_appointments.current}
        countUp
        current={kpis.completed_appointments.current}
        previous={kpis.completed_appointments.previous}
        icon={CalendarCheck}
        iconColor="text-primary"
        iconBg="bg-primary/10"
        hint={{
          title: 'Consultas Concluídas',
          definition: 'Consultas marcadas como realizadas (status = completed) no período.',
          formula: 'COUNT(medical_appointments WHERE status = completed)',
        }}
      />

      <StatCard
        label="Consultas Agendadas"
        value={kpis.total_appointments.current.toLocaleString('pt-BR')}
        rawValue={kpis.total_appointments.current}
        countUp
        current={kpis.total_appointments.current}
        previous={kpis.total_appointments.previous}
        icon={Calendar}
        iconColor="text-primary"
        iconBg="bg-primary/10"
        hint={{
          title: 'Consultas Agendadas',
          definition: 'Total de consultas com data marcada dentro do período (qualquer status).',
          formula: 'COUNT(medical_appointments WHERE scheduled_date BETWEEN período)',
        }}
      />

      <StatCard
        label="Taxa No-show"
        value={`${kpis.no_show_rate.current.toFixed(1)}%`}
        current={kpis.no_show_rate.current}
        previous={kpis.no_show_rate.previous}
        deltaUnit="pp"
        invertDelta
        icon={UserX}
        iconColor="text-[hsl(var(--amber))]"
        iconBg="bg-[hsl(var(--amber))]/10"
        hint={{
          title: 'Taxa de No-show',
          definition: 'Percentual de consultas onde o paciente não compareceu.',
          formula: 'no_show / total_agendadas × 100',
          note: `${kpis.no_show_rate.count} faltas no período — quanto menor, melhor.`,
        }}
      />

      <StatCard
        label="Conv. Lead → Consulta"
        value={`${kpis.conversion_rate.current.toFixed(1)}%`}
        current={kpis.conversion_rate.current}
        previous={kpis.conversion_rate.previous}
        deltaUnit="pp"
        icon={UserCheck}
        iconColor="text-primary"
        iconBg="bg-primary/10"
        hint={{
          title: 'Conversão Lead → Consulta',
          definition: 'Percentual de leads de marketing que viraram consulta agendada.',
          formula: 'agendados / leads_recebidos × 100',
          note: `${kpis.conversion_rate.leads} leads · ${kpis.conversion_rate.booked} agendados.`,
        }}
      />

      <StatCard
        label="Pacientes Novos"
        value={kpis.new_patients.current.toLocaleString('pt-BR')}
        rawValue={kpis.new_patients.current}
        countUp
        current={kpis.new_patients.current}
        previous={kpis.new_patients.previous}
        icon={UserPlus}
        iconColor="text-primary"
        iconBg="bg-primary/10"
        hint={{
          title: 'Pacientes Novos',
          definition: 'Pacientes cadastrados na clínica dentro do período selecionado.',
          formula: 'COUNT(medical_patients WHERE created_at BETWEEN período)',
        }}
      />

      <StatCard
        label="Ocupação da Agenda"
        value={`${kpis.occupancy_rate.current.toFixed(1)}%`}
        current={kpis.occupancy_rate.current}
        previous={kpis.occupancy_rate.previous}
        deltaUnit="pp"
        icon={Activity}
        iconColor="text-primary"
        iconBg="bg-primary/10"
        hint={{
          title: 'Ocupação da Agenda',
          definition: 'Aproveitamento das consultas agendadas — quantas foram efetivamente realizadas.',
          formula: 'consultas_concluídas / consultas_agendadas × 100',
          note: 'Indicador provisório até integrarmos slots de agenda por médico.',
        }}
      />
    </div>
  );
}
