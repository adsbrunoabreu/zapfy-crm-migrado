import { memo } from 'react';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { StepBody, FieldGroup, ToggleRow } from '../shared';
import { DAYS, type AgentForm } from '../constants';

interface Props {
  form: AgentForm;
  upd: <K extends keyof AgentForm>(k: K, v: AgentForm[K]) => void;
  updateDay: (day: string, patch: Partial<{ enabled: boolean; start: string; end: string }>) => void;
}

export const Step4Scheduling = memo(function Step4Scheduling({ form, upd, updateDay }: Props) {
  return (
    <StepBody desc="O agente pode propor horários e enviar lembretes?">
      <div className="flex items-center justify-between p-4 rounded-lg border-2 border-border bg-muted/20">
        <div>
          <p className="text-sm font-medium">Habilitar agendamento</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            Quando ativo, o agente pode propor horários e confirmar reuniões.
          </p>
        </div>
        <Switch checked={form.offer_scheduling} onCheckedChange={(v) => upd('offer_scheduling', v)} />
      </div>

      {form.offer_scheduling && (
        <>
          <FieldGroup label="Quando oferecer">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              {[
                { v: 'always', l: 'Sempre', d: 'Após 3 mensagens' },
                { v: 'qualified', l: 'Se qualificado', d: 'Detecção automática' },
                { v: 'on_request', l: 'Sob pedido', d: 'Só se cliente pedir' },
              ].map((o) => {
                const active = form.offer_timing === o.v;
                return (
                  <button
                    key={o.v}
                    type="button"
                    onClick={() => upd('offer_timing', o.v)}
                    className={`text-left p-3 rounded-lg border-2 transition-colors ${
                      active ? 'border-amber/60 bg-amber/5' : 'border-border hover:bg-muted/30'
                    }`}
                  >
                    <p className="text-sm font-medium">{o.l}</p>
                    <p className="text-[11px] text-muted-foreground mt-0.5">{o.d}</p>
                  </button>
                );
              })}
            </div>
          </FieldGroup>

          <FieldGroup label="Horários disponíveis">
            <div className="rounded-md border border-border overflow-hidden">
              {DAYS.map((d, idx) => {
                const cfg = form.available_hours[d.key] || { enabled: false, start: '09:00', end: '18:00' };
                return (
                  <div
                    key={d.key}
                    className={`grid grid-cols-[auto_80px_1fr_auto_1fr] items-center gap-2 px-3 py-2 ${
                      idx > 0 ? 'border-t border-border' : ''
                    } ${!cfg.enabled ? 'opacity-50' : ''}`}
                  >
                    <Switch checked={cfg.enabled} onCheckedChange={(v) => updateDay(d.key, { enabled: v })} />
                    <span className="text-xs">{d.label}</span>
                    <Input type="time" value={cfg.start} disabled={!cfg.enabled}
                      onChange={(e) => updateDay(d.key, { start: e.target.value })} className="h-8 text-xs" />
                    <span className="text-[11px] text-muted-foreground">até</span>
                    <Input type="time" value={cfg.end} disabled={!cfg.enabled}
                      onChange={(e) => updateDay(d.key, { end: e.target.value })} className="h-8 text-xs" />
                  </div>
                );
              })}
            </div>
          </FieldGroup>

          <FieldGroup label="Notificações automáticas">
            <div className="space-y-1.5">
              <ToggleRow label="Confirmação via WhatsApp" checked={form.auto_confirmation} onChange={(v) => upd('auto_confirmation', v)} />
              <ToggleRow label="Lembrete antes do horário" checked={form.reminder_enabled} onChange={(v) => upd('reminder_enabled', v)} />
              <ToggleRow label="Cupom de desconto se não confirmar em 24h" checked={form.send_discount_coupon} onChange={(v) => upd('send_discount_coupon', v)} />
            </div>
          </FieldGroup>
        </>
      )}
    </StepBody>
  );
});
