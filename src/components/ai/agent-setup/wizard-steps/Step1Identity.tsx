import { memo } from 'react';
import { Input } from '@/components/ui/input';
import { StepBody, FieldGroup } from '../shared';
import type { AgentForm } from '../constants';

interface Props {
  form: AgentForm;
  upd: <K extends keyof AgentForm>(k: K, v: AgentForm[K]) => void;
}

export const Step1Identity = memo(function Step1Identity({ form, upd }: Props) {
  return (
    <StepBody desc="Como o agente vai se apresentar para os leads.">
      <FieldGroup label="Nome do agente" hint="Aparece no chat como remetente.">
        <Input
          value={form.name}
          onChange={(e) => upd('name', e.target.value)}
          placeholder="Ex: Ana, Bot, Assistente"
          className="h-11 text-base"
        />
      </FieldGroup>
      <FieldGroup label="Emoji" hint="Personaliza o avatar do agente.">
        <div className="flex flex-wrap gap-1.5">
          {['🤖','✨','💬','🎯','💡','🚀','🌟','🛟','📞','🧠','💼','🪄'].map((e) => (
            <button
              key={e}
              type="button"
              onClick={() => upd('emoji', e)}
              className={`w-10 h-10 rounded-md border text-lg flex items-center justify-center transition-colors ${
                form.emoji === e ? 'border-violet bg-violet/10' : 'border-border hover:bg-muted/50'
              }`}
            >
              {e}
            </button>
          ))}
          <Input
            value={form.emoji || ''}
            onChange={(ev) => upd('emoji', ev.target.value.slice(0, 4))}
            placeholder="✏️"
            className="w-16 h-10 text-center text-lg"
          />
        </div>
      </FieldGroup>
    </StepBody>
  );
});
