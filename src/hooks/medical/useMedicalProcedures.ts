import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface MedicalProcedureOption {
  id: string;
  name: string;
  base_price?: number | null;
}

/** Procedimentos ativos da clínica, para uso em filtros. */
export function useMedicalProcedures(practiceId: string | null | undefined) {
  return useQuery<MedicalProcedureOption[]>({
    queryKey: ['medical-procedures', practiceId],
    enabled: !!practiceId,
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('medical_procedures')
        .select('id, name, base_price')
        .eq('practice_id', practiceId)
        .eq('active', true)
        .order('name')
        .limit(200);
      if (error) throw error;
      return ((data ?? []) as MedicalProcedureOption[]).sort((a, b) =>
        a.name.localeCompare(b.name, 'pt-BR', { sensitivity: 'base' }),
      );
    },
  });
}
