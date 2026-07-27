import { memo } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Plus, Minus, ChevronUp, ChevronDown, Check } from 'lucide-react';
import { StepBody, FieldGroup } from '../shared';
import { COLLECTABLE_FIELDS, type AgentForm } from '../constants';

interface Props {
  form: AgentForm;
  addQuestion: () => void;
  editQuestion: (i: number, v: string) => void;
  removeQuestion: (i: number) => void;
  moveQuestion: (i: number, dir: -1 | 1) => void;
  toggleField: (field: string) => void;
}

export const Step3Qualification = memo(function Step3Qualification({
  form, addQuestion, editQuestion, removeQuestion, moveQuestion, toggleField,
}: Props) {
  return (
    <StepBody desc="Perguntas e dados que o agente vai coletar antes de transferir.">
      <FieldGroup label="Perguntas para o cliente">
        <div className="space-y-1.5">
          {(form.qualification_questions || []).length === 0 && (
            <p className="text-xs text-muted-foreground italic">Nenhuma pergunta. Adicione abaixo.</p>
          )}
          {(form.qualification_questions || []).map((q, i, arr) => (
            <div key={i} className="flex items-center gap-1.5">
              <span className="text-[11px] text-muted-foreground w-5 text-right">{i + 1}.</span>
              <Input value={q} onChange={(e) => editQuestion(i, e.target.value)} placeholder={`Pergunta ${i + 1}`} />
              <Button size="icon" variant="ghost" onClick={() => moveQuestion(i, -1)} disabled={i === 0}>
                <ChevronUp className="w-3.5 h-3.5" />
              </Button>
              <Button size="icon" variant="ghost" onClick={() => moveQuestion(i, 1)} disabled={i === arr.length - 1}>
                <ChevronDown className="w-3.5 h-3.5" />
              </Button>
              <Button size="icon" variant="ghost" onClick={() => removeQuestion(i)}>
                <Minus className="w-4 h-4" />
              </Button>
            </div>
          ))}
          <Button size="sm" variant="outline" onClick={addQuestion} className="mt-1">
            <Plus className="w-3.5 h-3.5 mr-1.5" />
            Adicionar pergunta
          </Button>
        </div>
      </FieldGroup>
      <FieldGroup label="Campos a extrair do lead" hint="Toque para selecionar.">
        <div className="flex flex-wrap gap-1.5">
          {COLLECTABLE_FIELDS.map((field) => {
            const checked = form.collect_fields.includes(field);
            return (
              <button
                key={field}
                type="button"
                onClick={() => toggleField(field)}
                className={`px-3 py-1.5 rounded-full border text-xs transition-colors ${
                  checked ? 'bg-violet/15 border-violet/50 text-foreground'
                    : 'border-border text-muted-foreground hover:border-border/80'
                }`}
              >
                {checked && <Check className="w-3 h-3 inline mr-1" />}
                <span className="capitalize">{field.replace('_', ' ')}</span>
              </button>
            );
          })}
        </div>
      </FieldGroup>
    </StepBody>
  );
});
