import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Slider } from '@/components/ui/slider';
import { Separator } from '@/components/ui/separator';
import {
  DEFAULT_AT_RISK_CONFIG, type AtRiskConfig, type AtRiskWeights,
} from '@/lib/atRiskScoring';

const FACTOR_META: { key: keyof AtRiskWeights; label: string; help: string }[] = [
  { key: 'inactivity',    label: 'Inatividade',           help: 'Tempo sem novos leads' },
  { key: 'leadsDrop',     label: 'Queda de leads',        help: 'Volume vs período anterior' },
  { key: 'revenueDrop',   label: 'Queda de MRR',          help: 'Downgrade ou cancelamento parcial' },
  { key: 'paymentIssue',  label: 'Pagamento em atraso',   help: 'past_due / suspended' },
  { key: 'churnSignal',   label: 'Sinal de churn',        help: 'Cancelamento nos últimos 30d' },
  { key: 'lowEngagement', label: 'Baixo engajamento',     help: 'Mensagens abaixo da média' },
];

export function AtRiskSettingsDialog({
  open, onOpenChange, value, onChange, onReset,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  value: AtRiskConfig;
  onChange: (cfg: AtRiskConfig) => void;
  onReset: () => void;
}) {
  const [draft, setDraft] = useState<AtRiskConfig>(value);

  // Reset local draft sempre que reabrir
  const handleOpenChange = (o: boolean) => {
    if (o) setDraft(value);
    onOpenChange(o);
  };

  const setWeight = (k: keyof AtRiskWeights, v: number) =>
    setDraft(d => ({ ...d, weights: { ...d.weights, [k]: v } }));
  const setEnabled = (k: keyof AtRiskWeights, v: boolean) =>
    setDraft(d => ({ ...d, enabled: { ...d.enabled, [k]: v } }));
  const setThreshold = (k: keyof AtRiskConfig['thresholds'], v: number) =>
    setDraft(d => ({ ...d, thresholds: { ...d.thresholds, [k]: v } }));

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-hidden flex flex-col">
        <DialogHeader className="shrink-0">
          <DialogTitle>Configurar scoring At-Risk</DialogTitle>
          <DialogDescription>
            Ajuste os pesos de cada fator e os limites para classificar contas como risco médio ou alto.
            O score é normalizado de 0 a 100.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain space-y-6 py-2 -mx-1 px-1">
          {/* Pesos */}
          <section>
            <h3 className="text-sm font-semibold mb-3">Fatores e pesos</h3>
            <div className="space-y-4">
              {FACTOR_META.map(({ key, label, help }) => (
                <div key={key} className="grid grid-cols-[1fr_auto] gap-3 items-center">
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <Label className="text-sm font-medium">{label}</Label>
                      <span className="text-xs tabular-nums text-muted-foreground">
                        peso {draft.weights[key]}
                      </span>
                    </div>
                    <p className="text-[11px] text-muted-foreground mb-2">{help}</p>
                    <Slider
                      value={[draft.weights[key]]}
                      onValueChange={([v]) => setWeight(key, v)}
                      min={0} max={50} step={5}
                      disabled={!draft.enabled[key]}
                    />
                  </div>
                  <Switch
                    checked={draft.enabled[key]}
                    onCheckedChange={(v) => setEnabled(key, v)}
                    aria-label={`Ativar ${label}`}
                  />
                </div>
              ))}
            </div>
          </section>

          <Separator />

          {/* Thresholds */}
          <section>
            <h3 className="text-sm font-semibold mb-3">Limites</h3>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label className="text-xs">Inatividade — alerta (dias)</Label>
                <Input type="number" min={1} value={draft.thresholds.inactivityDaysWarn}
                  onChange={(e) => setThreshold('inactivityDaysWarn', Number(e.target.value))} />
              </div>
              <div>
                <Label className="text-xs">Inatividade — crítico (dias)</Label>
                <Input type="number" min={1} value={draft.thresholds.inactivityDaysCrit}
                  onChange={(e) => setThreshold('inactivityDaysCrit', Number(e.target.value))} />
              </div>
              <div>
                <Label className="text-xs">Queda de leads — alerta (%)</Label>
                <Input type="number" min={0} max={100} value={draft.thresholds.leadsDropPctWarn}
                  onChange={(e) => setThreshold('leadsDropPctWarn', Number(e.target.value))} />
              </div>
              <div>
                <Label className="text-xs">Queda de leads — crítico (%)</Label>
                <Input type="number" min={0} max={100} value={draft.thresholds.leadsDropPctCrit}
                  onChange={(e) => setThreshold('leadsDropPctCrit', Number(e.target.value))} />
              </div>
              <div>
                <Label className="text-xs">Queda MRR — alerta (%)</Label>
                <Input type="number" min={0} max={100} value={draft.thresholds.revenueDropPctWarn}
                  onChange={(e) => setThreshold('revenueDropPctWarn', Number(e.target.value))} />
              </div>
              <div>
                <Label className="text-xs">Queda MRR — crítico (%)</Label>
                <Input type="number" min={0} max={100} value={draft.thresholds.revenueDropPctCrit}
                  onChange={(e) => setThreshold('revenueDropPctCrit', Number(e.target.value))} />
              </div>
              <div>
                <Label className="text-xs">Mín. leads no período anterior (queda)</Label>
                <Input type="number" min={0} value={draft.thresholds.minLeadsPrevForDrop}
                  onChange={(e) => setThreshold('minLeadsPrevForDrop', Number(e.target.value))} />
              </div>
            </div>
          </section>

          <Separator />

          {/* Severidade */}
          <section>
            <h3 className="text-sm font-semibold mb-3">Classificação por score</h3>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label className="text-xs">Score mínimo · Médio</Label>
                <Input type="number" min={0} max={100} value={draft.thresholds.mediumScore}
                  onChange={(e) => setThreshold('mediumScore', Number(e.target.value))} />
              </div>
              <div>
                <Label className="text-xs">Score mínimo · Alto</Label>
                <Input type="number" min={0} max={100} value={draft.thresholds.highScore}
                  onChange={(e) => setThreshold('highScore', Number(e.target.value))} />
              </div>
            </div>
          </section>
        </div>

        <DialogFooter className="shrink-0 gap-2 sm:gap-0">
          <Button variant="ghost" onClick={() => { onReset(); setDraft(DEFAULT_AT_RISK_CONFIG); }}>
            Restaurar padrão
          </Button>
          <Button variant="outline" onClick={() => handleOpenChange(false)}>Cancelar</Button>
          <Button onClick={() => { onChange(draft); onOpenChange(false); }}>
            Salvar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
