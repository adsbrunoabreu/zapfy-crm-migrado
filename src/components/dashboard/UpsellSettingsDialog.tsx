import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Slider } from '@/components/ui/slider';
import { Separator } from '@/components/ui/separator';
import {
  DEFAULT_UPSELL_CONFIG, type UpsellConfig, type UpsellWeights,
} from '@/lib/upsellScoring';

const FACTOR_META: { key: keyof UpsellWeights; label: string; help: string }[] = [
  { key: 'leadsSaturation',    label: 'Saturação de leads',     help: '% do limite de leads do plano consumido' },
  { key: 'leadsGrowth',        label: 'Crescimento de leads',   help: 'Aumento vs período anterior' },
  { key: 'whatsappSaturation', label: 'Saturação WhatsApp',     help: 'Instâncias usadas / limite do plano' },
  { key: 'pipelineActivity',   label: 'Pipeline aquecido',      help: 'Leads em estágios avançados' },
  { key: 'highEngagement',     label: 'Alto engajamento',       help: 'Mensagens muito acima da média' },
  { key: 'planUnderpriced',    label: 'Ticket abaixo do alvo',  help: 'Gap de receita vs plano-alvo' },
];

export function UpsellSettingsDialog({
  open, onOpenChange, value, onChange, onReset,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  value: UpsellConfig;
  onChange: (cfg: UpsellConfig) => void;
  onReset: () => void;
}) {
  const [draft, setDraft] = useState<UpsellConfig>(value);

  const handleOpenChange = (o: boolean) => {
    if (o) setDraft(value);
    onOpenChange(o);
  };

  const setWeight = (k: keyof UpsellWeights, v: number) =>
    setDraft(d => ({ ...d, weights: { ...d.weights, [k]: v } }));
  const setEnabled = (k: keyof UpsellWeights, v: boolean) =>
    setDraft(d => ({ ...d, enabled: { ...d.enabled, [k]: v } }));
  const setThreshold = (k: keyof UpsellConfig['thresholds'], v: number) =>
    setDraft(d => ({ ...d, thresholds: { ...d.thresholds, [k]: v } }));

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-hidden flex flex-col">
        <DialogHeader className="shrink-0">
          <DialogTitle>Configurar detecção de Upsell</DialogTitle>
          <DialogDescription>
            Ajuste pesos e limites dos sinais. O score é normalizado de 0 a 100.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain space-y-6 py-2 -mx-1 px-1">
          <section>
            <h3 className="text-sm font-semibold mb-3">Sinais e pesos</h3>
            <div className="space-y-4">
              {FACTOR_META.map(({ key, label, help }) => (
                <div key={key} className="grid grid-cols-[1fr_auto] gap-3 items-center">
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <Label className="text-sm font-medium">{label}</Label>
                      <span className="text-xs tabular-nums text-muted-foreground">peso {draft.weights[key]}</span>
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

          <section>
            <h3 className="text-sm font-semibold mb-3">Limites</h3>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label className="text-xs">Saturação · alerta (%)</Label>
                <Input type="number" min={0} max={100} value={draft.thresholds.saturationWarn}
                  onChange={(e) => setThreshold('saturationWarn', Number(e.target.value))} />
              </div>
              <div>
                <Label className="text-xs">Saturação · crítico (%)</Label>
                <Input type="number" min={0} max={200} value={draft.thresholds.saturationCrit}
                  onChange={(e) => setThreshold('saturationCrit', Number(e.target.value))} />
              </div>
              <div>
                <Label className="text-xs">Crescimento leads · alerta (%)</Label>
                <Input type="number" min={0} value={draft.thresholds.leadsGrowthWarn}
                  onChange={(e) => setThreshold('leadsGrowthWarn', Number(e.target.value))} />
              </div>
              <div>
                <Label className="text-xs">Crescimento leads · crítico (%)</Label>
                <Input type="number" min={0} value={draft.thresholds.leadsGrowthCrit}
                  onChange={(e) => setThreshold('leadsGrowthCrit', Number(e.target.value))} />
              </div>
              <div>
                <Label className="text-xs">Engajamento · multiplicador alerta</Label>
                <Input type="number" min={1} step={0.5} value={draft.thresholds.engagementMultiplierWarn}
                  onChange={(e) => setThreshold('engagementMultiplierWarn', Number(e.target.value))} />
              </div>
              <div>
                <Label className="text-xs">Engajamento · multiplicador crítico</Label>
                <Input type="number" min={1} step={0.5} value={draft.thresholds.engagementMultiplierCrit}
                  onChange={(e) => setThreshold('engagementMultiplierCrit', Number(e.target.value))} />
              </div>
              <div>
                <Label className="text-xs">Mín. leads no período (sinal)</Label>
                <Input type="number" min={0} value={draft.thresholds.minLeadsForSignal}
                  onChange={(e) => setThreshold('minLeadsForSignal', Number(e.target.value))} />
              </div>
            </div>
          </section>

          <Separator />

          <section>
            <h3 className="text-sm font-semibold mb-3">Classificação por score</h3>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label className="text-xs">Score mínimo · Warm</Label>
                <Input type="number" min={0} max={100} value={draft.thresholds.warmScore}
                  onChange={(e) => setThreshold('warmScore', Number(e.target.value))} />
              </div>
              <div>
                <Label className="text-xs">Score mínimo · Hot</Label>
                <Input type="number" min={0} max={100} value={draft.thresholds.hotScore}
                  onChange={(e) => setThreshold('hotScore', Number(e.target.value))} />
              </div>
            </div>
          </section>
        </div>

        <DialogFooter className="shrink-0 gap-2 sm:gap-0">
          <Button variant="ghost" onClick={() => { onReset(); setDraft(DEFAULT_UPSELL_CONFIG); }}>
            Restaurar padrão
          </Button>
          <Button variant="outline" onClick={() => handleOpenChange(false)}>Cancelar</Button>
          <Button onClick={() => { onChange(draft); onOpenChange(false); }}>Salvar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
