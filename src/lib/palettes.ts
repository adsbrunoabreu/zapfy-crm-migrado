export type PaletteId =
  | 'graphite'
  | 'emerald'
  | 'azure'
  | 'violet'
  | 'sunset'
  | 'crimson'
  | 'ocean'
  | 'rose'
  | 'pitada'
  | 'zapfy';

export interface PaletteDef {
  id: PaletteId;
  label: string;
  description: string;
  swatch: string; // CSS color for preview circle
}

export const PALETTES: PaletteDef[] = [
  { id: 'graphite', label: 'Grafite', description: 'Neutro corporativo', swatch: 'hsl(0 0% 18%)' },
  { id: 'emerald',  label: 'Esmeralda', description: 'Financeiro, sustentabilidade', swatch: 'hsl(160 65% 42%)' },
  { id: 'azure',    label: 'Azul Royal', description: 'Tecnologia, confiança (padrão)', swatch: 'hsl(217 85% 55%)' },
  { id: 'violet',   label: 'Violeta', description: 'Criativo, premium', swatch: 'hsl(263 65% 58%)' },
  { id: 'sunset',   label: 'Pôr do Sol', description: 'Vendas, energia', swatch: 'hsl(24 90% 55%)' },
  { id: 'crimson',  label: 'Carmim', description: 'Urgência, alimentício', swatch: 'hsl(350 75% 52%)' },
  { id: 'ocean',    label: 'Oceano', description: 'Saúde, bem-estar', swatch: 'hsl(190 75% 45%)' },
  { id: 'rose',     label: 'Rosé', description: 'Beleza, varejo', swatch: 'hsl(335 75% 60%)' },
  { id: 'pitada',   label: 'Pitada', description: 'Lima neon sobre preto, energia', swatch: 'hsl(74 100% 50%)' },
  { id: 'zapfy',    label: 'Zapfy', description: 'Verde-elétrico + violeta', swatch: 'hsl(88 95% 55%)' },
];

export const DEFAULT_PALETTE: PaletteId = 'azure';

export const PALETTE_IDS = PALETTES.map((p) => p.id);

export function isValidPalette(value: string | null | undefined): value is PaletteId {
  return !!value && (PALETTE_IDS as string[]).includes(value);
}

export function applyPaletteClass(palette: PaletteId) {
  const root = document.documentElement;
  // remove any existing palette-* class
  root.classList.forEach((cls) => {
    if (cls.startsWith('palette-')) root.classList.remove(cls);
  });
  root.classList.add(`palette-${palette}`);
}
