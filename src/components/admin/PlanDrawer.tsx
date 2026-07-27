import { useEffect, useState } from 'react';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { CurrencyInput } from '@/components/ui/currency-input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Loader2, Plus, X, Package } from 'lucide-react';
import { useCreatePlan, useUpdatePlan, type SubscriptionPlan } from '@/hooks/useSubscriptionPlans';
import { useToast } from '@/hooks/use-toast';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  plan: SubscriptionPlan | null;
}

const empty = {
  name: '',
  description: '',
  monthly_price: '0',
  yearly_price: '0',
  max_users: '',
  max_leads: '',
  max_whatsapp_instances: '',
  is_active: true,
  is_featured: false,
  display_order: '0',
};

export function PlanDrawer({ open, onOpenChange, plan }: Props) {
  const { toast } = useToast();
  const create = useCreatePlan();
  const update = useUpdatePlan();
  const [form, setForm] = useState(empty);
  const [features, setFeatures] = useState<string[]>([]);
  const [newFeature, setNewFeature] = useState('');

  useEffect(() => {
    if (plan) {
      setForm({
        name: plan.name,
        description: plan.description || '',
        monthly_price: String(plan.monthly_price),
        yearly_price: String(plan.yearly_price),
        max_users: plan.max_users?.toString() || '',
        max_leads: plan.max_leads?.toString() || '',
        max_whatsapp_instances: plan.max_whatsapp_instances?.toString() || '',
        is_active: plan.is_active,
        is_featured: plan.is_featured ?? false,
        display_order: String(plan.display_order),
      });
      setFeatures(plan.features || []);
    } else {
      setForm(empty);
      setFeatures([]);
    }
    setNewFeature('');
  }, [plan, open]);

  const addFeature = () => {
    const v = newFeature.trim();
    if (!v) return;
    setFeatures([...features, v]);
    setNewFeature('');
  };

  const handleSave = async () => {
    if (!form.name.trim()) {
      toast({ title: 'Nome é obrigatório', variant: 'destructive' });
      return;
    }
    const payload = {
      name: form.name.trim(),
      description: form.description.trim() || null,
      monthly_price: parseFloat(form.monthly_price.replace(',', '.')) || 0,
      yearly_price: parseFloat(form.yearly_price.replace(',', '.')) || 0,
      max_users: form.max_users ? parseInt(form.max_users, 10) : null,
      max_leads: form.max_leads ? parseInt(form.max_leads, 10) : null,
      max_whatsapp_instances: form.max_whatsapp_instances ? parseInt(form.max_whatsapp_instances, 10) : null,
      features,
      is_active: form.is_active,
      is_featured: form.is_featured,
      display_order: parseInt(form.display_order, 10) || 0,
    };
    try {
      if (plan) {
        await update.mutateAsync({ id: plan.id, ...payload });
        toast({ title: 'Plano atualizado' });
      } else {
        await create.mutateAsync(payload);
        toast({ title: 'Plano criado' });
      }
      onOpenChange(false);
    } catch (err: any) {
      toast({ title: 'Erro ao salvar', description: err.message, variant: 'destructive' });
    }
  };

  const isPending = create.isPending || update.isPending;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-xl h-[100dvh] overflow-hidden p-0 flex flex-col">
        <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain">
          <div className="p-6 flex flex-col gap-4">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <Package className="w-5 h-5 text-primary" />
            {plan ? 'Editar plano' : 'Novo plano'}
          </SheetTitle>
          <SheetDescription>Defina preços, limites e recursos do plano.</SheetDescription>
        </SheetHeader>

        <div className="space-y-5 py-6">
          <div className="space-y-2">
            <Label>Nome do plano *</Label>
            <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Pro" />
          </div>

          <div className="space-y-2">
            <Label>Descrição</Label>
            <Textarea
              rows={2}
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              placeholder="Para equipes em crescimento..."
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Preço mensal (R$)</Label>
              <CurrencyInput
                value={Number(String(form.monthly_price).replace(',', '.')) || null}
                onValueChange={(v) => setForm({ ...form, monthly_price: v == null ? '' : String(v) })}
                placeholder="0,00"
              />
            </div>
            <div className="space-y-2">
              <Label>Preço anual (R$)</Label>
              <CurrencyInput
                value={Number(String(form.yearly_price).replace(',', '.')) || null}
                onValueChange={(v) => setForm({ ...form, yearly_price: v == null ? '' : String(v) })}
                placeholder="0,00"
              />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-2">
              <Label className="text-xs">Máx usuários</Label>
              <Input type="number" placeholder="∞" value={form.max_users}
                onChange={(e) => setForm({ ...form, max_users: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label className="text-xs">Máx leads</Label>
              <Input type="number" placeholder="∞" value={form.max_leads}
                onChange={(e) => setForm({ ...form, max_leads: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label className="text-xs">Máx WhatsApp</Label>
              <Input type="number" placeholder="∞" value={form.max_whatsapp_instances}
                onChange={(e) => setForm({ ...form, max_whatsapp_instances: e.target.value })} />
            </div>
          </div>

          <div className="space-y-2">
            <Label>Recursos (features)</Label>
            <div className="flex gap-2">
              <Input
                value={newFeature}
                onChange={(e) => setNewFeature(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addFeature())}
                placeholder="Ex: Pipelines ilimitados"
              />
              <Button type="button" variant="outline" size="icon" onClick={addFeature}>
                <Plus className="w-4 h-4" />
              </Button>
            </div>
            {features.length > 0 && (
              <ul className="space-y-1 mt-2">
                {features.map((f, i) => (
                  <li key={i} className="flex items-center justify-between text-sm bg-secondary/30 rounded px-3 py-1.5">
                    <span>{f}</span>
                    <button onClick={() => setFeatures(features.filter((_, idx) => idx !== i))}
                      className="text-muted-foreground hover:text-destructive">
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3 items-end">
            <div className="space-y-2">
              <Label>Ordem de exibição</Label>
              <Input type="number" value={form.display_order}
                onChange={(e) => setForm({ ...form, display_order: e.target.value })} />
            </div>
            <div className="flex items-center justify-between rounded-lg border border-border p-3">
              <Label htmlFor="active" className="cursor-pointer">Plano ativo</Label>
              <Switch id="active" checked={form.is_active}
                onCheckedChange={(v) => setForm({ ...form, is_active: v })} />
            </div>
          </div>

          <div className="flex items-center justify-between rounded-lg border border-border p-3">
            <div>
              <Label htmlFor="featured" className="cursor-pointer">Destacar como recomendado na landing</Label>
              <p className="text-xs text-muted-foreground mt-0.5">
                Apenas um plano pode estar destacado por vez.
              </p>
            </div>
            <Switch id="featured" checked={form.is_featured}
              onCheckedChange={(v) => setForm({ ...form, is_featured: v })} />
          </div>

          <Button onClick={handleSave} disabled={isPending} className="w-full">
            {isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            {plan ? 'Salvar alterações' : 'Criar plano'}
          </Button>
        </div>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
