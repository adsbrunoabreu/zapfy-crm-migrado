// Medical module removed. Stub kept for legacy imports.
import { useQuery } from '@tanstack/react-query';

export function useMedicalInsurances(_opts?: { onlyActive?: boolean }) {
  return useQuery({ queryKey: ['medical-insurances-stub'], queryFn: async () => [] as any[], enabled: false });
}
