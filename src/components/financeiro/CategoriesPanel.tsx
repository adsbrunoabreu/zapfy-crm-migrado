import { useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Loader2, Plus, Trash2 } from 'lucide-react';
import { useFinancialCategories, useCreateCategory, useArchiveCategory } from '@/hooks/finance/useFinancial';

export function CategoriesPanel() {
  const { data: cats = [], isLoading } = useFinancialCategories();
  const archive = useArchiveCategory();
  const [open, setOpen] = useState(false);

  const incomes = cats.filter((c) => c.kind === 'income');
  const expenses = cats.filter((c) => c.kind === 'expense');

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button onClick={() => setOpen(true)}><Plus className="w-4 h-4 mr-1" />Nova categoria</Button>
      </div>
      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <CategoryList title="Receitas" items={incomes} onArchive={(id) => archive.mutate(id)} />
          <CategoryList title="Despesas" items={expenses} onArchive={(id) => archive.mutate(id)} />
        </div>
      )}
      <NewCategoryDialog open={open} onOpenChange={setOpen} />
    </div>
  );
}

function CategoryList({ title, items, onArchive }: {
  title: string;
  items: { id: string; name: string; color: string | null; is_system: boolean; is_direct_cost: boolean; is_operational: boolean }[];
  onArchive: (id: string) => void;
}) {
  return (
    <Card className="p-4">
      <h3 className="text-sm font-medium mb-3">{title}</h3>
      <div className="space-y-1">
        {items.length === 0 && <div className="text-xs text-muted-foreground">Nenhuma categoria</div>}
        {items.map((c) => (
          <div key={c.id} className="flex items-center justify-between py-1.5 px-2 rounded hover:bg-muted/50">
            <div className="flex items-center gap-2 text-sm">
              <span className="w-2 h-2 rounded-full" style={{ background: c.color ?? 'hsl(var(--muted-foreground))' }} />
              {c.name}
              {c.is_direct_cost && <span className="text-[10px] uppercase text-amber ml-1">custo direto</span>}
            </div>
            {!c.is_system && (
              <Button size="sm" variant="ghost" onClick={() => onArchive(c.id)} title="Arquivar">
                <Trash2 className="w-3.5 h-3.5 text-rose" />
              </Button>
            )}
          </div>
        ))}
      </div>
    </Card>
  );
}

function NewCategoryDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const create = useCreateCategory();
  const [name, setName] = useState('');
  const [kind, setKind] = useState<'income' | 'expense'>('expense');
  const [color, setColor] = useState('#3b82f6');
  const [directCost, setDirectCost] = useState(false);
  const [operational, setOperational] = useState(true);

  const handle = async () => {
    if (!name.trim()) return;
    await create.mutateAsync({ name: name.trim(), kind, color, is_direct_cost: directCost, is_operational: operational });
    setName(''); setKind('expense'); setColor('#3b82f6'); setDirectCost(false); setOperational(true);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader><DialogTitle>Nova categoria</DialogTitle></DialogHeader>
        <div className="space-y-3 py-2">
          <div><Label>Nome</Label><Input value={name} onChange={(e) => setName(e.target.value)} /></div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Tipo</Label>
              <Select value={kind} onValueChange={(v) => setKind(v as any)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="income">Receita</SelectItem>
                  <SelectItem value="expense">Despesa</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Cor</Label>
              <Input type="color" value={color} onChange={(e) => setColor(e.target.value)} className="h-10 p-1" />
            </div>
          </div>
          {kind === 'expense' && (
            <>
              <div className="flex items-center justify-between">
                <Label htmlFor="dc">Custo direto (DRE)</Label>
                <Switch id="dc" checked={directCost} onCheckedChange={setDirectCost} />
              </div>
              <div className="flex items-center justify-between">
                <Label htmlFor="op">Despesa operacional (DRE)</Label>
                <Switch id="op" checked={operational} onCheckedChange={setOperational} />
              </div>
            </>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={handle} disabled={!name.trim() || create.isPending}>Criar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
