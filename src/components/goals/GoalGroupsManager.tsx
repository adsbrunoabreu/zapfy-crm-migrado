import { useState } from 'react';
import { Plus, Trash2, Users, Loader2, X } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Checkbox } from '@/components/ui/checkbox';
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
import { useGoalGroups, useUpsertGoalGroup, useDeleteGoalGroup, GoalGroup } from '@/hooks/useGoalGroups';
import { useTeamMembers } from '@/hooks/useTeamMembers';
import { cn } from '@/lib/utils';

const COLORS = ['#6366f1', '#22c55e', '#f59e0b', '#ef4444', '#ec4899', '#06b6d4', '#a855f7', '#84cc16'];

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
}

export function GoalGroupsManager({ open, onOpenChange }: Props) {
  const { data: groups = [], isLoading } = useGoalGroups();
  const { data: members = [] } = useTeamMembers();
  const upsert = useUpsertGoalGroup();
  const remove = useDeleteGoalGroup();

  const [editing, setEditing] = useState<GoalGroup | null>(null);
  const [name, setName] = useState('');
  const [color, setColor] = useState(COLORS[0]);
  const [memberIds, setMemberIds] = useState<Set<string>>(new Set());
  const [confirmDelete, setConfirmDelete] = useState<GoalGroup | null>(null);
  const [formOpen, setFormOpen] = useState(false);

  const openForm = (g?: GoalGroup) => {
    if (g) {
      setEditing(g);
      setName(g.name);
      setColor(g.color);
      setMemberIds(new Set((g.members ?? []).map((m) => m.user_id)));
    } else {
      setEditing(null);
      setName('');
      setColor(COLORS[0]);
      setMemberIds(new Set());
    }
    setFormOpen(true);
  };

  const toggleMember = (id: string) => {
    setMemberIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleSave = async () => {
    if (!name.trim()) return;
    await upsert.mutateAsync({
      id: editing?.id,
      name: name.trim(),
      color,
      member_ids: Array.from(memberIds),
    });
    setFormOpen(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[560px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Users className="w-5 h-5 text-primary" /> Grupos da equipe
          </DialogTitle>
          <DialogDescription>
            Crie squads (ex: Vendas SP, SDR Norte) para atribuir metas de equipe.
          </DialogDescription>
        </DialogHeader>

        {!formOpen ? (
          <div className="space-y-3">
            <Button onClick={() => openForm()} size="sm" className="gap-2">
              <Plus className="w-4 h-4" /> Novo grupo
            </Button>

            {isLoading ? (
              <div className="flex justify-center py-8">
                <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
              </div>
            ) : groups.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">Nenhum grupo criado ainda.</p>
            ) : (
              <ScrollArea className="max-h-[320px]">
                <div className="space-y-2">
                  {groups.map((g) => (
                    <div
                      key={g.id}
                      className="flex items-center gap-3 p-3 rounded-lg border border-border/60 hover:bg-secondary/30"
                    >
                      <div
                        className="w-3 h-3 rounded-full shrink-0"
                        style={{ backgroundColor: g.color }}
                      />
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-sm truncate">{g.name}</p>
                        <p className="text-[11px] text-muted-foreground">
                          {g.members?.length ?? 0} membro(s)
                        </p>
                      </div>
                      <Button size="sm" variant="ghost" onClick={() => openForm(g)}>
                        Editar
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="text-destructive h-8 w-8"
                        onClick={() => setConfirmDelete(g)}
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            )}
          </div>
        ) : (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Nome do grupo</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex: Vendas SP" autoFocus />
            </div>

            <div className="space-y-2">
              <Label>Cor</Label>
              <div className="flex gap-1.5">
                {COLORS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setColor(c)}
                    className={cn(
                      'w-7 h-7 rounded-full transition-all',
                      color === c ? 'ring-2 ring-offset-2 ring-offset-background ring-primary' : 'hover:scale-110',
                    )}
                    style={{ backgroundColor: c }}
                  />
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <Label>Membros ({memberIds.size})</Label>
              <ScrollArea className="h-[200px] rounded-md border border-border/60 p-2">
                <div className="space-y-1">
                  {members.map((m: any) => (
                    <label
                      key={m.id}
                      className="flex items-center gap-2 p-2 rounded-md hover:bg-secondary/40 cursor-pointer"
                    >
                      <Checkbox checked={memberIds.has(m.id)} onCheckedChange={() => toggleMember(m.id)} />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm truncate">{m.name || m.email}</p>
                        {m.name && <p className="text-[10px] text-muted-foreground truncate">{m.email}</p>}
                      </div>
                    </label>
                  ))}
                </div>
              </ScrollArea>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setFormOpen(false)}>
                Cancelar
              </Button>
              <Button onClick={handleSave} disabled={!name.trim() || upsert.isPending}>
                {upsert.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                Salvar
              </Button>
            </div>
          </div>
        )}

        <AlertDialog open={!!confirmDelete} onOpenChange={(o) => !o && setConfirmDelete(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Excluir grupo</AlertDialogTitle>
              <AlertDialogDescription>
                Todas as metas de equipe vinculadas a "{confirmDelete?.name}" também serão removidas. Esta ação não pode ser desfeita.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancelar</AlertDialogCancel>
              <AlertDialogAction
                onClick={async () => {
                  if (confirmDelete) await remove.mutateAsync(confirmDelete.id);
                  setConfirmDelete(null);
                }}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                Excluir
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </DialogContent>
    </Dialog>
  );
}
