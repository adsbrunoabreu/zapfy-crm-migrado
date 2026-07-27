import { memo } from 'react';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { StepBody, FieldGroup, ToggleRow } from '../shared';
import type { AgentForm } from '../constants';

interface Props {
  form: AgentForm;
  upd: <K extends keyof AgentForm>(k: K, v: AgentForm[K]) => void;
}

export const Step5Advanced = memo(function Step5Advanced({ form, upd }: Props) {
  return (
    <StepBody desc="Limites do agente e regras de transferência para humano.">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <div className="space-y-4">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Limites</p>
          <FieldGroup label="Máx. turnos antes de transferir" hint="Recomendado 8–15.">
            <Input type="number" min={3} max={50} value={form.max_turns}
              onChange={(e) => upd('max_turns', Number(e.target.value))} />
          </FieldGroup>
          <FieldGroup label="Atraso da resposta (ms)" hint="Simula digitação humana.">
            <Input type="number" min={0} max={10000} step={100} value={form.response_delay_ms}
              onChange={(e) => upd('response_delay_ms', Number(e.target.value))} />
          </FieldGroup>
          <FieldGroup label="Janela de agrupamento (s)" hint="Espera N segundos por novas mensagens.">
            <Input type="number" min={0} max={60} value={form.debounce_seconds}
              onChange={(e) => upd('debounce_seconds', Number(e.target.value))} />
          </FieldGroup>
        </div>

        <div className="space-y-4">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Transferência</p>
          <FieldGroup label="Palavras-chave que transferem" hint="Separadas por vírgula.">
            <Textarea
              rows={3}
              value={form.handoff_keywords.join(', ')}
              onChange={(e) => upd('handoff_keywords', e.target.value.split(',').map((s) => s.trim()).filter(Boolean))}
              placeholder="atendente, humano, pessoa, cancelar"
            />
          </FieldGroup>
          <ToggleRow label="Detectar sentimento negativo" hint="Transfere se o cliente parecer frustrado."
            checked={form.detect_negative_sentiment} onChange={(v) => upd('detect_negative_sentiment', v)} />
          <ToggleRow label="Apenas em horário comercial" hint="Respeita Atendimento → Configurações."
            checked={form.business_hours_only} onChange={(v) => upd('business_hours_only', v)} />
        </div>
      </div>
    </StepBody>
  );
});
