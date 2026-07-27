import { Check, Info } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { PALETTES, PaletteId } from '@/lib/palettes';
import { cn } from '@/lib/utils';
import { useCompanyBrandPalette, useUpdateCompanyBrandPalette } from '@/hooks/useCompanyBrandPalette';
import { useUserBrandPalette, useUpdateUserBrandPalette } from '@/hooks/useUserBrandPalette';
import { Button } from '@/components/ui/button';

interface PaletteSelectorProps {
  companyId: string | null | undefined;
  disabled?: boolean;
}

export function PaletteSelector({ companyId, disabled }: PaletteSelectorProps) {
  const { user } = useAuth();
  const { data: current } = useCompanyBrandPalette(companyId);
  const update = useUpdateCompanyBrandPalette(companyId);
  const { data: userPalette } = useUserBrandPalette(user?.id);
  const clearUserPalette = useUpdateUserBrandPalette(user?.id);

  const hasUserOverride = !!userPalette && userPalette !== current;
  const userPaletteLabel = PALETTES.find((p) => p.id === userPalette)?.label ?? userPalette;

  return (
    <div className="space-y-3">
      {hasUserOverride && (
        <div className="flex items-start gap-2 rounded-lg border border-amber/30 bg-amber/5 p-3 text-xs">
          <Info className="w-4 h-4 text-amber shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <p className="text-foreground">
              Sua preferência pessoal (<strong>{userPaletteLabel}</strong>) está sobrepondo a paleta da empresa.
              Mudanças aqui não aparecerão no seu acesso até remover a preferência pessoal.
            </p>
          </div>
          <Button
            size="sm"
            variant="outline"
            disabled={clearUserPalette.isPending}
            onClick={() => clearUserPalette.mutate(null)}
          >
            Usar paleta da empresa
          </Button>
        </div>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
        {PALETTES.map((p) => {
          const active = (current ?? 'graphite') === p.id;
          const isPending = update.isPending && (update.variables as PaletteId) === p.id;
          return (
            <button
              key={p.id}
              type="button"
              disabled={disabled || update.isPending}
              onClick={() => update.mutate(p.id)}
              className={cn(
                'group relative flex items-center gap-3 rounded-lg border p-3 text-left transition-all',
                active
                  ? 'border-primary bg-primary/5 ring-2 ring-primary/30'
                  : 'border-border hover:border-foreground/30 hover:bg-accent/40',
                (disabled || update.isPending) && 'opacity-60 cursor-not-allowed'
              )}
              aria-pressed={active}
            >
              <span
                className="h-9 w-9 shrink-0 rounded-full border border-border/60 shadow-inner"
                style={{ background: p.swatch }}
                aria-hidden
              />
              <span className="flex-1 min-w-0">
                <span className="block text-sm font-medium truncate">{p.label}</span>
                <span className="block text-[11px] text-muted-foreground truncate">
                  {p.description}
                </span>
              </span>
              {active && (
                <Check className="w-4 h-4 text-primary shrink-0" />
              )}
              {isPending && (
                <span className="absolute inset-0 rounded-lg bg-background/40 backdrop-blur-[1px]" />
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
