import { useState } from 'react';
import { Plus, Loader2, Trash2, Package } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { CurrencyInput } from '@/components/ui/currency-input';
import { Switch } from '@/components/ui/switch';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { useProducts, useCreateProduct, useUpdateProduct, useDeleteProduct, type Product } from '@/hooks/useProducts';
import { toast } from 'sonner';

const formatBRL = (n: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(n) || 0);

export default function ProductsManager() {
  const { data: items = [], isLoading } = useProducts();
  const create = useCreateProduct();
  const update = useUpdateProduct();
  const remove = useDeleteProduct();

  const [newName, setNewName] = useState('');
  const [newSku, setNewSku] = useState('');
  const [newPrice, setNewPrice] = useState<number | null>(null);
  const [editing, setEditing] = useState<Record<string, { name?: string; sku?: string; price?: number | null }>>({});
  const [confirmDelete, setConfirmDelete] = useState<Product | null>(null);

  const handleAdd = async () => {
    const name = newName.trim();
    if (name.length < 2) return;
    const price = newPrice ?? 0;
    await create.mutateAsync({ name, sku: newSku.trim() || null, base_price: price });
    setNewName(''); setNewSku(''); setNewPrice(null);
    toast.success('Produto cadastrado');
  };

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-base font-semibold flex items-center gap-2">
          <Package className="w-4 h-4 text-primary" /> Produtos
        </h3>
        <p className="text-sm text-muted-foreground mt-1">
          Cadastre produtos que poderão ser adicionados aos orçamentos. Eles aparecem separados de serviços e geram lançamento próprio na receita.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-[1fr,160px,140px,auto] gap-2">
        <Input
          value={newName}
          onChange={(e) => setNewName(e.target.value.slice(0, 120))}
          placeholder="Nome do produto"
        />
        <Input
          value={newSku}
          onChange={(e) => setNewSku(e.target.value.slice(0, 40))}
          placeholder="SKU (opcional)"
        />
        <CurrencyInput
          value={newPrice}
          onValueChange={setNewPrice}
          placeholder="0,00"
        />
        <Button onClick={handleAdd} disabled={create.isPending || newName.trim().length < 2}>
          {create.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
          <span className="ml-2">Adicionar</span>
        </Button>
      </div>

      <div className="border border-border rounded-lg overflow-hidden">
        {isLoading ? (
          <div className="p-6 flex justify-center bg-card/40">
            <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
          </div>
        ) : items.length === 0 ? (
          <p className="p-6 text-sm text-muted-foreground text-center bg-card/40">
            Nenhum produto cadastrado.
          </p>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-xs text-muted-foreground">
              <tr>
                <th className="text-left py-2 px-3">Nome</th>
                <th className="text-left py-2 px-3 w-[160px]">SKU</th>
                <th className="text-left py-2 px-3 w-[140px]">Preço base</th>
                <th className="text-left py-2 px-3 w-[100px]">Ativo</th>
                <th className="text-right py-2 px-3 w-[60px]"></th>
              </tr>
            </thead>
            <tbody>
              {items.map((p) => {
                const ed = editing[p.id] ?? {};
                const nameVal = ed.name ?? p.name;
                const skuVal = ed.sku ?? (p.sku ?? '');
                const priceVal = ed.price ?? (p.base_price != null ? Number(p.base_price) : null);
                const commitName = () => {
                  const v = nameVal.trim();
                  if (v && v !== p.name) update.mutate({ id: p.id, name: v });
                  setEditing((s) => { const c = { ...s, [p.id]: { ...s[p.id], name: undefined } }; return c; });
                };
                const commitSku = () => {
                  const v = skuVal.trim();
                  if (v !== (p.sku ?? '')) update.mutate({ id: p.id, sku: v });
                  setEditing((s) => { const c = { ...s, [p.id]: { ...s[p.id], sku: undefined } }; return c; });
                };
                const commitPrice = () => {
                  const v = priceVal ?? 0;
                  if (v !== Number(p.base_price)) update.mutate({ id: p.id, base_price: v });
                  setEditing((s) => { const c = { ...s, [p.id]: { ...s[p.id], price: undefined } }; return c; });
                };
                return (
                  <tr key={p.id} className="border-t border-border bg-card/40">
                    <td className="py-1.5 px-2">
                      <Input
                        value={nameVal}
                        onChange={(e) => setEditing((s) => ({ ...s, [p.id]: { ...s[p.id], name: e.target.value.slice(0, 120) } }))}
                        onBlur={commitName}
                        onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
                        className="h-8 bg-transparent border-transparent hover:border-border focus:border-border"
                      />
                    </td>
                    <td className="py-1.5 px-2">
                      <Input
                        value={skuVal}
                        onChange={(e) => setEditing((s) => ({ ...s, [p.id]: { ...s[p.id], sku: e.target.value.slice(0, 40) } }))}
                        onBlur={commitSku}
                        onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
                        className="h-8 bg-transparent border-transparent hover:border-border focus:border-border"
                      />
                    </td>
                    <td className="py-1.5 px-2">
                      <CurrencyInput
                        value={priceVal}
                        onValueChange={(v) => setEditing((s) => ({ ...s, [p.id]: { ...s[p.id], price: v } }))}
                        onBlur={commitPrice}
                        onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
                        showPrefix={false}
                        className="h-8 tabular-nums bg-transparent border-transparent hover:border-border focus:border-border"
                      />
                      <div className="text-[10px] text-muted-foreground mt-0.5 px-2">{formatBRL(priceVal ?? 0)}</div>
                    </td>
                    <td className="py-1.5 px-3">
                      <Switch checked={p.active} onCheckedChange={(v) => update.mutate({ id: p.id, active: v })} />
                    </td>
                    <td className="py-1.5 px-2 text-right">
                      <Button size="icon" variant="ghost" className="h-8 w-8 text-muted-foreground hover:text-destructive" onClick={() => setConfirmDelete(p)}>
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      <AlertDialog open={!!confirmDelete} onOpenChange={(o) => !o && setConfirmDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir produto "{confirmDelete?.name}"?</AlertDialogTitle>
            <AlertDialogDescription>
              Orçamentos que já tiverem este produto manterão a linha (com o preço travado no momento da venda), mas ele deixará de aparecer para novos lançamentos.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={async () => { if (confirmDelete) await remove.mutateAsync(confirmDelete.id); setConfirmDelete(null); }}
            >
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
