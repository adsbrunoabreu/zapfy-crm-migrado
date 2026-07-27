import { memo, useCallback } from 'react';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Check, Wand2 } from 'lucide-react';
import { StepBody, FieldGroup } from '../shared';
import { TONES, type AgentForm } from '../constants';

interface Props {
  form: AgentForm;
  upd: <K extends keyof AgentForm>(k: K, v: AgentForm[K]) => void;
}

export const Step2Persona = memo(function Step2Persona({ form, upd }: Props) {
  const suggestPrompt = useCallback(() => {
    const tone = TONES.find((t) => t.value === form.tone);
    const txt = `Você é ${form.name || 'um assistente'}, um(a) ${form.persona || 'atendente'}. Tom de voz ${tone?.label?.toLowerCase() || 'casual'}: ${tone?.desc?.toLowerCase() || ''}. Responda em português do Brasil, faça uma pergunta por vez e seja breve.`;
    upd('system_prompt', txt);
  }, [form.tone, form.name, form.persona, upd]);

  return (
    <StepBody desc="Defina como o agente conversa.">
      <FieldGroup label="Tom de voz">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {TONES.map((t) => {
            const active = form.tone === t.value;
            return (
              <button
                key={t.value}
                type="button"
                onClick={() => upd('tone', t.value)}
                className={`relative text-left p-3 rounded-lg border-2 transition-colors ${
                  active ? 'border-violet bg-violet/5' : 'border-border hover:border-border/80 hover:bg-muted/30'
                }`}
              >
                {active && <Check className="w-3.5 h-3.5 text-violet absolute top-2 right-2" />}
                <p className="text-sm font-medium">{t.label}</p>
                <p className="text-[11px] text-muted-foreground mt-0.5">{t.desc}</p>
              </button>
            );
          })}
        </div>
      </FieldGroup>
      <FieldGroup label="Persona" hint="Como o agente se descreve.">
        <Input value={form.persona} onChange={(e) => upd('persona', e.target.value)}
          placeholder="Ex: Consultora de TI cordial e direta" />
      </FieldGroup>
      <FieldGroup
        label="Instruções (system prompt)"
        hint="Use {{nome_lead}} ou {{empresa}} para variáveis."
        action={
          <Button type="button" variant="ghost" size="sm" onClick={suggestPrompt}>
            <Wand2 className="w-3.5 h-3.5 mr-1.5" />
            Sugerir
          </Button>
        }
      >
        <Textarea
          rows={6}
          value={form.system_prompt}
          onChange={(e) => upd('system_prompt', e.target.value)}
          placeholder="Você é uma consultora de TI que conversa de forma casual..."
        />
      </FieldGroup>
    </StepBody>
  );
});
