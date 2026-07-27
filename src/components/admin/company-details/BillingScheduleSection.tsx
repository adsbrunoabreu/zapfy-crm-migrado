import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Save } from 'lucide-react';

const TIMEZONES = [
  'America/Sao_Paulo',
  'America/Manaus',
  'America/Rio_Branco',
  'America/Belem',
  'America/Fortaleza',
  'America/Recife',
  'America/Bahia',
  'America/Cuiaba',
  'America/Campo_Grande',
  'America/Noronha',
  'UTC',
  'America/New_York',
  'America/Los_Angeles',
  'Europe/Lisbon',
  'Europe/London',
  'Europe/Madrid',
];

const TZ_LABEL: Record<string, string> = {
  'America/Sao_Paulo': 'America/Sao_Paulo (BRT)',
  'America/Manaus': 'America/Manaus (AMT)',
  'America/Rio_Branco': 'America/Rio_Branco (ACT)',
};

interface Props {
  tz: string;
  hour: string;
  saving: boolean;
  lastSyncAt?: string | null;
  onTzChange: (v: string) => void;
  onHourChange: (v: string) => void;
  onSave: () => void;
}

export function BillingScheduleSection({
  tz,
  hour,
  saving,
  lastSyncAt,
  onTzChange,
  onHourChange,
  onSave,
}: Props) {
  return (
    <div>
      <p className="text-xs font-medium mb-1">Horário de sincronização</p>
      <p className="text-[11px] text-muted-foreground mb-3">
        Define quando o sistema recalcula o consumo e atualiza o valor da assinatura no Asaas. Roda 1× ao
        dia, no horário local da empresa.
      </p>
      <div className="grid grid-cols-[1fr,140px,auto] gap-2 items-end">
        <div>
          <Label className="text-[11px] text-muted-foreground">Fuso horário</Label>
          <select
            value={tz}
            onChange={(e) => onTzChange(e.target.value)}
            className="h-8 w-full rounded-md border border-input bg-background px-2 text-xs mt-1"
          >
            {TIMEZONES.map((t) => (
              <option key={t} value={t}>
                {TZ_LABEL[t] ?? t}
              </option>
            ))}
          </select>
        </div>
        <div>
          <Label className="text-[11px] text-muted-foreground">Hora local</Label>
          <select
            value={hour}
            onChange={(e) => onHourChange(e.target.value)}
            className="h-8 w-full rounded-md border border-input bg-background px-2 text-xs mt-1"
          >
            {Array.from({ length: 24 }).map((_, h) => (
              <option key={h} value={String(h)}>
                {String(h).padStart(2, '0')}:00
              </option>
            ))}
          </select>
        </div>
        <Button size="sm" variant="outline" onClick={onSave} disabled={saving}>
          <Save className="w-3 h-3 mr-1" /> Salvar
        </Button>
      </div>
      {lastSyncAt && (
        <p className="text-[10px] text-muted-foreground mt-2">
          Última sincronização: {new Date(lastSyncAt).toLocaleString('pt-BR')}
        </p>
      )}
    </div>
  );
}
