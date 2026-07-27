/**
 * Gerenciador genérico de catálogo (lista + dialog de criação/edição + soft delete).
 * Usado pelas abas Médicos, Convênios, Procedimentos e Hospitais/Clínicas.
 */
import { useState, useMemo, useEffect } from 'react';
import { Plus, Pencil, Trash2, Loader2, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';

export interface CatalogColumn<T> {
  key: string;
  label: string;
  render: (row: T) => React.ReactNode;
  className?: string;
}

interface Props<T extends { id: string; active?: boolean }> {
  title: string;
  description?: string;
  rows: T[];
  isLoading: boolean;
  columns: CatalogColumn<T>[];
  searchFn: (row: T, q: string) => boolean;
  getLabel: (row: T) => string;
  isActive: (row: T) => boolean;
  onToggleActive: (row: T, active: boolean) => Promise<void> | void;
  onDelete: (row: T) => Promise<void> | void;
  isDeleting?: boolean;
  // Formulário do dialog
  renderForm: (args: { row: T | null; onSaved: () => void; onCancel: () => void }) => React.ReactNode;
  addLabel?: string;
}

export function CatalogManager<T extends { id: string; active?: boolean }>(props: Props<T>) {
  const {
    title, description, rows, isLoading, columns, searchFn, getLabel,
    isActive, onToggleActive, onDelete, isDeleting, renderForm,
    addLabel = 'Adicionar',
  } = props;

  const [q, setQ] = useState('');
  const [editing, setEditing] = useState<T | null>(null);
  const [openForm, setOpenForm] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<T | null>(null);
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 30;

  const filtered = useMemo(() => {
    if (!q.trim()) return rows;
    const lower = q.toLowerCase();
    return rows.filter((r) => searchFn(r, lower));
  }, [rows, q, searchFn]);

  // Reset to page 1 when search query changes
  useEffect(() => { setPage(1); }, [q]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const showPagination = filtered.length > PAGE_SIZE;
  const paginated = useMemo(
    () => (showPagination
      ? filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE)
      : filtered),
    [filtered, currentPage, showPagination],
  );

  const openCreate = () => { setEditing(null); setOpenForm(true); };
  const openEdit = (row: T) => { setEditing(row); setOpenForm(true); };
  const close = () => { setOpenForm(false); setEditing(null); };

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
        <div>
          <h3 className="text-base font-semibold">{title}</h3>
          {description && <p className="text-sm text-muted-foreground mt-1">{description}</p>}
        </div>
        <Button onClick={openCreate} className="gap-2">
          <Plus className="w-4 h-4" /> {addLabel}
        </Button>
      </div>

      <div className="relative">
        <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Buscar..."
          className="pl-9 h-9"
        />
      </div>

      <div className="border border-border rounded-lg bg-card/40 overflow-hidden">
        <div className="grid border-b border-border bg-muted/30 px-3 py-2 text-xs font-medium text-muted-foreground"
             style={{ gridTemplateColumns: `${columns.map(() => '1fr').join(' ')} 90px 110px` }}>
          {columns.map((c) => <div key={c.key} className={c.className}>{c.label}</div>)}
          <div className="text-center">Ativo</div>
          <div className="text-right">Ações</div>
        </div>

        {isLoading ? (
          <div className="p-6 flex justify-center"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>
        ) : filtered.length === 0 ? (
          <p className="p-6 text-sm text-muted-foreground text-center">
            {q ? 'Nenhum resultado.' : 'Nenhum item cadastrado.'}
          </p>
        ) : (
          <div className="divide-y divide-border">
            {paginated.map((row) => (
              <div
                key={row.id}
                className="grid items-center px-3 py-2.5 hover:bg-accent/20 transition-colors"
                style={{ gridTemplateColumns: `${columns.map(() => '1fr').join(' ')} 90px 110px` }}
              >
                {columns.map((c) => <div key={c.key} className={c.className}>{c.render(row)}</div>)}
                <div className="flex justify-center">
                  <Switch
                    checked={isActive(row)}
                    onCheckedChange={(v) => onToggleActive(row, v)}
                  />
                </div>
                <div className="flex justify-end gap-1">
                  <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => openEdit(row)}>
                    <Pencil className="w-4 h-4" />
                  </Button>
                  <Button
                    size="icon" variant="ghost"
                    className="h-8 w-8 text-muted-foreground hover:text-destructive"
                    onClick={() => setConfirmDelete(row)}
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {showPagination && (
        <div className="flex items-center justify-between gap-3 px-1">
          <p className="text-xs text-muted-foreground">
            Mostrando <span className="font-medium text-foreground">{(currentPage - 1) * PAGE_SIZE + 1}</span>
            {' – '}
            <span className="font-medium text-foreground">{Math.min(currentPage * PAGE_SIZE, filtered.length)}</span>
            {' de '}
            <span className="font-medium text-foreground">{filtered.length}</span>
          </p>
          <div className="flex items-center gap-2">
            <Button
              size="sm" variant="outline"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={currentPage <= 1}
            >
              Anterior
            </Button>
            <span className="text-xs text-muted-foreground tabular-nums">
              Página {currentPage} / {totalPages}
            </span>
            <Button
              size="sm" variant="outline"
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={currentPage >= totalPages}
            >
              Próxima
            </Button>
          </div>
        </div>
      )}


      {/* Dialog criar/editar */}
      <Dialog open={openForm} onOpenChange={(o) => { if (!o) close(); }}>
        <DialogContent className="sm:max-w-[520px]">
          <DialogHeader>
            <DialogTitle>{editing ? 'Editar' : addLabel}</DialogTitle>
            <DialogDescription>
              {editing ? 'Atualize os dados e salve.' : 'Preencha os dados para cadastrar.'}
            </DialogDescription>
          </DialogHeader>
          {renderForm({ row: editing, onSaved: close, onCancel: close })}
        </DialogContent>
      </Dialog>

      {/* Confirmar exclusão */}
      <AlertDialog open={!!confirmDelete} onOpenChange={(o) => !o && setConfirmDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir "{confirmDelete ? getLabel(confirmDelete) : ''}"?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação não pode ser desfeita. Registros vinculados continuarão preservando o histórico, mas este item não aparecerá mais nos selects.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={async () => {
                if (!confirmDelete) return;
                await onDelete(confirmDelete);
                setConfirmDelete(null);
              }}
              disabled={isDeleting}
            >
              {isDeleting ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
