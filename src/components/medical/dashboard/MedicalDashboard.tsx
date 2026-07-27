import { useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useMedical } from '@/contexts/MedicalContext';
import { useMedicalKPIs } from '@/hooks/medical/useMedicalKPIs';
import { useMedicalDashboardSeries } from '@/hooks/medical/useMedicalDashboardSeries';
import { useMedicalDoctors } from '@/hooks/medical/useMedicalDoctors';
import { useMedicalProcedures } from '@/hooks/medical/useMedicalProcedures';
import { usePipelines } from '@/hooks/usePipelines';
import { usePersistedState } from '@/hooks/usePersistedState';
import { getRangeForPeriod, type DashboardPeriod } from '@/hooks/useDashboardData';

import { PageShell } from '@/components/layout/PageShell';
import { KPIsGrid } from '../kpis/KPIsGrid';
import { PracticeSwitcher } from './PracticeSwitcher';
import { RevenueChart } from '../charts/RevenueChart';
import { AppointmentsByDayChart } from '../charts/AppointmentsByDayChart';
import { TopProceduresChart } from '../charts/TopProceduresChart';

import { MedicalCrossInsights } from '../charts/MedicalCrossInsights';
import { MedicalPieBreakdowns } from '../charts/MedicalPieBreakdowns';
import { InsightsPanel } from '../insights/InsightsPanel';
import { DateRangeFilter } from '@/components/dashboard/DateRangeFilter';
import { FilterSelect } from '@/components/filters/FilterSelect';
import { FilterPopoverButton } from '@/components/filters/FilterPopoverButton';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Loader2, Stethoscope, Download, Kanban } from 'lucide-react';
import { toast } from 'sonner';

const PERIOD_KEY = 'medicalDashboard.period';
const CUSTOM_RANGE_KEY = 'medicalDashboard.customRange';

interface PersistedRange { from: string; to: string }

// TODO: vincular a tabela medical_insurance quando existir.
const INSURANCE_OPTIONS = [
  { value: 'particular', label: 'Particular' },
  { value: 'unimed', label: 'Unimed' },
  { value: 'bradesco', label: 'Bradesco Saúde' },
  { value: 'sulamerica', label: 'SulAmérica' },
  { value: 'amil', label: 'Amil' },
  { value: 'outros', label: 'Outros' },
];

export function MedicalDashboard() {
  const { currentPractice, loading, isMaster, allPractices } = useMedical();

  const [period, setPeriod] = usePersistedState<DashboardPeriod>(PERIOD_KEY, '30d');
  const [persistedRange, setPersistedRange] = usePersistedState<PersistedRange | null>(CUSTOM_RANGE_KEY, null);

  const [pipelineId, setPipelineId] = useState<string | null>(null);
  const [doctorId, setDoctorId] = useState<string | null>(null);
  const [procedureId, setProcedureId] = useState<string | null>(null);
  const [insurance, setInsurance] = useState<string | null>(null);

  const { data: pipelines = [] } = usePipelines();
  const { data: doctors = [] } = useMedicalDoctors(currentPractice?.id || null);
  const { data: procedures = [] } = useMedicalProcedures(currentPractice?.id || null);
  const crmPipelineId = pipelineId || pipelines.find((p) => (p.lead_count ?? 0) > 0)?.id || pipelines.find((p) => p.is_default)?.id || pipelines[0]?.id;

  const customRange = useMemo(() => {
    if (!persistedRange) return undefined;
    const from = new Date(persistedRange.from);
    const to = new Date(persistedRange.to);
    if (isNaN(from.getTime()) || isNaN(to.getTime())) return undefined;
    return { from, to };
  }, [persistedRange]);

  const range = useMemo(() => getRangeForPeriod(period, customRange), [period, customRange]);

  const { kpis, isLoading: kpisLoading } = useMedicalKPIs(currentPractice?.id || null, {
    from: range.startDate,
    to: range.endDate,
    doctorId,
    procedureId,
  });

  const { series, isLoading: seriesLoading } = useMedicalDashboardSeries(currentPractice?.id || null, {
    from: range.startDate,
    to: range.endDate,
    doctorId,
    procedureId,
  });

  const handleRangeChange = (p: DashboardPeriod, c?: { from: Date; to: Date }) => {
    setPeriod(p);
    if (c) setPersistedRange({ from: c.from.toISOString(), to: c.to.toISOString() });
  };

  const activeCount =
    (pipelineId ? 1 : 0) + (doctorId ? 1 : 0) + (procedureId ? 1 : 0) + (insurance ? 1 : 0);

  const clearFilters = () => {
    setPipelineId(null);
    setDoctorId(null);
    setProcedureId(null);
    setInsurance(null);
  };

  const handleExportCsv = () => {
    toast.info('Exportação em breve');
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-[50vh]">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!currentPractice) {
    return (
      <PageShell
        title="Dashboard Médico"
        icon={<Stethoscope className="h-5 w-5 text-primary" />}
      >
        <div className="max-w-2xl mx-auto p-8">
          <div className="rounded-xl border border-border bg-card p-8 text-center space-y-4">
            <div className="w-12 h-12 mx-auto rounded-full bg-primary/10 text-primary flex items-center justify-center">
              <Stethoscope className="w-6 h-6" />
            </div>
            <h2 className="text-lg font-semibold text-foreground">
              {isMaster && allPractices.length === 0
                ? 'Nenhuma clínica cadastrada'
                : 'Vertical Médica não ativada'}
            </h2>
            <p className="text-sm text-muted-foreground">
              {isMaster && allPractices.length === 0
                ? 'Nenhuma empresa está com a vertical médica ativada ainda. Ative em Empresas → marque uma empresa como Médica.'
                : 'Sua empresa ainda não está configurada como clínica médica. Ative em Configurações → aba Vertical Médica.'}
            </p>
            <div className="flex justify-center gap-2 pt-2">
              {isMaster ? (
                <Button asChild>
                  <Link to="/admin/companies">Gerenciar empresas</Link>
                </Button>
              ) : (
                <Button asChild>
                  <Link to="/settings?tab=medical">Ir para Configurações</Link>
                </Button>
              )}
            </div>
          </div>
        </div>
      </PageShell>
    );
  }

  const dailySeries = series?.daily ?? [];
  const topProcedures = series?.top_procedures ?? [];
  


  const doctorCount = kpis?.doctor_count ?? 0;
  const subtitle = doctorCount > 0
    ? `${currentPractice.practice_name} · ${doctorCount} médico${doctorCount === 1 ? '' : 's'} ativo${doctorCount === 1 ? '' : 's'}`
    : currentPractice.practice_name;

  return (
    <PageShell
      title="Dashboard Médico"
      subtitle={subtitle}
      icon={<Stethoscope className="h-5 w-5 text-primary" />}
      actions={
        <>
          {isMaster && <PracticeSwitcher />}

          {crmPipelineId && (
            <Button asChild type="button" variant="outline" className="h-9 bg-secondary/50 border-border/50 text-xs gap-2">
              <Link to={`/pipelines/${crmPipelineId}`}>
                <Kanban className="w-3.5 h-3.5" />
                Abrir CRM
              </Link>
            </Button>
          )}

          <Button
            type="button"
            variant="outline"
            className="h-9 bg-secondary/50 border-border/50 text-xs gap-2"
            onClick={handleExportCsv}
          >
            <Download className="w-3.5 h-3.5" />
            Exportar CSV
          </Button>

          <FilterPopoverButton activeCount={activeCount} onClear={clearFilters}>
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label className="text-xs font-medium text-muted-foreground">Pipeline</Label>
                <FilterSelect
                  value={pipelineId || 'all'}
                  onValueChange={(v) => setPipelineId(v === 'all' ? null : v)}
                  options={[
                    { value: 'all', label: 'Todos os pipelines' },
                    ...pipelines.map((p) => ({ value: p.id, label: p.name })),
                  ]}
                  placeholder="Pipeline"
                  width="w-full"
                />
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-medium text-muted-foreground">Médico</Label>
                <FilterSelect
                  value={doctorId || 'all'}
                  onValueChange={(v) => setDoctorId(v === 'all' ? null : v)}
                  options={[
                    { value: 'all', label: 'Todos os médicos' },
                    ...doctors.map((d) => ({ value: d.id, label: d.full_name })),
                  ]}
                  placeholder="Médico"
                  width="w-full"
                />
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-medium text-muted-foreground">Procedimento</Label>
                <FilterSelect
                  value={procedureId || 'all'}
                  onValueChange={(v) => setProcedureId(v === 'all' ? null : v)}
                  options={[
                    { value: 'all', label: 'Todos os procedimentos' },
                    ...procedures.map((p) => ({ value: p.id, label: p.name })),
                  ]}
                  placeholder="Procedimento"
                  width="w-full"
                />
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-medium text-muted-foreground">Convênio</Label>
                <FilterSelect
                  value={insurance || 'all'}
                  onValueChange={(v) => setInsurance(v === 'all' ? null : v)}
                  options={[
                    { value: 'all', label: 'Todos os convênios' },
                    ...INSURANCE_OPTIONS,
                  ]}
                  placeholder="Convênio"
                  width="w-full"
                />
              </div>
            </div>
          </FilterPopoverButton>

          <DateRangeFilter
            period={period}
            customRange={customRange}
            onChange={handleRangeChange}
          />
        </>
      }
    >
      <KPIsGrid kpis={kpis} isLoading={kpisLoading} />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <RevenueChart data={dailySeries} isLoading={seriesLoading} />
        <AppointmentsByDayChart data={dailySeries} isLoading={seriesLoading} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <TopProceduresChart data={topProcedures} isLoading={seriesLoading} />
        <InsightsPanel practiceId={currentPractice.id} />
      </div>

      <MedicalPieBreakdowns
        practiceId={currentPractice.id}
        filters={{
          from: range.startDate,
          to: range.endDate,
          doctorId,
          procedureId,
        }}
      />

      

      <MedicalCrossInsights
        practiceId={currentPractice.id}
        filters={{
          from: range.startDate,
          to: range.endDate,
          doctorId,
          procedureId,
        }}
      />
    </PageShell>
  );
}

export default MedicalDashboard;
