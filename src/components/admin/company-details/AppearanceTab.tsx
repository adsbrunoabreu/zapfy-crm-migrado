import { Card } from '@/components/ui/card';
import { PaletteSelector } from '@/components/branding/PaletteSelector';

export function AppearanceTab({ companyId }: { companyId: string | null }) {
  return (
    <Card className="p-4 space-y-3">
      <div>
        <h4 className="text-sm font-semibold">Paleta de cores</h4>
        <p className="text-xs text-muted-foreground mt-1">
          Define a identidade visual desta empresa para todos os usuários.
        </p>
      </div>
      <PaletteSelector companyId={companyId} />
    </Card>
  );
}
