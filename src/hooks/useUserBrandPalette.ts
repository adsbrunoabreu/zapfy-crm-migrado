import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { isValidPalette, PaletteId } from '@/lib/palettes';
import { toast } from 'sonner';

export function useUserBrandPalette(userId: string | null | undefined) {
  return useQuery({
    queryKey: ['user-brand-palette', userId],
    queryFn: async (): Promise<PaletteId | null> => {
      if (!userId) return null;
      const { data, error } = await supabase
        .from('profiles')
        .select('brand_palette')
        .eq('id', userId)
        .maybeSingle();
      if (error) throw error;
      const v = (data as any)?.brand_palette as string | undefined;
      return isValidPalette(v) ? v : null;
    },
    enabled: !!userId,
    staleTime: 1000 * 60 * 10,
  });
}

export function useUpdateUserBrandPalette(userId: string | null | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (palette: PaletteId | null) => {
      if (!userId) throw new Error('Usuário não identificado');
      // RLS UPDATE without .select() — avoid 403
      const { error } = await supabase
        .from('profiles')
        .update({ brand_palette: palette } as any)
        .eq('id', userId);
      if (error) throw error;
      return palette;
    },
    onSuccess: (palette) => {
      qc.setQueryData(['user-brand-palette', userId], palette);
      toast.success(palette ? 'Paleta atualizada' : 'Usando paleta da empresa');
    },
    onError: (err: any) => {
      toast.error('Não foi possível atualizar a paleta', { description: err?.message });
    },
  });
}
