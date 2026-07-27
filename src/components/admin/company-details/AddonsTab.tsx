import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { CurrencyInput } from '@/components/ui/currency-input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Separator } from '@/components/ui/separator';
import { Sparkles, Bot, CheckCircle2, Save } from 'lucide-react';
import { BillingScheduleSection } from './BillingScheduleSection';
import type { useCompanyAddons } from './useCompanyAddons';

type Addons = ReturnType<typeof useCompanyAddons>;

interface Props {
  addons: Addons;
  companyUpdatePending: boolean;
}

export function AddonsTab({ addons, companyUpdatePending }: Props) {
  const {
    automationsEnabled,
    savingAutomations,
    automationsPrice,
    setAutomationsPrice,
    handleToggleAutomations,
    handleSaveAutomationsPrice,
    aiAgentEnabled,
    savingAi,
    addonPrice,
    setAddonPrice,
    addonIncluded,
    setAddonIncluded,
    addonOverage,
    setAddonOverage,
    handleToggleAiAgent,
    handleSaveAddonPricing,
    billingTz,
    setBillingTz,
    billingHour,
    setBillingHour,
    savingSchedule,
    companyBilling,
    handleSaveBillingSchedule,
  } = addons;

  return (
    <>
      {/* Automações */}
      <Card className="p-4 space-y-4">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-lg bg-primary/15 flex items-center justify-center shrink-0">
            <Sparkles className="w-5 h-5 text-primary" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <p className="font-medium">Automações de Atendimento</p>
              <Badge variant="outline" className="text-[10px] border-primary/40 text-primary">
                <Sparkles className="w-2.5 h-2.5 mr-1" />
                Add-on
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Templates de mensagens, fluxos de follow-up e gatilhos automáticos para leads. Acessível em{' '}
              <span className="font-mono">Automações</span>.
            </p>
          </div>
          <Switch
            checked={automationsEnabled}
            disabled={savingAutomations}
            onCheckedChange={handleToggleAutomations}
          />
        </div>
        <Separator />
        <div className="flex items-end gap-3">
          <div className="flex-1">
            <Label className="text-[11px] text-muted-foreground">Mensalidade (R$)</Label>
            <CurrencyInput
              value={Number(String(automationsPrice).replace(',', '.')) || null}
              onValueChange={(v) => setAutomationsPrice(v == null ? '' : String(v))}
              placeholder="97,00"
              className="h-8 text-xs mt-1"
            />
          </div>
          {automationsEnabled && (
            <Button
              size="sm"
              variant="outline"
              onClick={handleSaveAutomationsPrice}
              disabled={savingAutomations}
            >
              <Save className="w-3 h-3 mr-1" /> Salvar preço
            </Button>
          )}
        </div>
        {automationsEnabled && (
          <div className="rounded-md bg-emerald/10 border border-emerald/20 px-2.5 py-1.5 text-[11px] text-emerald">
            <CheckCircle2 className="w-3 h-3 inline mr-1" />
            Ativo. Cliente acessa em <span className="font-mono">Automações</span>.
          </div>
        )}
      </Card>

      {/* Agente IA */}
      <Card className="p-4 space-y-4">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-lg bg-violet/15 flex items-center justify-center shrink-0">
            <Bot className="w-5 h-5 text-violet" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <p className="font-medium">Agente IA de Atendimento</p>
              <Badge variant="outline" className="text-[10px] border-violet/40 text-violet">
                <Sparkles className="w-2.5 h-2.5 mr-1" />
                Add-on
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Permite à empresa configurar agentes de IA para fazer pré-atendimento e qualificação de leads
              via WhatsApp, com transferência automática para humanos.
            </p>
          </div>
          <Switch
            checked={aiAgentEnabled}
            disabled={savingAi || companyUpdatePending}
            onCheckedChange={handleToggleAiAgent}
          />
        </div>
        <Separator />
        <div className="grid grid-cols-3 gap-3">
          <div>
            <Label className="text-[11px] text-muted-foreground">Mensalidade (R$)</Label>
            <CurrencyInput
              value={Number(String(addonPrice).replace(',', '.')) || null}
              onValueChange={(v) => setAddonPrice(v == null ? '' : String(v))}
              placeholder="197,00"
              className="h-8 text-xs mt-1"
            />
          </div>
          <div>
            <Label className="text-[11px] text-muted-foreground">Msgs incluídas/mês</Label>
            <Input
              type="number"
              value={addonIncluded}
              onChange={(e) => setAddonIncluded(e.target.value)}
              placeholder="5000"
              className="h-8 text-xs mt-1"
            />
          </div>
          <div>
            <Label className="text-[11px] text-muted-foreground">R$ por msg excedente</Label>
            <CurrencyInput
              value={Number(String(addonOverage).replace(',', '.')) || null}
              onValueChange={(v) => setAddonOverage(v == null ? '' : String(v))}
              placeholder="0,04"
              className="h-8 text-xs mt-1"
            />
          </div>
        </div>
        {aiAgentEnabled && (
          <div className="flex items-center justify-between gap-2">
            <div className="rounded-md bg-emerald/10 border border-emerald/20 px-2.5 py-1.5 text-[11px] text-emerald flex-1">
              <CheckCircle2 className="w-3 h-3 inline mr-1" />
              Ativo. Cliente acessa em <span className="font-mono">Configurações → Agente IA</span>.
            </div>
            <Button size="sm" variant="outline" onClick={handleSaveAddonPricing} disabled={savingAi}>
              <Save className="w-3 h-3 mr-1" /> Salvar preço
            </Button>
          </div>
        )}
        <p className="text-[10px] text-muted-foreground">
          Os valores são adicionados automaticamente na próxima fatura recorrente do Asaas. Excedente é
          calculado a cada renovação com base nas mensagens consumidas no período.
        </p>

        <Separator />

        <BillingScheduleSection
          tz={billingTz}
          hour={billingHour}
          saving={savingSchedule}
          lastSyncAt={companyBilling?.last_billing_sync_at}
          onTzChange={setBillingTz}
          onHourChange={setBillingHour}
          onSave={handleSaveBillingSchedule}
        />
      </Card>
    </>
  );
}
