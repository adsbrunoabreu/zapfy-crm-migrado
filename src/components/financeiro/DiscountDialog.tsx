import { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { CurrencyInput } from '@/components/ui/currency-input';
import { useReleaseDiscount, useReleaseProcedureDiscount } from '@/hooks/finance/useBudgets';
import { formatBRL } from '@/lib/finance';
import { Lock } from 'lucide-react';

interface Props {
  lead: { id: string; name: string; value: number; pct: number | null; amount: number | null } | null;
  /** When set, the dialog releases a per-item discount for this procedure. */
  procedure?: { id: string; name: string; base: number } | null;
  onOpenChange: (open: boolean) => void;
}

export function DiscountDialog({ lead, procedure, onOpenChange }: Props) {
  const [mode, setMode] = useState<'pct' | 'amount'>('pct');
  const [pct, setPct] = useState('');
  const [amount, setAmount] = useState<number | null>(null);
  const [reason, setReason] = useState('');
  const [password, setPassword] = useState('');
  const release = useReleaseDiscount();
  const releaseItem = useReleaseProcedureDiscount();

  const isItem = !!procedure;
  const baseValue = isItem ? procedure!.base : (lead?.value ?? 0);

  useEffect(() => {
    if (lead) {
      setMode(lead.pct ? 'pct' : lead.amount ? 'amount' : 'pct');
      setPct(lead.pct ? String(lead.pct) : '');
      setAmount(lead.amount ? Number(lead.amount) : null);
      setReason('');
      setPassword('');
    }
  }, [lead, procedure?.id]);

  if (!lead) return null;

  const parseNum = (s: string) => Number(String(s).replace(',', '.')) || 0;
  const pctNum = mode === 'pct' ? parseNum(pct) : 0;
  const amtNum = mode === 'amount' ? (amount ?? 0) : 0;
  const preview = mode === 'pct' ? (baseValue * pctNum) / 100 : amtNum;
  const net = Math.max(baseValue - preview, 0);
  const valid = password.length > 0 && reason.trim().length > 0 && (pctNum > 0 || amtNum > 0);
  const pending = release.isPending || releaseItem.isPending;

  const submit = async () => {
    if (isItem) {
      await releaseItem.mutateAsync({
        procId: procedure!.id, leadId: lead.id,
        pct: mode === 'pct' ? pctNum : null,
        amount: mode === 'amount' ? amtNum : null,
        reason: reason.trim(), password,
      });
    } else {
      await release.mutateAsync({
        leadId: lead.id,
        pct: mode === 'pct' ? pctNum : null,
        amount: mode === 'amount' ? amtNum : null,
        reason: reason.trim(), password,
      });
    }
    onOpenChange(false);
  };

  return (
    <Dialog open={!!lead} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[460px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Lock className="w-4 h-4 text-amber" />
            {isItem ? 'Liberar desconto do item' : 'Liberar desconto'}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          <div className="text-sm text-muted-foreground">
            {isItem ? (
              <>Item: <span className="text-foreground font-medium">{procedure!.name}</span> · Base {formatBRL(baseValue)}</>
            ) : (
              <>Ficha: <span className="text-foreground font-medium">{lead.name}</span> · Valor {formatBRL(baseValue)}</>
            )}
          </div>

          <Tabs value={mode} onValueChange={(v) => setMode(v as any)}>
            <TabsList className="grid grid-cols-2 w-full">
              <TabsTrigger value="pct">Percentual</TabsTrigger>
              <TabsTrigger value="amount">Valor (R$)</TabsTrigger>
            </TabsList>
            <TabsContent value="pct" className="pt-3">
              <Label className="text-xs">Desconto (%)</Label>
              <Input value={pct} onChange={(e) => setPct(e.target.value)} inputMode="decimal" placeholder="0" className="rounded-lg mt-1" />
            </TabsContent>
            <TabsContent value="amount" className="pt-3">
              <Label className="text-xs">Desconto (R$)</Label>
              <CurrencyInput value={amount} onValueChange={setAmount} placeholder="0,00" className="rounded-lg mt-1" />
            </TabsContent>
          </Tabs>

          <div className="rounded-lg border border-border/60 p-2 text-xs flex justify-between bg-muted/30">
            <span className="text-muted-foreground">Desconto aplicado</span>
            <span className="text-amber tabular-nums font-medium">{formatBRL(preview)}</span>
          </div>
          <div className="rounded-lg border border-border/60 p-2 text-xs flex justify-between bg-muted/30">
            <span className="text-muted-foreground">{isItem ? 'Valor do item líquido' : 'Valor líquido'}</span>
            <span className="text-emerald tabular-nums font-semibold">{formatBRL(net)}</span>
          </div>

          <div>
            <Label className="text-xs">Motivo da liberação</Label>
            <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Ex.: condição comercial cliente VIP" className="rounded-lg mt-1" />
          </div>

          <div>
            <Label className="text-xs">Senha do seu usuário</Label>
            <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Confirmação obrigatória" autoComplete="current-password" className="rounded-lg mt-1" />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button disabled={!valid || pending} onClick={submit}>
            {pending ? 'Liberando...' : 'Confirmar liberação'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
