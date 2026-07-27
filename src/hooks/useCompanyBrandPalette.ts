import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { DEFAULT_PALETTE, isValidPalette, PaletteId } from '@/lib/palettes';
import { toast } from 'sonner';

export function useCompanyBrandPalette(companyId: string | null | undefined) {
  return useQuery({
    queryKey: ['company-brand-palette', companyId],
    queryFn: async (): Promise<PaletteId> => {
      if (!companyId) return DEFAULT_PALETTE;
      const { data, error } = await supabase
        .from('companies')
        .select('brand_palette')
        .eq('id', companyId)
        .maybeSingle();
      if (error) throw error;
      const v = (data as any)?.brand_palette as string | undefined;
      return isValidPalette(v) ? v : DEFAULT_PALETTE;
    },
    enabled: !!companyId,
    staleTime: 1000 * 60 * 10,
  });
}

export function useUpdateCompanyBrandPalette(companyId: string | null | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (palette: PaletteId) => {
      if (!companyId) throw new Error('Empresa não identificada');
      // RLS UPDATE without .select() — avoid 403
      const { error } = await supabase
        .from('companies')
        .update({ brand_palette: palette })
        .eq('id', companyId);
      if (error) throw error;
      return palette;
    },
    onSuccess: (palette) => {
      qc.setQueryData(['company-brand-palette', companyId], palette);
      toast.success('Paleta atualizada');
    },
    onError: (err: any) => {
      toast.error('Não foi possível atualizar a paleta', { description: err?.message });
    },
  });
}
