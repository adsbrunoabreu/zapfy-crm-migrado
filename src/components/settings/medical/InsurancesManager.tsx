import { useState, useEffect } from 'react';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Loader2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { CatalogManager } from './CatalogManager';
import { SearchableSelect } from '@/components/ui/searchable-select';
import {
  useMedicalInsurances, useUpsertMedicalInsurance, useDeleteMedicalInsurance,
  type MedicalInsurance,
} from '@/hooks/medical/useMedicalCatalogs';

const MODALITY_OPTIONS = [
  'Cooperativa Médica',
  'Medicina de Grupo',
  'Seguradora',
  'Autogestão',
  'Filantropia',
  'Particular',
];

const COVERAGE_OPTIONS = [
  'Nacional',
  'Regional',
  'Estadual',
  'Grupo Específico',
  'N/A',
];

export default function InsurancesManager() {
  const { data = [], isLoading } = useMedicalInsurances();
  const upsert = useUpsertMedicalInsurance();
  const remove = useDeleteMedicalInsurance();
  const { toast } = useToast();

  return (
    <CatalogManager<MedicalInsurance>
      title="Convênios"
      description="Lista de convênios e modalidades de pagamento (Particular, Unimed, etc.) usadas nas oportunidades."
      addLabel="Novo convênio"
      rows={data}
      isLoading={isLoading}
      isActive={(r) => r.active}
      getLabel={(r) => r.name}
      isDeleting={remove.isPending}
      searchFn={(r, q) =>
        r.name.toLowerCase().includes(q) ||
        (r.ans_code ?? '').toLowerCase().includes(q) ||
        (r.modality ?? '').toLowerCase().includes(q)
      }
      columns={[
        { key: 'name', label: 'Nome', render: (r) => <span className="text-sm font-medium">{r.name}</span> },
        { key: 'ans', label: 'Código ANS', render: (r) => <span className="text-xs text-muted-foreground">{r.ans_code || '—'}</span> },
        { key: 'mod', label: 'Modalidade', render: (r) => <span className="text-xs text-muted-foreground">{r.modality || '—'}</span> },
        { key: 'scope', label: 'Abrangência', render: (r) => <span className="text-xs text-muted-foreground">{r.coverage_scope || '—'}</span> },
        { key: 'phone', label: 'Telefone', render: (r) => <span className="text-xs text-muted-foreground">{r.contact_phone || '—'}</span> },
      ]}
      onToggleActive={async (r, active) => {
        try { await upsert.mutateAsync({ id: r.id, active, name: r.name } as any); }
        catch (e: any) { toast({ title: 'Erro', description: e.message, variant: 'destructive' }); }
      }}
      onDelete={async (r) => {
        try { await remove.mutateAsync(r.id); toast({ title: 'Convênio removido' }); }
        catch (e: any) { toast({ title: 'Erro', description: e.message, variant: 'destructive' }); }
      }}
      renderForm={({ row, onSaved, onCancel }) => (
        <InsuranceForm row={row} onSaved={onSaved} onCancel={onCancel} />
      )}
    />
  );
}

function InsuranceForm({ row, onSaved, onCancel }: { row: MedicalInsurance | null; onSaved: () => void; onCancel: () => void }) {
  const upsert = useUpsertMedicalInsurance();
  const { toast } = useToast();
  const [form, setForm] = useState({
    name: '',
    ans_code: '',
    modality: '',
    coverage_scope: '',
    contact_phone: '',
    notes: '',
    active: true,
  });

  useEffect(() => {
    if (row) setForm({
      name: row.name,
      ans_code: row.ans_code ?? '',
      modality: row.modality ?? '',
      coverage_scope: row.coverage_scope ?? '',
      contact_phone: row.contact_phone ?? '',
      notes: row.notes ?? '',
      active: row.active,
    });
  }, [row]);

  const submit = async () => {
    if (form.name.trim().length < 2) return;
    try {
      await upsert.mutateAsync({ id: row?.id, ...form } as any);
      toast({ title: row ? 'Convênio atualizado' : 'Convênio cadastrado' });
      onSaved();
    } catch (e: any) { toast({ title: 'Erro', description: e.message, variant: 'destructive' }); }
  };

  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <Label>Nome *</Label>
        <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Unimed, Particular, etc." />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label>Código ANS</Label>
          <Input value={form.ans_code} onChange={(e) => setForm({ ...form, ans_code: e.target.value })} placeholder="6 dígitos" />
        </div>
        <div className="space-y-1.5">
          <Label>Telefone de autorização</Label>
          <Input value={form.contact_phone} onChange={(e) => setForm({ ...form, contact_phone: e.target.value })} placeholder="0800 ou (DD)" />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label>Modalidade</Label>
          <SearchableSelect
            value={form.modality}
            onValueChange={(v) => setForm({ ...form, modality: v })}
            options={MODALITY_OPTIONS.map((m) => ({ value: m, label: m }))}
            placeholder="Selecione…"
          />
        </div>
        <div className="space-y-1.5">
          <Label>Abrangência</Label>
          <SearchableSelect
            value={form.coverage_scope}
            onValueChange={(v) => setForm({ ...form, coverage_scope: v })}
            options={COVERAGE_OPTIONS.map((m) => ({ value: m, label: m }))}
            placeholder="Selecione…"
          />
        </div>
      </div>
      <div className="space-y-1.5">
        <Label>Observações</Label>
        <Textarea rows={3} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
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
