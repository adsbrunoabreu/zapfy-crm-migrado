import { memo } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Accordion } from '@/components/ui/accordion';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Bot, MessageSquare, CheckCircle2, Calendar, Settings, Sparkles,
  Plus, Minus, Loader2, Save,
} from 'lucide-react';
import { Section, ToggleRow } from './shared';
import { QuickPromptEditor } from './QuickPromptEditor';
import { TONES, COLLECTABLE_FIELDS, DAYS, type AgentForm } from './constants';

interface Props {
  form: AgentForm;
  agentId: string | undefined;
  isSaving: boolean;
  upd: <K extends keyof AgentForm>(k: K, v: AgentForm[K]) => void;
  addQuestion: () => void;
  editQuestion: (i: number, v: string) => void;
  removeQuestion: (i: number) => void;
  toggleField: (field: string) => void;
  updateDay: (day: string, patch: Partial<{ enabled: boolean; start: string; end: string }>) => void;
  onSave: () => void;
  onOpenWizard: () => void;
  onPromptSaved: () => void;
}

export const AgentFormView = memo(function AgentFormView(props: Props) {
  const { form, agentId, isSaving, upd, addQuestion, editQuestion, removeQuestion,
    toggleField, updateDay, onSave, onOpenWizard, onPromptSaved } = props;

  return (
    <div className="space-y-3">
      <QuickPromptEditor
        agentId={agentId}
        value={form.system_prompt}
        onChange={(v) => upd('system_prompt', v)}
        onSaved={onPromptSaved}
      />

      <Card className="p-3 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Settings className="w-3.5 h-3.5" />
          Configuração avançada por seções
        </div>
        <Button variant="outline" size="sm" onClick={onOpenWizard}>
          <Sparkles className="w-3.5 h-3.5 mr-1.5" />
          Reabrir wizard
        </Button>
      </Card>

      <Accordion type="multiple" defaultValue={['identity', 'persona']} className="space-y-2">
        <Section value="identity" icon={<Bot className="w-3.5 h-3.5" />} label="Identificação">
          <div className="grid grid-cols-[1fr_auto] gap-3">
            <div className="space-y-1.5">
              <Label>Nome</Label>
              <Input value={form.name} onChange={(e) => upd('name', e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Emoji</Label>
              <Input value={form.emoji || ''} onChange={(e) => upd('emoji', e.target.value.slice(0, 4))}
                className="text-center text-lg w-20" />
            </div>
          </div>
          <div className="flex items-center justify-between pt-2">
            <ToggleRow label="Agente ativo" checked={form.is_active} onChange={(v) => upd('is_active', v)} />
          </div>
        </Section>

        <Section value="persona" icon={<MessageSquare className="w-3.5 h-3.5" />} label="Persona & Tom">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            {TONES.map((t) => (
              <button
                key={t.value}
                type="button"
                onClick={() => upd('tone', t.value)}
                className={`text-left p-2.5 rounded-md border transition-colors ${
                  form.tone === t.value ? 'bg-violet/10 border-violet/40' : 'hover:bg-muted/40 border-border'
                }`}
              >
                <p className="text-xs font-medium">{t.label}</p>
                <p className="text-[10px] text-muted-foreground mt-0.5">{t.desc}</p>
              </button>
            ))}
          </div>
          <div className="space-y-1.5">
            <Label>Persona</Label>
            <Input value={form.persona} onChange={(e) => upd('persona', e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>System prompt</Label>
            <Textarea rows={5} value={form.system_prompt} onChange={(e) => upd('system_prompt', e.target.value)} />
          </div>
        </Section>

        <Section value="qual" icon={<CheckCircle2 className="w-3.5 h-3.5" />} label="Qualificação">
          <div className="space-y-2">
            <Label>Perguntas para o cliente</Label>
            {(form.qualification_questions || []).map((q, i) => (
              <div key={i} className="flex items-center gap-2">
                <Input value={q} onChange={(e) => editQuestion(i, e.target.value)} />
                <Button size="icon" variant="ghost" onClick={() => removeQuestion(i)}>
                  <Minus className="w-4 h-4" />
                </Button>
              </div>
            ))}
            <Button size="sm" variant="outline" onClick={addQuestion}>
              <Plus className="w-3.5 h-3.5 mr-1.5" />
              Adicionar
            </Button>
          </div>
          <div className="space-y-2 pt-2">
            <Label>Campos a extrair</Label>
            <div className="grid grid-cols-3 md:grid-cols-4 gap-1.5">
              {COLLECTABLE_FIELDS.map((field) => {
                const checked = form.collect_fields.includes(field);
                return (
                  <label
                    key={field}
                    className={`flex items-center gap-2 text-xs p-2 rounded border cursor-pointer hover:bg-muted/40 ${
                      checked ? 'border-violet/40 bg-violet/5' : 'border-border'
                    }`}
                  >
                    <input type="checkbox" className="accent-violet" checked={checked} onChange={() => toggleField(field)} />
                    <span className="capitalize">{field.replace('_', ' ')}</span>
                  </label>
                );
              })}
            </div>
          </div>
        </Section>

        <Section value="schedule" icon={<Calendar className="w-3.5 h-3.5" />} label="Agendamento">
          <ToggleRow label="Habilitar agendamento" checked={form.offer_scheduling} onChange={(v) => upd('offer_scheduling', v)} />
          {form.offer_scheduling && (
            <>
              <div className="space-y-1.5">
                <Label>Quando oferecer</Label>
                <Select value={form.offer_timing} onValueChange={(v) => upd('offer_timing', v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="always">Sempre</SelectItem>
                    <SelectItem value="qualified">Se qualificado</SelectItem>
                    <SelectItem value="on_request">Só se pedir</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Horários disponíveis</Label>
                <div className="space-y-1.5">
                  {DAYS.map((d) => {
                    const cfg = form.available_hours[d.key] || { enabled: false, start: '09:00', end: '18:00' };
                    return (
                      <div key={d.key} className="flex items-center gap-2 p-2 rounded border border-border">
                        <Switch checked={cfg.enabled} onCheckedChange={(v) => updateDay(d.key, { enabled: v })} />
                        <span className="text-xs w-20">{d.label}</span>
                        <Input type="time" value={cfg.start} disabled={!cfg.enabled}
                          onChange={(e) => updateDay(d.key, { start: e.target.value })} className="h-8 w-28 text-xs" />
                        <span className="text-xs text-muted-foreground">até</span>
                        <Input type="time" value={cfg.end} disabled={!cfg.enabled}
                          onChange={(e) => updateDay(d.key, { end: e.target.value })} className="h-8 w-28 text-xs" />
                      </div>
                    );
                  })}
                </div>
              </div>
              <ToggleRow label="Confirmação automática via WhatsApp" checked={form.auto_confirmation} onChange={(v) => upd('auto_confirmation', v)} />
              <ToggleRow label="Enviar lembrete antes do horário" checked={form.reminder_enabled} onChange={(v) => upd('reminder_enabled', v)} />
              <ToggleRow label="Enviar cupom se não confirmar em 24h" checked={form.send_discount_coupon} onChange={(v) => upd('send_discount_coupon', v)} />
            </>
          )}
        </Section>

        <Section value="advanced" icon={<Settings className="w-3.5 h-3.5" />} label="Comportamento avançado">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Máx. turnos</Label>
              <Input type="number" min={3} max={50} value={form.max_turns}
                onChange={(e) => upd('max_turns', Number(e.target.value))} />
            </div>
            <div className="space-y-1.5">
              <Label>Atraso (ms)</Label>
              <Input type="number" min={0} max={10000} step={100} value={form.response_delay_ms}
                onChange={(e) => upd('response_delay_ms', Number(e.target.value))} />
            </div>
            <div className="space-y-1.5">
              <Label>Debounce (s)</Label>
              <Input type="number" min={0} max={60} value={form.debounce_seconds}
                onChange={(e) => upd('debounce_seconds', Number(e.target.value))} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Palavras-chave para transferir</Label>
            <Textarea rows={2}
              value={form.handoff_keywords.join(', ')}
              onChange={(e) => upd('handoff_keywords', e.target.value.split(',').map((s) => s.trim()).filter(Boolean))} />
          </div>
          <ToggleRow label="Detectar sentimento negativo" checked={form.detect_negative_sentiment} onChange={(v) => upd('detect_negative_sentiment', v)} />
          <ToggleRow label="Apenas em horário comercial" checked={form.business_hours_only} onChange={(v) => upd('business_hours_only', v)} />
        </Section>
      </Accordion>

      <div className="sticky bottom-0 bg-background/95 backdrop-blur-sm border-t border-border py-3 -mx-1 px-1 z-10">
        <Button onClick={onSave} disabled={isSaving} className="w-full">
          {isSaving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
          Salvar configuração
        </Button>
      </div>
    </div>
  );
});
