import { useEffect } from 'react';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Plus, Trash2, Info } from 'lucide-react';
import type { BusinessHours, DayKey, Holiday } from '@/hooks/useAttendanceSettings';
import { useUserCompany } from '@/hooks/useCompanies';
import { timezoneLabel } from '@/lib/timezones';

const DAYS: { key: DayKey; label: string }[] = [
  { key: 'mon', label: 'Seg' },
  { key: 'tue', label: 'Ter' },
  { key: 'wed', label: 'Qua' },
  { key: 'thu', label: 'Qui' },
  { key: 'fri', label: 'Sex' },
  { key: 'sat', label: 'Sáb' },
  { key: 'sun', label: 'Dom' },
];

interface Props {
  value: BusinessHours;
  onChange: (v: BusinessHours) => void;
  holidays: Holiday[];
  onHolidaysChange: (v: Holiday[]) => void;
}

export default function BusinessHoursSection({ value, onChange, holidays, onHolidaysChange }: Props) {
  const { data: company } = useUserCompany();
  const companyTz = (company as any)?.timezone || 'America/Sao_Paulo';

  // Sincroniza fuso do horário com o cadastrado na empresa (fonte única de verdade)
  useEffect(() => {
    if (companyTz && value.timezone !== companyTz) {
      onChange({ ...value, timezone: companyTz });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyTz]);

  const setDay = (key: DayKey, patch: Partial<BusinessHours['days'][DayKey]>) => {
    onChange({ ...value, days: { ...value.days, [key]: { ...value.days[key], ...patch } } });
  };

  const addHoliday = () => {
    const today = new Date().toISOString().slice(0, 10);
    onHolidaysChange([
      ...holidays,
      { id: crypto.randomUUID(), date: today, message: '' },
    ]);
  };
  const updateHoliday = (id: string, patch: Partial<Holiday>) => {
    onHolidaysChange(holidays.map((h) => (h.id === id ? { ...h, ...patch } : h)));
  };
  const removeHoliday = (id: string) => {
    onHolidaysChange(holidays.filter((h) => h.id !== id));
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="font-display text-lg font-semibold">Horário de atendimento</h2>
        <p className="text-sm text-muted-foreground">Defina quando sua equipe está disponível.</p>
      </div>

      {/* Fuso horário: somente leitura, vem do cadastro da empresa */}
      <div className="flex items-start gap-2 p-3 rounded-md border border-border bg-secondary/20 text-sm">
        <Info className="w-4 h-4 mt-0.5 text-muted-foreground shrink-0" />
        <div className="flex-1">
          <span className="text-muted-foreground">Fuso horário: </span>
          <span className="font-medium">{timezoneLabel(companyTz)}</span>
          <p className="text-xs text-muted-foreground mt-0.5">
            Para alterar, acesse <span className="font-medium">Empresa → Preferências</span>.
          </p>
        </div>
      </div>


      {/* Dias */}
      <div className="space-y-2">
        <Label>Dias e horários</Label>
        <div className="space-y-2">
          {DAYS.map(({ key, label }) => {
            const day = value.days[key];
            return (
              <div key={key} className="flex items-center gap-3 p-3 rounded-md border border-border bg-secondary/30">
                <div className="flex items-center gap-2 w-20">
                  <Switch checked={day.enabled} onCheckedChange={(c) => setDay(key, { enabled: c })} />
                  <span className="text-sm font-medium">{label}</span>
                </div>
                <Input
                  type="time"
                  value={day.start}
                  onChange={(e) => setDay(key, { start: e.target.value })}
                  disabled={!day.enabled}
                  className="w-32 h-9"
                />
                <span className="text-muted-foreground text-sm">até</span>
                <Input
                  type="time"
                  value={day.end}
                  onChange={(e) => setDay(key, { end: e.target.value })}
                  disabled={!day.enabled}
                  className="w-32 h-9"
                />
              </div>
            );
          })}
        </div>
      </div>

      {/* Mensagem fora do horário */}
      <div className="space-y-2">
        <div className="flex items-center justify-between p-3 rounded-md border border-border bg-secondary/30">
          <div>
            <Label>Mensagem automática fora do horário</Label>
            <p className="text-xs text-muted-foreground">Envia uma resposta quando o cliente chamar fora do expediente</p>
          </div>
          <Switch
            checked={value.off_hours_enabled}
            onCheckedChange={(c) => onChange({ ...value, off_hours_enabled: c })}
          />
        </div>
        <Textarea
          rows={3}
          value={value.off_hours_message}
          onChange={(e) => onChange({ ...value, off_hours_message: e.target.value })}
          disabled={!value.off_hours_enabled}
        />
      </div>

      {/* Modo plantão */}
      <div className="p-4 rounded-md border border-border bg-secondary/30 space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <Label>Modo plantão</Label>
            <p className="text-xs text-muted-foreground">Horário diferenciado fora do expediente regular</p>
          </div>
          <Switch
            checked={value.on_call_mode.enabled}
            onCheckedChange={(c) => onChange({ ...value, on_call_mode: { ...value.on_call_mode, enabled: c } })}
          />
        </div>
        {value.on_call_mode.enabled && (
          <div className="flex items-center gap-3">
            <Input
              type="time"
              value={value.on_call_mode.start}
              onChange={(e) => onChange({ ...value, on_call_mode: { ...value.on_call_mode, start: e.target.value } })}
              className="w-32 h-9"
            />
            <span className="text-muted-foreground text-sm">até</span>
            <Input
              type="time"
              value={value.on_call_mode.end}
              onChange={(e) => onChange({ ...value, on_call_mode: { ...value.on_call_mode, end: e.target.value } })}
              className="w-32 h-9"
            />
          </div>
        )}
      </div>

      {/* Feriados */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label>Feriados</Label>
          <Button size="sm" variant="outline" onClick={addHoliday}>
            <Plus className="w-4 h-4 mr-1" /> Adicionar
          </Button>
        </div>
        {holidays.length === 0 && (
          <p className="text-xs text-muted-foreground">Nenhum feriado cadastrado.</p>
        )}
        <div className="space-y-2">
          {holidays.map((h) => (
            <div key={h.id} className="flex gap-2 items-start p-3 rounded-md border border-border bg-secondary/30">
              <Input
                type="date"
                value={h.date}
                onChange={(e) => updateHoliday(h.id, { date: e.target.value })}
                className="w-40 h-9"
              />
              <Textarea
                rows={2}
                placeholder="Mensagem para esse feriado"
                value={h.message}
                onChange={(e) => updateHoliday(h.id, { message: e.target.value })}
                className="flex-1 min-h-[36px]"
              />
              <Button size="icon" variant="ghost" onClick={() => removeHoliday(h.id)}>
                <Trash2 className="w-4 h-4 text-destructive" />
              </Button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
