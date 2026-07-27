import { useState, type ElementType } from 'react';
import { Plus, Pencil, Trash2, Loader2, Users, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  useProfessionals,
  useUpsertProfessional,
  useDeleteProfessional,
  type Professional,
} from '@/hooks/useAppointmentProfessionals';
import { useTeamMembers } from '@/hooks/useTeamMembers';
import { useCompanyVertical } from '@/hooks/useCompanyVertical';
import { Textarea } from '@/components/ui/textarea';
import { formatBrPhone } from '@/lib/viacep';

const PRESET_COLORS = [
  '#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6',
  '#ec4899', '#06b6d4', '#84cc16', '#f97316', '#6366f1',
];

interface FormState {
  id?: string;
  name: string;
  email: string;
  phone: string;
  specialty: string;
  color: string;
  linked_user_id: string | null;
  is_active: boolean;
  work_start_time: string; // HH:MM
  work_end_time: string;   // HH:MM
  work_days: number[];     // 0..6 (Dom..Sáb)
  buffer_minutes: number;
  crm: string;
  council_type: string;
  bio: string;
}

const EMPTY: FormState = {
  name: '',
  email: '',
  phone: '',
  specialty: '',
  color: PRESET_COLORS[0],
  linked_user_id: null,
  is_active: true,
  work_start_time: '09:00',
  work_end_time: '18:00',
  work_days: [1, 2, 3, 4, 5],
  buffer_minutes: 0,
  crm: '',
  council_type: 'CRM',
  bio: '',
};

const COUNCIL_TYPES = ['CRM', 'CRO', 'CRP', 'CREFITO', 'COREN', 'CRN', 'Outro'];

const WEEKDAYS = [
  { value: 0, label: 'D' },
  { value: 1, label: 'S' },
  { value: 2, label: 'T' },
  { value: 3, label: 'Q' },
  { value: 4, label: 'Q' },
  { value: 5, label: 'S' },
  { value: 6, label: 'S' },
];

interface ProfessionalsSettingsProps {
  /** Quando true, omite o Card/header externos (usar dentro de drawer) */
  embedded?: boolean;
}

export default function ProfessionalsSettings({ embedded = false }: ProfessionalsSettingsProps = {}) {
  const { data: pros = [], isLoading } = useProfessionals(true);
  const { data: members = [] } = useTeamMembers();
  const { data: vertical } = useCompanyVertical();
  const isMedical = vertical === 'medical';
  const upsert = useUpsertProfessional();
  const remove = useDeleteProfessional();

  const [search, setSearch] = useState('');
  const [showInactive, setShowInactive] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState<FormState>(EMPTY);
  const [confirmDelete, setConfirmDelete] = useState<Professional | null>(null);

  const filtered = pros.filter((p) => {
    if (!showInactive && !p.is_active) return false;
    if (!search) return true;
    const s = search.toLowerCase();
    return (
      p.name.toLowerCase().includes(s) ||
      (p.specialty || '').toLowerCase().includes(s) ||
      (p.email || '').toLowerCase().includes(s) ||
      (p.crm || '').toLowerCase().includes(s)
    );
  });

  const openNew = () => {
    setForm(EMPTY);
    setDialogOpen(true);
  };

  const openEdit = (p: Professional) => {
    setForm({
      id: p.id,
      name: p.name,
      email: p.email || '',
      phone: p.phone ? formatBrPhone(p.phone) : '',
      specialty: p.specialty || '',
      color: p.color || PRESET_COLORS[0],
      linked_user_id: p.linked_user_id,
      is_active: p.is_active,
      work_start_time: (p.work_start_time || '09:00:00').slice(0, 5),
      work_end_time: (p.work_end_time || '18:00:00').slice(0, 5),
      work_days: p.work_days || [1, 2, 3, 4, 5],
      buffer_minutes: p.buffer_minutes ?? 0,
      crm: p.crm || '',
      council_type: p.council_type || 'CRM',
      bio: p.bio || '',
    });
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!form.name.trim()) return;
    await upsert.mutateAsync({
      id: form.id,
      name: form.name.trim(),
      email: form.email.trim() || null,
      phone: form.phone.replace(/\D/g, '') || null,
      specialty: form.specialty.trim() || null,
      color: form.color,
      linked_user_id: form.linked_user_id || null,
      is_active: form.is_active,
      work_start_time: form.work_start_time,
      work_end_time: form.work_end_time,
      work_days: form.work_days,
      buffer_minutes: form.buffer_minutes,
      crm: isMedical ? (form.crm.trim() || null) : null,
      council_type: isMedical ? form.council_type : null,
      bio: isMedical ? (form.bio.trim() || null) : null,
    });
    setDialogOpen(false);
  };


  const toggleWorkday = (d: number) => {
    setForm(f => ({
      ...f,
      work_days: f.work_days.includes(d)
        ? f.work_days.filter(x => x !== d)
        : [...f.work_days, d].sort(),
    }));
  };

  const handleDelete = async () => {
    if (!confirmDelete) return;
    await remove.mutateAsync(confirmDelete.id);
    setConfirmDelete(null);
  };

  const Wrapper: ElementType = embedded ? 'div' : Card;
  const wrapperProps = embedded
    ? { className: 'space-y-4' }
    : { className: 'glass-card p-6' };

  return (
    <Wrapper {...wrapperProps}>
      {!embedded && (
        <div className="flex items-start justify-between gap-4 mb-6 flex-wrap">
          <div className="flex items-center gap-2">
            <Users className="w-5 h-5 text-primary" />
            <div>
              <h2 className="font-display text-lg font-semibold">Profissionais</h2>
              <p className="text-sm text-muted-foreground">
                Cadastro de profissionais para agendamentos da empresa.
              </p>
            </div>
          </div>
          <Button variant="glow" size="sm" onClick={openNew}>
            <Plus className="w-4 h-4 mr-2" />
            Novo profissional
          </Button>
        </div>
      )}
      {embedded && (
        <div className="flex justify-end">
          <Button variant="glow" size="sm" onClick={openNew}>
            <Plus className="w-4 h-4 mr-2" />
            Novo profissional
          </Button>
        </div>
      )}

      <div className="flex items-center gap-3 mb-4 flex-wrap">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Buscar por nome, especialidade ou e-mail"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 bg-secondary/50 border-border/50"
          />
        </div>
        <div className="flex items-center gap-2">
          <Switch checked={showInactive} onCheckedChange={setShowInactive} id="show-inactive" />
          <Label htmlFor="show-inactive" className="text-sm cursor-pointer">
            Mostrar inativos
          </Label>
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-10">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-10 text-muted-foreground text-sm">
          {pros.length === 0
            ? 'Nenhum profissional cadastrado ainda.'
            : 'Nenhum resultado para os filtros aplicados.'}
        </div>
      ) : (
        <div className="rounded-lg border border-border/50 overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Profissional</TableHead>
                <TableHead>Especialidade</TableHead>
                <TableHead>Contato</TableHead>
                <TableHead>Vínculo</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((p) => {
                const linkedMember = members.find((m) => m.id === p.linked_user_id);
                return (
                  <TableRow key={p.id}>
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <span
                          className="w-3 h-3 rounded-full shrink-0"
                          style={{ backgroundColor: p.color }}
                        />
                        <span className="font-medium">{p.name}</span>
                      </div>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {isMedical && p.crm ? (
                        <span>
                          {p.specialty || '—'}
                          <span className="ml-2 text-xs opacity-70">· {p.council_type || 'CRM'} {p.crm}</span>
                        </span>
                      ) : (
                        p.specialty || '—'
                      )}
                    </TableCell>
                    <TableCell className="text-muted-foreground text-xs">
                      {p.email && <div>{p.email}</div>}
                      {p.phone && <div>{formatBrPhone(p.phone)}</div>}
                      {!p.email && !p.phone && '—'}
                    </TableCell>
                    <TableCell className="text-muted-foreground text-xs">
                      {linkedMember ? linkedMember.name : '—'}
                    </TableCell>
                    <TableCell>
                      {p.is_active ? (
                        <Badge variant="outline" className="bg-emerald-500/15 text-emerald-500 border-emerald-500/30">
                          Ativo
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="bg-muted text-muted-foreground">
                          Inativo
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button variant="ghost" size="icon" onClick={() => openEdit(p)}>
                          <Pencil className="w-4 h-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => setConfirmDelete(p)}
                          className="text-destructive hover:text-destructive"
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Dialog de criação/edição */}
      <Dialog open={dialogOpen} onOpenChange={(o) => !upsert.isPending && setDialogOpen(o)}>
        <DialogContent className="max-w-lg w-[calc(100vw-1rem)] h-[100dvh] sm:h-auto sm:max-h-[90vh] overflow-hidden p-4 sm:p-6 flex flex-col">
          <DialogHeader>
            <DialogTitle>{form.id ? 'Editar profissional' : 'Novo profissional'}</DialogTitle>
            <DialogDescription>
              Profissionais aparecem na criação de agendamentos e podem receber relatórios diários.
            </DialogDescription>
          </DialogHeader>

          <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain space-y-4 py-2 -mx-1 px-1">
            <div className="space-y-2">
              <Label htmlFor="pro-name">Nome *</Label>
              <Input
                id="pro-name"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="Ex: Dra. Mariana Costa"
                className="bg-secondary/50 border-border/50"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="pro-specialty">Especialidade</Label>
              <Input
                id="pro-specialty"
                value={form.specialty}
                onChange={(e) => setForm({ ...form, specialty: e.target.value })}
                placeholder={isMedical ? 'Ex: Cardiologia' : 'Ex: Consultora financeira'}
                className="bg-secondary/50 border-border/50"
              />
            </div>

            {isMedical && (
              <>
                <div className="grid grid-cols-[140px_1fr] gap-3">
                  <div className="space-y-2">
                    <Label htmlFor="pro-council">Conselho</Label>
                    <Select
                      value={form.council_type}
                      onValueChange={(v) => setForm({ ...form, council_type: v })}
                    >
                      <SelectTrigger id="pro-council" className="bg-secondary/50 border-border/50">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {COUNCIL_TYPES.map((c) => (
                          <SelectItem key={c} value={c}>{c}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="pro-crm">Registro</Label>
                    <Input
                      id="pro-crm"
                      value={form.crm}
                      onChange={(e) => setForm({ ...form, crm: e.target.value })}
                      placeholder="Ex: 123456/SP"
                      className="bg-secondary/50 border-border/50"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="pro-bio">Mini bio</Label>
                  <Textarea
                    id="pro-bio"
                    value={form.bio}
                    onChange={(e) => setForm({ ...form, bio: e.target.value })}
                    placeholder="Formação, áreas de atuação, etc."
                    rows={3}
                    className="bg-secondary/50 border-border/50 resize-none"
                  />
                </div>
              </>
            )}


            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="pro-email">E-mail</Label>
                <Input
                  id="pro-email"
                  type="email"
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                  placeholder="profissional@empresa.com"
                  className="bg-secondary/50 border-border/50"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="pro-phone">Telefone (WhatsApp)</Label>
                <Input
                  id="pro-phone"
                  value={form.phone}
                  onChange={(e) => setForm({ ...form, phone: formatBrPhone(e.target.value) })}
                  placeholder="(11) 99999-9999"
                  className="bg-secondary/50 border-border/50"
                />
              </div>
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
                      form.color === c
                        ? 'border-foreground scale-110'
                        : 'border-transparent opacity-70 hover:opacity-100'
                    }`}
                    style={{ backgroundColor: c }}
                    aria-label={`Cor ${c}`}
                  />
                ))}
              </div>
            </div>

            {/* Jornada de trabalho */}
            <div className="space-y-3 rounded-md border border-border bg-card/40 p-3">
              <div>
                <Label className="text-sm">Jornada de trabalho</Label>
                <p className="text-xs text-muted-foreground">
                  Define quando este profissional pode receber agendamentos.
                </p>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="pro-start" className="text-xs">Início</Label>
                  <Input
                    id="pro-start"
                    type="time"
                    value={form.work_start_time}
                    onChange={(e) => setForm({ ...form, work_start_time: e.target.value })}
                    className="bg-secondary/50 border-border/50"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="pro-end" className="text-xs">Fim</Label>
                  <Input
                    id="pro-end"
                    type="time"
                    value={form.work_end_time}
                    onChange={(e) => setForm({ ...form, work_end_time: e.target.value })}
                    className="bg-secondary/50 border-border/50"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs">Dias trabalhados</Label>
                <div className="flex gap-1.5">
                  {WEEKDAYS.map((d, idx) => {
                    const active = form.work_days.includes(d.value);
                    return (
                      <button
                        key={`${d.value}-${idx}`}
                        type="button"
                        onClick={() => toggleWorkday(d.value)}
                        className={`w-9 h-9 rounded-md border text-xs font-medium transition ${
                          active
                            ? 'bg-primary text-primary-foreground border-primary'
                            : 'bg-secondary/50 border-border/50 text-muted-foreground hover:bg-secondary'
                        }`}
                        aria-label={`Dia ${d.value}`}
                      >
                        {d.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="pro-buffer" className="text-xs">Intervalo entre reuniões</Label>
                <div className="flex items-center gap-2">
                  <Input
                    id="pro-buffer"
                    type="number"
                    min={0}
                    max={120}
                    step={5}
                    value={form.buffer_minutes}
                    onChange={(e) => setForm({ ...form, buffer_minutes: Math.max(0, Number(e.target.value) || 0) })}
                    className="bg-secondary/50 border-border/50 w-24"
                  />
                  <span className="text-xs text-muted-foreground">minutos</span>
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="pro-linked">Vincular a um usuário do sistema (opcional)</Label>
              <Select
                value={form.linked_user_id || 'none'}
                onValueChange={(v) =>
                  setForm({ ...form, linked_user_id: v === 'none' ? null : v })
                }
              >
                <SelectTrigger className="bg-secondary/50 border-border/50">
                  <SelectValue placeholder="Nenhum" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Nenhum (profissional externo)</SelectItem>
                  {members.map((m) => (
                    <SelectItem key={m.id} value={m.id}>
                      {m.name} — {m.email}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Quando vinculado, o usuário poderá receber relatórios diários no painel.
              </p>
            </div>

            <div className="flex items-center justify-between pt-2 border-t border-border/50">
              <div>
                <Label htmlFor="pro-active">Profissional ativo</Label>
                <p className="text-xs text-muted-foreground">
                  Inativos não aparecem na criação de novos agendamentos.
                </p>
              </div>
              <Switch
                id="pro-active"
                checked={form.is_active}
                onCheckedChange={(c) => setForm({ ...form, is_active: c })}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)} disabled={upsert.isPending}>
              Cancelar
            </Button>
            <Button variant="glow" onClick={handleSave} disabled={!form.name.trim() || upsert.isPending}>
              {upsert.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              {form.id ? 'Salvar alterações' : 'Criar profissional'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Confirmação de exclusão */}
      <AlertDialog open={!!confirmDelete} onOpenChange={(o) => !o && setConfirmDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover profissional?</AlertDialogTitle>
            <AlertDialogDescription>
              {confirmDelete?.name} será removido. Agendamentos existentes deste profissional
              podem ficar sem responsável. Considere apenas desativá-lo se já houver agendamentos.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={remove.isPending}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={remove.isPending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {remove.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Remover
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Wrapper>
  );
}
