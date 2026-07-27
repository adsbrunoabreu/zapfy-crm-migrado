import { useState, useEffect } from 'react';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { CurrencyInput } from '@/components/ui/currency-input';
import { Button } from '@/components/ui/button';
import { Loader2, Upload, Download, FileSpreadsheet, FileText } from 'lucide-react';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useToast } from '@/hooks/use-toast';
import { CatalogManager } from './CatalogManager';
import { ImportProceduresDialog } from './ImportProceduresDialog';
import { exportProceduresToCSV, exportProceduresToPDF } from './exportProcedures';
import {
  useMedicalProceduresFull, useUpsertMedicalProcedure, useDeleteMedicalProcedure,
  type MedicalProcedureFull,
} from '@/hooks/medical/useMedicalCatalogs';

const fmtBRL = (v: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v || 0);

export default function ProceduresManager() {
  const { data = [], isLoading } = useMedicalProceduresFull();
  const upsert = useUpsertMedicalProcedure();
  const remove = useDeleteMedicalProcedure();
  const { toast } = useToast();
  const [importOpen, setImportOpen] = useState(false);

  const handleExport = (kind: 'csv' | 'pdf') => {
    if (!data.length) {
      toast({ title: 'Nada para exportar', description: 'Cadastre procedimentos primeiro.', variant: 'destructive' });
      return;
    }
    try {
      if (kind === 'csv') exportProceduresToCSV(data);
      else exportProceduresToPDF(data);
      toast({ title: 'Arquivo gerado', description: `Download de ${data.length} procedimento(s) iniciado.` });
    } catch (e: any) {
      toast({ title: 'Erro ao exportar', description: e.message, variant: 'destructive' });
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex justify-end gap-2">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" className="gap-2">
              <Download className="w-4 h-4" /> Exportar
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => handleExport('csv')} className="gap-2">
              <FileSpreadsheet className="w-4 h-4" /> Exportar CSV
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => handleExport('pdf')} className="gap-2">
              <FileText className="w-4 h-4" /> Exportar PDF
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        <Button variant="outline" size="sm" className="gap-2" onClick={() => setImportOpen(true)}>
          <Upload className="w-4 h-4" /> Importar CSV
        </Button>
      </div>


      <CatalogManager<MedicalProcedureFull>
        title="Procedimentos"
        description="Procedimentos oferecidos pela clínica. Aparecem nos selects de oportunidades e agendamentos."
        addLabel="Novo procedimento"
        rows={data}
        isLoading={isLoading}
        isActive={(r) => r.active}
        getLabel={(r) => r.name}
        isDeleting={remove.isPending}
        searchFn={(r, q) => r.name.toLowerCase().includes(q) || (r.category ?? '').toLowerCase().includes(q)}
        columns={[
          { key: 'name', label: 'Nome', render: (r) => <span className="text-sm font-medium">{r.name}</span> },
          { key: 'cat', label: 'Categoria', render: (r) => <span className="text-xs text-muted-foreground">{r.category || '—'}</span> },
          { key: 'price', label: 'Preço base', render: (r) => <span className="text-xs">{fmtBRL(Number(r.base_price))}</span> },
          { key: 'dur', label: 'Duração', render: (r) => <span className="text-xs text-muted-foreground">{r.duration_minutes ?? 30} min</span> },
        ]}
        onToggleActive={async (r, active) => {
          try { await upsert.mutateAsync({ id: r.id, active, name: r.name, base_price: r.base_price } as any); }
          catch (e: any) { toast({ title: 'Erro', description: e.message, variant: 'destructive' }); }
        }}
        onDelete={async (r) => {
          try { await remove.mutateAsync(r.id); toast({ title: 'Procedimento removido' }); }
          catch (e: any) { toast({ title: 'Erro', description: e.message, variant: 'destructive' }); }
        }}
        renderForm={({ row, onSaved, onCancel }) => (
          <ProcedureForm row={row} onSaved={onSaved} onCancel={onCancel} />
        )}
      />

      <ImportProceduresDialog open={importOpen} onOpenChange={setImportOpen} />
    </div>
  );
}

function ProcedureForm({ row, onSaved, onCancel }: { row: MedicalProcedureFull | null; onSaved: () => void; onCancel: () => void }) {
  const upsert = useUpsertMedicalProcedure();
  const { toast } = useToast();
  const [form, setForm] = useState({ name: '', category: '', base_price: 0, duration_minutes: 30, active: true });

  useEffect(() => {
    if (row) setForm({
      name: row.name, category: row.category ?? '',
      base_price: Number(row.base_price ?? 0), duration_minutes: row.duration_minutes ?? 30,
      active: row.active,
    });
  }, [row]);

  const submit = async () => {
    if (form.name.trim().length < 2) return;
    try {
      await upsert.mutateAsync({ id: row?.id, ...form } as any);
      toast({ title: row ? 'Procedimento atualizado' : 'Procedimento cadastrado' });
      onSaved();
    } catch (e: any) { toast({ title: 'Erro', description: e.message, variant: 'destructive' }); }
  };

  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <Label>Nome *</Label>
        <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label>Categoria</Label>
          <Input value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} placeholder="Consulta, exame..." />
        </div>
        <div className="space-y-1.5">
          <Label>Duração (min)</Label>
          <Input type="number" min={5} step={5} value={form.duration_minutes}
                 onChange={(e) => setForm({ ...form, duration_minutes: Number(e.target.value) || 30 })} />
        </div>
        <div className="space-y-1.5 col-span-2">
          <Label>Preço base (R$)</Label>
          <CurrencyInput
            value={form.base_price}
            onValueChange={(v) => setForm({ ...form, base_price: v ?? 0 })}
            placeholder="0,00"
          />
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
