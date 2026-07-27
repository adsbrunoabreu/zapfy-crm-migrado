/** @deprecated Substituído pelo header padrão (PageShell) em MedicalDashboard. */
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { BarChart3, Settings } from 'lucide-react';
import { PracticeSwitcher } from './PracticeSwitcher';

interface MedicalHeaderProps {
  practiceName?: string;
  pipeline?: string;
  onPipelineChange?: (v: string) => void;
  period?: string;
  onPeriodChange?: (v: string) => void;
  doctor?: string;
  onDoctorChange?: (v: string) => void;
}

export function MedicalHeader({
  practiceName,
  pipeline = 'all',
  onPipelineChange,
  period = 'month',
  onPeriodChange,
  doctor = 'all',
  onDoctorChange,
}: MedicalHeaderProps) {
  return (
    <header className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-semibold text-foreground tracking-tight">
            🏥 ZAPFY MÉDICO
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Central Executiva de Gestão Clínica
            {practiceName ? <span className="text-foreground/80"> · {practiceName}</span> : null}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <PracticeSwitcher />
          <Button variant="outline" size="sm">
            <BarChart3 className="h-4 w-4 mr-2" /> Relatórios
          </Button>
          <Button variant="outline" size="sm">
            <Settings className="h-4 w-4 mr-2" /> Configurar
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Select value={pipeline} onValueChange={onPipelineChange}>
          <SelectTrigger className="w-[200px] h-9">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">📊 Todos os Pipelines</SelectItem>
            <SelectItem value="internal">🏥 Aut. Internas</SelectItem>
            <SelectItem value="external">🏘️ Aut. Externas</SelectItem>
            <SelectItem value="surgery">🔪 Cirurgias</SelectItem>
          </SelectContent>
        </Select>

        <Select value={period} onValueChange={onPeriodChange}>
          <SelectTrigger className="w-[160px] h-9">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="today">📅 Hoje</SelectItem>
            <SelectItem value="week">📅 Esta Semana</SelectItem>
            <SelectItem value="month">📅 Este Mês</SelectItem>
            <SelectItem value="year">📅 Este Ano</SelectItem>
          </SelectContent>
        </Select>

        <Select value={doctor} onValueChange={onDoctorChange}>
          <SelectTrigger className="w-[200px] h-9">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">👥 Todos os Médicos</SelectItem>
          </SelectContent>
        </Select>
      </div>
    </header>
  );
}
