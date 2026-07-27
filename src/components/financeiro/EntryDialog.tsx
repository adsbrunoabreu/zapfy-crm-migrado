import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { CurrencyInput } from '@/components/ui/currency-input';
import { useCreateFinancialEntry, useFinancialCategories } from '@/hooks/finance/useFinancial';

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  kind: 'receivable' | 'payable';
}

export function EntryDialog({ open, onOpenChange, kind }: Props) {
  const { data: categories = [] } = useFinancialCategories(kind === 'receivable' ? 'income' : 'expense');
  const create = useCreateFinancialEntry();
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState<number | null>(null);
  const [discount, setDiscount] = useState<number | null>(null);
  const [dueDate, setDueDate] = useState('');
  const [categoryId, setCategoryId] = useState<string>('');
  const [partyName, setPartyName] = useState('');

  useEffect(() => {
    if (open) {
      setDescription(''); setAmount(null); setDiscount(null); setDueDate('');
      setCategoryId(''); setPartyName('');
    }
  }, [open]);

  const handleSave = async () => {
    const amt = amount ?? 0;
    if (!description.trim() || !amt || amt <= 0) return;
    await create.mutateAsync({
      kind,
      description: description.trim(),
      amount: amt,
      discount: discount ?? 0,
      due_date: dueDate || null,
      category_id: categoryId || null,
      party_name: partyName.trim() || null,
    } as any);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>
            Novo {kind === 'receivable' ? 'recebimento' : 'pagamento'}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <div>
            <Label>Descrição</Label>
            <Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Ex: Mensalidade plano Premium" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Valor (R$)</Label>
              <CurrencyInput value={amount} onValueChange={setAmount} placeholder="0,00" />
            </div>
            <div>
              <Label>Desconto (R$)</Label>
              <CurrencyInput value={discount} onValueChange={setDiscount} placeholder="0,00" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Vencimento</Label>
              <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
            </div>
            <div>
              <Label>Categoria</Label>
              <Select value={categoryId} onValueChange={setCategoryId}>
                <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>
                  {categories.map((c) => (
                    <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div>
            <Label>{kind === 'receivable' ? 'Cliente' : 'Fornecedor'}</Label>
            <Input value={partyName} onChange={(e) => setPartyName(e.target.value)} placeholder="Nome (opcional)" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={handleSave} disabled={create.isPending || !description.trim() || !amount}>
            Salvar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
