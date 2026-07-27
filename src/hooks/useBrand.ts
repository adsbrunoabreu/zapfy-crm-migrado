import { Zap, type LucideIcon } from 'lucide-react';

export interface BrandInfo {
  name: string;
  displayName: string;
  Icon: LucideIcon;
  isMedical: false;
}

export function useBrand(): BrandInfo {
  return { name: 'zapfy', displayName: 'zapfy', Icon: Zap, isMedical: false };
}
