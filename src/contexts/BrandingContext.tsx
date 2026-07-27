import { ReactNode, useEffect, useRef } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useCompanyBrandPalette } from '@/hooks/useCompanyBrandPalette';
import { useUserBrandPalette } from '@/hooks/useUserBrandPalette';
import { applyPaletteClass, DEFAULT_PALETTE } from '@/lib/palettes';

// Aplica a paleta default sincronamente no boot, antes do React montar.
// Evita flash sem classe palette-* no <html> durante a hidratação.
if (typeof document !== 'undefined') {
  const root = document.documentElement;
  const hasPalette = Array.from(root.classList).some((c) => c.startsWith('palette-'));
  if (!hasPalette) {
    root.classList.add(`palette-${DEFAULT_PALETTE}`);
  }
}

export function BrandingProvider({ children }: { children: ReactNode }) {
  const { user, profile } = useAuth();
  const { data: userPalette, isLoading: loadingUser } = useUserBrandPalette(user?.id);
  const { data: companyPalette, isLoading: loadingCompany } = useCompanyBrandPalette(profile?.company_id);
  const lastApplied = useRef<string | null>(null);

  useEffect(() => {
    // Enquanto as queries habilitadas estiverem carregando, mantém a paleta atual
    // (já aplicada sincronamente como DEFAULT) para evitar flashes.
    const userPending = !!user?.id && loadingUser;
    const companyPending = !!profile?.company_id && loadingCompany;
    if (userPending || companyPending) return;

    const next = userPalette ?? companyPalette ?? DEFAULT_PALETTE;
    if (next === lastApplied.current) return;
    lastApplied.current = next;
    applyPaletteClass(next);
  }, [userPalette, companyPalette, loadingUser, loadingCompany, user?.id, profile?.company_id]);

  return <>{children}</>;
}
