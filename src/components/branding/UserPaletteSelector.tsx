import { Check } from 'lucide-react';
import { PALETTES, PaletteId } from '@/lib/palettes';
import { cn } from '@/lib/utils';
import { useUserBrandPalette, useUpdateUserBrandPalette } from '@/hooks/useUserBrandPalette';

interface UserPaletteSelectorProps {
  userId: string | null | undefined;
  disabled?: boolean;
}

export function UserPaletteSelector({ userId, disabled }: UserPaletteSelectorProps) {
  const { data: current } = useUserBrandPalette(userId);
  const update = useUpdateUserBrandPalette(userId);

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
        <button
          type="button"
          disabled={disabled || update.isPending}
          onClick={() => update.mutate(null as any)}
          className={cn(
            'group relative flex items-center gap-3 rounded-lg border p-3 text-left transition-all',
            !current
              ? 'border-primary bg-primary/5 ring-2 ring-primary/30'
              : 'border-border hover:border-foreground/30 hover:bg-accent/40',
            (disabled || update.isPending) && 'opacity-60 cursor-not-allowed'
          )}
          aria-pressed={!current}
        >
          <span
            className="h-9 w-9 shrink-0 rounded-full border border-border/60 shadow-inner bg-gradient-to-br from-muted to-accent"
            aria-hidden
          />
          <span className="flex-1 min-w-0">
            <span className="block text-sm font-medium truncate">Seguir empresa</span>
            <span className="block text-[11px] text-muted-foreground truncate">
              Usar a paleta definida pela empresa
            </span>
          </span>
          {!current && <Check className="w-4 h-4 text-primary shrink-0" />}
        </button>
        {PALETTES.map((p) => {
          const active = current === p.id;
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
              {active && <Check className="w-4 h-4 text-primary shrink-0" />}
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
