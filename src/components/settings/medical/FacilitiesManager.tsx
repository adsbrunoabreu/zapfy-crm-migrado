import { useState, useEffect } from 'react';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { CatalogManager } from './CatalogManager';
import {
  useMedicalFacilities, useUpsertMedicalFacility, useDeleteMedicalFacility,
  type MedicalFacility,
} from '@/hooks/medical/useMedicalCatalogs';

export default function FacilitiesManager() {
  const { data = [], isLoading } = useMedicalFacilities();
  const upsert = useUpsertMedicalFacility();
  const remove = useDeleteMedicalFacility();
  const { toast } = useToast();

  return (
    <CatalogManager<MedicalFacility>
      title="Hospitais & Clínicas"
      description="Locais de atendimento. Cada oportunidade pode ser vinculada a um destes."
      addLabel="Novo local"
      rows={data}
      isLoading={isLoading}
      isActive={(r) => r.active}
      getLabel={(r) => r.name}
      isDeleting={remove.isPending}
      searchFn={(r, q) =>
        r.name.toLowerCase().includes(q) ||
        (r.city ?? '').toLowerCase().includes(q) ||
        (r.cnpj ?? '').toLowerCase().includes(q)
      }
      columns={[
        { key: 'name', label: 'Nome', render: (r) => <span className="text-sm font-medium">{r.name}</span> },
        { key: 'kind', label: 'Tipo', render: (r) => <span className="text-xs text-muted-foreground">{r.kind === 'hospital' ? 'Hospital' : 'Clínica'}</span> },
        { key: 'city', label: 'Cidade/UF', render: (r) => <span className="text-xs text-muted-foreground">{[r.city, r.state].filter(Boolean).join('/') || '—'}</span> },
      ]}
      onToggleActive={async (r, active) => {
        try { await upsert.mutateAsync({ id: r.id, active, name: r.name, kind: r.kind } as any); }
        catch (e: any) { toast({ title: 'Erro', description: e.message, variant: 'destructive' }); }
      }}
      onDelete={async (r) => {
        try { await remove.mutateAsync(r.id); toast({ title: 'Local removido' }); }
        catch (e: any) { toast({ title: 'Erro', description: e.message, variant: 'destructive' }); }
      }}
      renderForm={({ row, onSaved, onCancel }) => (
        <FacilityForm row={row} onSaved={onSaved} onCancel={onCancel} />
      )}
    />
  );
}

function FacilityForm({ row, onSaved, onCancel }: { row: MedicalFacility | null; onSaved: () => void; onCancel: () => void }) {
  const upsert = useUpsertMedicalFacility();
  const { toast } = useToast();
  const [form, setForm] = useState({
    name: '', kind: 'clinic' as 'clinic' | 'hospital', cnpj: '', phone: '', address: '',
    city: '', state: '', notes: '', active: true,
  });

  useEffect(() => {
    if (row) setForm({
      name: row.name, kind: row.kind, cnpj: row.cnpj ?? '', phone: row.phone ?? '',
      address: row.address ?? '', city: row.city ?? '', state: row.state ?? '',
      notes: row.notes ?? '', active: row.active,
    });
  }, [row]);

  const submit = async () => {
    if (form.name.trim().length < 2) return;
    try {
      await upsert.mutateAsync({ id: row?.id, ...form } as any);
      toast({ title: row ? 'Local atualizado' : 'Local cadastrado' });
      onSaved();
    } catch (e: any) { toast({ title: 'Erro', description: e.message, variant: 'destructive' }); }
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5 col-span-2">
          <Label>Nome *</Label>
          <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        </div>
        <div className="space-y-1.5">
          <Label>Tipo</Label>
          <Select value={form.kind} onValueChange={(v) => setForm({ ...form, kind: v as any })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="clinic">Clínica</SelectItem>
              <SelectItem value="hospital">Hospital</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>CNPJ</Label>
          <Input value={form.cnpj} onChange={(e) => setForm({ ...form, cnpj: e.target.value })} />
        </div>
        <div className="space-y-1.5">
          <Label>Telefone</Label>
          <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
        </div>
        <div className="space-y-1.5">
          <Label>Endereço</Label>
          <Input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
        </div>
        <div className="space-y-1.5">
          <Label>Cidade</Label>
          <Input value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} />
        </div>
        <div className="space-y-1.5">
          <Label>UF</Label>
          <Input maxLength={2} value={form.state}
                 onChange={(e) => setForm({ ...form, state: e.target.value.toUpperCase().slice(0, 2) })} />
        </div>
        <div className="space-y-1.5 col-span-2">
          <Label>Observações</Label>
          <Textarea rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
        </div>
      </div>
      <div className="flex justify-end gap-2 pt-2">
        <Button variant="ghost" onClick={onCancel}>Cancelar</Button>
        <Button onClick={submit} disabled={upsert.isPending || form.name.trim().length < 2}>
          {upsert.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
          Salvar
        </Button>
      </div>
    </div>
  );
}
