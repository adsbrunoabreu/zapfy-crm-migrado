/** @deprecated Use PageShell padrão. Mantido temporariamente. */
import { ReactNode } from 'react';
import { MedicalHeader } from '../dashboard/MedicalHeader';

interface MedicalLayoutProps {
  children: ReactNode;
  practiceName?: string;
  pipeline?: string;
  onPipelineChange?: (v: string) => void;
  period?: string;
  onPeriodChange?: (v: string) => void;
  doctor?: string;
  onDoctorChange?: (v: string) => void;
}

export function MedicalLayout({
  children,
  practiceName,
  pipeline,
  onPipelineChange,
  period,
  onPeriodChange,
  doctor,
  onDoctorChange,
}: MedicalLayoutProps) {
  return (
    <div className="min-h-full bg-background">
      <div className="max-w-[1600px] mx-auto px-4 sm:px-6 py-6 space-y-6">
        <MedicalHeader
          practiceName={practiceName}
          pipeline={pipeline}
          onPipelineChange={onPipelineChange}
          period={period}
          onPeriodChange={onPeriodChange}
          doctor={doctor}
          onDoctorChange={onDoctorChange}
        />
        <main className="space-y-6">{children}</main>
      </div>
    </div>
  );
}
