import { Zap, Stethoscope, type LucideIcon } from 'lucide-react';
import { useCompanyVertical } from './useCompanyVertical';

export interface BrandInfo {
  name: string;
  /** Versão lowercase usada nos lugares onde o logo aplica `lowercase`. */
  displayName: string;
  Icon: LucideIcon;
  isMedical: boolean;
}

/**
 * Marca dinâmica do sistema. Empresas com vertical médica veem
 * "DoctorFy" + ícone de estetoscópio; demais veem "zapfy" + raio.
 */
export function useBrand(): BrandInfo {
  const { data: vertical } = useCompanyVertical();
  const isMedical = vertical === 'medical';

  return isMedical
    ? { name: 'DoctorFy', displayName: 'DoctorFy', Icon: Stethoscope, isMedical: true }
    : { name: 'zapfy', displayName: 'zapfy', Icon: Zap, isMedical: false };
}
