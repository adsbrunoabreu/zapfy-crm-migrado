import { memo, useMemo, useState, useCallback } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import {
  User, MessageSquare, ListChecks, Calendar, Zap, CheckCircle2,
  ArrowLeft, ArrowRight, Check, Loader2,
} from 'lucide-react';
import { Step1Identity } from './wizard-steps/Step1Identity';
import { Step2Persona } from './wizard-steps/Step2Persona';
import { Step3Qualification } from './wizard-steps/Step3Qualification';
import { Step4Scheduling } from './wizard-steps/Step4Scheduling';
import { Step5Advanced } from './wizard-steps/Step5Advanced';
import { Step6Review } from './wizard-steps/Step6Review';
import type { AgentForm } from './constants';

const STEPS = [
  { n: 1, label: 'Identificação', icon: User, color: 'text-violet' },
  { n: 2, label: 'Persona & Tom', icon: MessageSquare, color: 'text-cyan' },
  { n: 3, label: 'Qualificação', icon: ListChecks, color: 'text-emerald' },
  { n: 4, label: 'Agendamento', icon: Calendar, color: 'text-amber' },
  { n: 5, label: 'Avançado', icon: Zap, color: 'text-rose' },
  { n: 6, label: 'Revisão', icon: CheckCircle2, color: 'text-violet' },
];

interface Props {
  form: AgentForm;
  hasAgent: boolean;
  upd: <K extends keyof AgentForm>(k: K, v: AgentForm[K]) => void;
  addQuestion: () => void;
  editQuestion: (i: number, v: string) => void;
  removeQuestion: (i: number) => void;
  moveQuestion: (i: number, dir: -1 | 1) => void;
  toggleField: (field: string) => void;
  updateDay: (day: string, patch: Partial<{ enabled: boolean; start: string; end: string }>) => void;
  onSwitchToForm: () => void;
  onSave: () => void;
  isSaving: boolean;
}

export const AgentWizard = memo(function AgentWizard(props: Props) {
  const { form, hasAgent, upd, addQuestion, editQuestion, removeQuestion, moveQuestion,
    toggleField, updateDay, onSwitchToForm, onSave, isSaving } = props;
  const [step, setStep] = useState(1);
  const totalSteps = STEPS.length;
  const current = STEPS[step - 1];
  const next = STEPS[step] || null;
  const progress = Math.round((step / totalSteps) * 100);

  const canAdvance =
    (step === 1 ? !!form.name.trim() : true) &&
    (step === 2 ? !!form.system_prompt.trim() : true);

  const greetingPreview = useMemo(() => {
    if (form.tone === 'formal') return `Olá. Eu sou ${form.name || 'seu assistente'}. Em que posso ajudá-lo hoje?`;
    if (form.tone === 'tecnico') return `Oi! Sou ${form.name || 'seu assistente'}. Pode me contar qual desafio técnico você quer resolver?`;
    if (form.tone === 'entusiasta') return `Oi! 🚀 Sou ${form.name || 'seu assistente'} e adoraria te ajudar agora mesmo!`;
    return `Oi! Aqui é ${form.name || 'seu assistente'} 👋 Como posso te ajudar?`;
  }, [form.tone, form.name]);

  const goPrev = useCallback(() => setStep((s) => Math.max(1, s - 1)), []);
  const goNext = useCallback(() => setStep((s) => s + 1), []);

  return (
    <div className="space-y-4">
      <Card className="p-5 border-l-4 border-l-violet">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="min-w-0 flex-1">
            <p className="text-lg font-semibold flex items-center gap-2">
              <span className="text-2xl leading-none">{form.emoji || '🤖'}</span>
              {form.name ? `Configurar ${form.name}` : 'Novo agente'}
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              Passo {step} de {totalSteps} — <span className="text-foreground">{current.label}</span>
            </p>
          </div>
          {hasAgent && (
            <Button variant="ghost" size="sm" onClick={onSwitchToForm}>Pular wizard</Button>
          )}
        </div>
        <Progress value={progress} className="h-1.5 mt-3" />
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-[240px_1fr] gap-4">
        <div className="space-y-4">
          <Card className="p-2">
            <ol className="space-y-0.5">
              {STEPS.map((s) => {
                const done = s.n < step;
                const active = s.n === step;
                const Icon = s.icon;
                return (
                  <li key={s.n}>
                    <button
                      type="button"
                      onClick={() => setStep(s.n)}
                      className={`w-full flex items-center gap-2.5 p-2 rounded-md text-left transition-colors ${
                        active ? 'bg-violet/10 text-foreground' : 'hover:bg-muted/50 text-muted-foreground'
                      }`}
                    >
                      <span
                        className={`w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-semibold shrink-0 ${
                          done ? 'bg-emerald/15 text-emerald'
                            : active ? 'bg-violet/20 text-violet'
                            : 'bg-muted text-muted-foreground'
                        }`}
                      >
                        {done ? <Check className="w-3.5 h-3.5" /> : s.n}
                      </span>
                      <Icon className={`w-3.5 h-3.5 ${active ? s.color : ''}`} />
                      <span className={`text-xs ${active ? 'font-medium' : ''}`}>{s.label}</span>
                    </button>
                  </li>
                );
              })}
            </ol>
          </Card>

          <Card className="p-3 hidden md:block">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-2">Preview</p>
            <div className="flex items-start gap-2">
              <div className="w-8 h-8 rounded-full bg-violet/15 flex items-center justify-center text-base shrink-0">
                {form.emoji || '🤖'}
              </div>
              <div className="min-w-0">
                <p className="text-xs font-medium truncate">{form.name || 'Seu agente'}</p>
                <div className="mt-1 px-2.5 py-1.5 rounded-md rounded-tl-none bg-muted/50 text-xs leading-relaxed">
                  {greetingPreview}
                </div>
              </div>
            </div>
          </Card>
        </div>

        <Card className="p-6 min-h-[420px] flex flex-col">
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-1">
              <current.icon className={`w-4 h-4 ${current.color}`} />
              <h3 className="text-base font-semibold">{current.label}</h3>
            </div>

            {step === 1 && <Step1Identity form={form} upd={upd} />}
            {step === 2 && <Step2Persona form={form} upd={upd} />}
            {step === 3 && (
              <Step3Qualification
                form={form}
                addQuestion={addQuestion}
                editQuestion={editQuestion}
                removeQuestion={removeQuestion}
                moveQuestion={moveQuestion}
                toggleField={toggleField}
              />
            )}
            {step === 4 && <Step4Scheduling form={form} upd={upd} updateDay={updateDay} />}
            {step === 5 && <Step5Advanced form={form} upd={upd} />}
            {step === 6 && <Step6Review form={form} upd={upd} />}
          </div>

          <div className="flex items-center justify-between gap-3 pt-5 mt-5 border-t border-border">
            <Button variant="outline" size="sm" disabled={step === 1} onClick={goPrev}>
              <ArrowLeft className="w-3.5 h-3.5 mr-1.5" />
              Voltar
            </Button>
            {step < totalSteps ? (
              <Button size="sm" onClick={goNext} disabled={!canAdvance}
                title={!canAdvance ? 'Preencha os campos obrigatórios' : ''}>
                Próximo{next ? `: ${next.label}` : ''}
                <ArrowRight className="w-3.5 h-3.5 ml-1.5" />
              </Button>
            ) : (
              <Button size="sm" onClick={onSave} disabled={isSaving}>
                {isSaving ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5 mr-1.5" />}
                Salvar e ativar
              </Button>
            )}
          </div>
        </Card>
      </div>
    </div>
  );
});
