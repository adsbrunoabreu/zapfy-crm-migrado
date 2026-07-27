import { useState } from 'react';
import { Plus, Pencil, Trash2, Loader2, Tag } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
  useAppointmentReasons, useUpsertReason, useDeleteReason, type AppointmentReason,
} from '@/hooks/useAppointmentReasons';

const PRESET_COLORS = [
  '#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6',
  '#ec4899', '#06b6d4', '#84cc16', '#f97316', '#6366f1',
];

interface FormState {
  id?: string;
  name: string;
  color: string;
  default_duration_minutes: number;
  is_active: boolean;
}

const EMPTY: FormState = {
  name: '',
  color: PRESET_COLORS[0],
  default_duration_minutes: 30,
  is_active: true,
};

export default function ReasonsSettings({ embedded = false }: { embedded?: boolean } = {}) {
  const { data: reasons = [], isLoading } = useAppointmentReasons(true);
  const upsert = useUpsertReason();
  const remove = useDeleteReason();

  const [showInactive, setShowInactive] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState<FormState>(EMPTY);
  const [confirmDelete, setConfirmDelete] = useState<AppointmentReason | null>(null);

  const filtered = reasons.filter((r) => showInactive || r.is_active);

  const openNew = () => { setForm(EMPTY); setDialogOpen(true); };
  const openEdit = (r: AppointmentReason) => {
    setForm({
      id: r.id,
      name: r.name,
      color: r.color || PRESET_COLORS[0],
      default_duration_minutes: r.default_duration_minutes ?? 30,
      is_active: r.is_active,
    });
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!form.name.trim()) return;
    await upsert.mutateAsync({
      id: form.id,
      name: form.name.trim(),
      color: form.color,
      default_duration_minutes: form.default_duration_minutes,
      is_active: form.is_active,
    });
    setDialogOpen(false);
  };

  const handleDelete = async () => {
    if (!confirmDelete) return;
    await remove.mutateAsync(confirmDelete.id);
    setConfirmDelete(null);
  };

  const Wrapper: any = embedded ? 'div' : Card;
  const wrapperProps = embedded ? { className: 'space-y-4' } : { className: 'glass-card p-6' };

  return (
    <Wrapper {...wrapperProps}>
      {!embedded && (
        <div className="flex items-start justify-between gap-4 mb-6 flex-wrap">
          <div className="flex items-center gap-2">
            <Tag className="w-5 h-5 text-primary" />
            <div>
              <h2 className="font-display text-lg font-semibold">Motivos de agendamento</h2>
              <p className="text-sm text-muted-foreground">
                Categorias usadas ao criar agendamentos (ex.: Consulta, Retorno, Reunião).
              </p>
            </div>
          </div>
          <Button variant="glow" size="sm" onClick={openNew}>
            <Plus className="w-4 h-4 mr-2" /> Novo motivo
          </Button>
        </div>
      )}
      {embedded && (
        <div className="flex justify-end">
          <Button variant="glow" size="sm" onClick={openNew}>
            <Plus className="w-4 h-4 mr-2" /> Novo motivo
          </Button>
        </div>
      )}

      <div className="flex items-center gap-2 mb-4">
        <Switch checked={showInactive} onCheckedChange={setShowInactive} id="reason-show-inactive" />
        <Label htmlFor="reason-show-inactive" className="text-sm cursor-pointer">Mostrar inativos</Label>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-10">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-10 text-muted-foreground text-sm">
          {reasons.length === 0 ? 'Nenhum motivo cadastrado ainda.' : 'Nenhum motivo ativo.'}
        </div>
      ) : (
        <div className="rounded-lg border border-border/50 overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Motivo</TableHead>
                <TableHead>Duração padrão</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((r) => (
                <TableRow key={r.id}>
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <span className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: r.color }} />
                      <span className="font-medium">{r.name}</span>
                    </div>
                  </TableCell>
                  <TableCell className="text-muted-foreground text-sm">
                    {r.default_duration_minutes} min
                  </TableCell>
                  <TableCell>
                    {r.is_active ? (
                      <Badge variant="outline" className="bg-emerald-500/15 text-emerald-500 border-emerald-500/30">Ativo</Badge>
                    ) : (
                      <Badge variant="outline" className="bg-muted text-muted-foreground">Inativo</Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-1">
                      <Button variant="ghost" size="icon" onClick={() => openEdit(r)}>
                        <Pencil className="w-4 h-4" />
                      </Button>
                      <Button variant="ghost" size="icon" onClick={() => setConfirmDelete(r)} className="text-destructive hover:text-destructive">
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={(o) => !upsert.isPending && setDialogOpen(o)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{form.id ? 'Editar motivo' : 'Novo motivo'}</DialogTitle>
            <DialogDescription>Motivos aparecem na criação de agendamentos.</DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="reason-name">Nome *</Label>
              <Input
                id="reason-name"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="Ex: Consulta, Retorno, Reunião"
                className="bg-secondary/50 border-border/50"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="reason-duration">Duração padrão (minutos)</Label>
              <Input
                id="reason-duration"
                type="number"
                min={5}
                max={480}
                step={5}
                value={form.default_duration_minutes}
                onChange={(e) => setForm({ ...form, default_duration_minutes: Math.max(5, Number(e.target.value) || 30) })}
                className="bg-secondary/50 border-border/50 w-32"
              />
            </div>

            <div className="space-y-2">
              <Label>Cor de identificação</Label>
              <div className="flex flex-wrap gap-2">
                {PRESET_COLORS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setForm({ ...form, color: c })}
                    className={`w-7 h-7 rounded-full border-2 transition-all ${
                      form.color === c ? 'border-foreground scale-110' : 'border-transparent opacity-70 hover:opacity-100'
                    }`}
                    style={{ backgroundColor: c }}
                    aria-label={`Cor ${c}`}
                  />
                ))}
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Switch
                id="reason-active"
                checked={form.is_active}
                onCheckedChange={(v) => setForm({ ...form, is_active: v })}
              />
              <Label htmlFor="reason-active" className="cursor-pointer">Ativo</Label>
            </div>
          </div>

          <DialogFooter>
            <Button variant="ghost" onClick={() => setDialogOpen(false)} disabled={upsert.isPending}>
              Cancelar
            </Button>
            <Button variant="glow" onClick={handleSave} disabled={upsert.isPending || !form.name.trim()}>
              {upsert.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!confirmDelete} onOpenChange={(o) => !o && setConfirmDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover motivo?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação não pode ser desfeita. Agendamentos existentes mantêm a referência, mas o motivo não estará mais disponível para novas seleções.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Remover
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Wrapper>
  );
}
