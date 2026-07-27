import { memo } from 'react';
import { Switch } from '@/components/ui/switch';
import { CheckCircle2 } from 'lucide-react';
import { StepBody, ReviewRow } from '../shared';
import { TONES, type AgentForm } from '../constants';

interface Props {
  form: AgentForm;
  upd: <K extends keyof AgentForm>(k: K, v: AgentForm[K]) => void;
}

export const Step6Review = memo(function Step6Review({ form, upd }: Props) {
  return (
    <StepBody desc="Revise e ative seu agente.">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        <ReviewRow label="Nome" value={`${form.emoji || ''} ${form.name}`.trim()} />
        <ReviewRow label="Tom" value={TONES.find((t) => t.value === form.tone)?.label || form.tone} />
        <ReviewRow label="Modelo" value="Definido pelo administrador" />
        <ReviewRow label="Perguntas" value={`${form.qualification_questions.filter(Boolean).length} configuradas`} />
        <ReviewRow label="Campos coletados" value={`${form.collect_fields.length} campos`} />
        <ReviewRow label="Agendamento" value={form.offer_scheduling ? 'Ativo' : 'Desativado'} />
        <ReviewRow label="Turnos máx." value={String(form.max_turns)} />
        <ReviewRow label="Sentimento" value={form.detect_negative_sentiment ? 'Detecta negativo' : 'Não detecta'} />
      </div>
      <div className="flex items-center justify-between gap-3 p-4 rounded-lg border-2 border-emerald/30 bg-emerald/5">
        <div>
          <p className="text-sm font-semibold flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald" />
            Ativar o agente agora?
          </p>
          <p className="text-xs text-muted-foreground mt-0.5">
            Quando ligado, o agente responde automaticamente as conversas deste pipeline.
          </p>
        </div>
        <Switch checked={form.is_active} onCheckedChange={(v) => upd('is_active', v)} />
      </div>
    </StepBody>
  );
});
