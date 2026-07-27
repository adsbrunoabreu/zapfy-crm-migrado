import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Plus, Trash2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface Coupon {
  id: string;
  code: string;
  description: string | null;
  discount_type: 'percent' | 'fixed';
  discount_value: number;
  min_order_value: number | null;
  max_uses: number | null;
  uses_count: number;
  is_active: boolean;
  agent_can_offer: boolean;
}

export function StoreCouponsTab({ companyId, storeIntegrationId }: { companyId: string; storeIntegrationId: string }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);

  const { data: coupons = [] } = useQuery({
    queryKey: ['store-coupons', companyId],
    queryFn: async () => {
      const { data } = await supabase
        .from('store_coupons' as never)
        .select('id, code, description, discount_type, discount_value, min_order_value, max_uses, uses_count, is_active, agent_can_offer')
        .eq('company_id', companyId)
        .order('created_at', { ascending: false });
      return (data ?? []) as Coupon[];
    },
  });

  const toggleMut = useMutation({
    mutationFn: async ({ id, field, value }: { id: string; field: 'is_active' | 'agent_can_offer'; value: boolean }) => {
      const { error } = await supabase.from('store_coupons' as never).update({ [field]: value } as never).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['store-coupons'] }),
  });

  const delMut = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('store_coupons' as never).delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success('Cupom removido');
      qc.invalidateQueries({ queryKey: ['store-coupons'] });
    },
  });

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <p className="text-sm text-muted-foreground">
          Cupons que o Agente IA pode oferecer no WhatsApp quando fizer sentido fechar a venda.
        </p>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button size="sm"><Plus className="w-4 h-4 mr-2" />Novo cupom</Button>
          </DialogTrigger>
          <CouponFormDialog
            companyId={companyId}
            storeIntegrationId={storeIntegrationId}
            onSuccess={() => { setOpen(false); qc.invalidateQueries({ queryKey: ['store-coupons'] }); }}
          />
        </Dialog>
      </div>

      <Card className="divide-y divide-border">
        {coupons.map((c) => (
          <div key={c.id} className="p-4 flex items-center justify-between gap-4">
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <code className="text-sm font-mono font-semibold">{c.code}</code>
                <Badge variant={c.is_active ? 'default' : 'secondary'}>{c.is_active ? 'Ativo' : 'Inativo'}</Badge>
                {c.agent_can_offer && <Badge variant="outline">IA pode oferecer</Badge>}
              </div>
              <div className="text-xs text-muted-foreground mt-1">
                {c.discount_type === 'percent' ? `${c.discount_value}% off` : `R$ ${c.discount_value} off`}
                {c.min_order_value ? ` • mínimo R$ ${c.min_order_value}` : ''}
                {c.max_uses ? ` • ${c.uses_count}/${c.max_uses} usos` : ` • ${c.uses_count} usos`}
              </div>
              {c.description && <div className="text-xs text-muted-foreground mt-1">{c.description}</div>}
            </div>
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2">
                <Label htmlFor={`active-${c.id}`} className="text-xs">Ativo</Label>
                <Switch id={`active-${c.id}`} checked={c.is_active}
                  onCheckedChange={(v) => toggleMut.mutate({ id: c.id, field: 'is_active', value: v })} />
              </div>
              <div className="flex items-center gap-2">
                <Label htmlFor={`agent-${c.id}`} className="text-xs">IA</Label>
                <Switch id={`agent-${c.id}`} checked={c.agent_can_offer}
                  onCheckedChange={(v) => toggleMut.mutate({ id: c.id, field: 'agent_can_offer', value: v })} />
              </div>
              <Button variant="ghost" size="icon" onClick={() => { if (confirm(`Remover cupom ${c.code}?`)) delMut.mutate(c.id); }}>
                <Trash2 className="w-4 h-4" />
              </Button>
            </div>
          </div>
        ))}
        {coupons.length === 0 && (
          <div className="p-8 text-sm text-muted-foreground text-center">Nenhum cupom cadastrado.</div>
        )}
      </Card>
    </div>
  );
}

function CouponFormDialog({
  companyId, storeIntegrationId, onSuccess,
}: { companyId: string; storeIntegrationId: string; onSuccess: () => void }) {
  const [code, setCode] = useState('');
  const [description, setDescription] = useState('');
  const [discountType, setDiscountType] = useState<'percent' | 'fixed'>('percent');
  const [discountValue, setDiscountValue] = useState('5');
  const [minOrder, setMinOrder] = useState('');
  const [maxUses, setMaxUses] = useState('');

  const mut = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from('store_coupons' as never).insert({
        company_id: companyId,
        store_integration_id: storeIntegrationId,
        code: code.trim().toUpperCase(),
        description: description.trim() || null,
        discount_type: discountType,
        discount_value: Number(discountValue) || 0,
        min_order_value: minOrder ? Number(minOrder) : null,
        max_uses: maxUses ? Number(maxUses) : null,
      } as never);
      if (error) throw error;
    },
    onSuccess: () => { toast.success('Cupom criado'); onSuccess(); },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <DialogContent className="sm:max-w-md">
      <DialogHeader><DialogTitle>Novo cupom</DialogTitle></DialogHeader>
      <div className="space-y-3">
        <div>
          <Label htmlFor="code">Código</Label>
          <Input id="code" value={code} onChange={(e) => setCode(e.target.value)} placeholder="BEMVINDO10" />
          <p className="text-xs text-muted-foreground mt-1">Deve corresponder a um cupom existente na Shopify.</p>
        </div>
        <div>
          <Label htmlFor="desc">Descrição</Label>
          <Input id="desc" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="10% para primeira compra" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label>Tipo</Label>
            <Select value={discountType} onValueChange={(v) => setDiscountType(v as 'percent' | 'fixed')}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="percent">Percentual</SelectItem>
                <SelectItem value="fixed">Valor fixo (R$)</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label htmlFor="val">Valor</Label>
            <Input id="val" type="number" value={discountValue} onChange={(e) => setDiscountValue(e.target.value)} />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label htmlFor="min">Pedido mínimo (R$)</Label>
            <Input id="min" type="number" value={minOrder} onChange={(e) => setMinOrder(e.target.value)} placeholder="opcional" />
          </div>
          <div>
            <Label htmlFor="max">Máx. usos</Label>
            <Input id="max" type="number" value={maxUses} onChange={(e) => setMaxUses(e.target.value)} placeholder="opcional" />
          </div>
        </div>
      </div>
      <DialogFooter>
        <Button onClick={() => mut.mutate()} disabled={!code || mut.isPending}>
          {mut.isPending ? 'Salvando...' : 'Criar cupom'}
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}
