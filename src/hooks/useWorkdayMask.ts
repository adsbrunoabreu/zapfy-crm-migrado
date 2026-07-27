import { useCallback, useMemo } from 'react';
import type { Professional } from '@/hooks/useAppointmentProfessionals';

/**
 * Retorna predicados para saber se um determinado dia/horário
 * cai DENTRO da jornada de um profissional específico.
 *
 * Quando nenhum profissional é selecionado (proFilter === 'all'),
 * todos os dias/horas são considerados válidos.
 */
export function useWorkdayMask(
  pros: Professional[],
  selectedProfessionalId: string | null,
) {
  const selected = useMemo(
    () => (selectedProfessionalId ? pros.find(p => p.id === selectedProfessionalId) || null : null),
    [pros, selectedProfessionalId],
  );

  const isWorkDay = useCallback(
    (date: Date): boolean => {
      if (!selected) return true;
      const wd = date.getDay(); // 0=Dom..6=Sáb
      return (selected.work_days || []).includes(wd);
    },
    [selected],
  );

  const isWorkHour = useCallback(
    (date: Date): boolean => {
      if (!selected) return true;
      if (!isWorkDay(date)) return false;
      const [sh, sm = '0'] = (selected.work_start_time || '09:00').split(':');
      const [eh, em = '0'] = (selected.work_end_time || '18:00').split(':');
      const startMin = Number(sh) * 60 + Number(sm);
      const endMin = Number(eh) * 60 + Number(em);
      const min = date.getHours() * 60 + date.getMinutes();
      return min >= startMin && min < endMin;
    },
    [selected, isWorkDay],
  );

  return { selected, isWorkDay, isWorkHour };
}
