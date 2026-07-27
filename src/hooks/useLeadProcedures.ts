// Medical procedures module removed. Stubs kept so budget/finance UI still type-checks.
import { useMutation, useQuery } from '@tanstack/react-query';

export function useLeadProcedures(_leadId: string | null) {
  return useQuery({ queryKey: ['lead-procedures-stub', _leadId], queryFn: async () => [] as any[], enabled: false });
}

export function useAddLeadProduct() {
  return useMutation({ mutationFn: async (_: any) => null });
}

export function useRemoveLeadProcedure() {
  return useMutation({ mutationFn: async (_: any) => null });
}

