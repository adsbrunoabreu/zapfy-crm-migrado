/**
 * Painel Master para gerenciar (CRUD) os itens do roadmap e visualizar
 * sugestões enviadas pelos usuários. Status disponíveis:
 *   - done            → "Pronto"
 *   - in_progress     → "Em desenvolvimento"
 *   - soon            → "Em breve"
 */
import { useEffect, useMemo, useState } from 'react';
import {
  Rocket, Loader2, Plus, Filter, MessageSquare, Pencil, Trash2,
} from 'lucide-react';
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import { PageShell } from '@/components/layout/PageShell';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Slider } from '@/components/ui/slider';
import { Progress } from '@/components/ui/progress';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger,
} from '@/components/ui/dialog';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader,
  AlertDialogTitle, AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import {
  getRoadmapIcon, ROADMAP_ICON_KEYS, STATUS_LABEL,
  type RoadmapItemRow, type RoadmapStatus,
} from '@/data/roadmapItems';
import { RoadmapStatusBadge } from '@/components/roadmap/RoadmapStatusBadge';

type StatusFilter = 'all' | RoadmapStatus;
type AddonFilter = 'all' | 'addon' | 'core';

const CATEGORY_LABEL: Record<string, string> = {
  feature: 'Nova funcionalidade',
  improvement: 'Melhoria',
  integration: 'Integração',
  bug: 'Problema / Bug',
  other: 'Outro',
};

export default function AdminRoadmap() {
  const qc = useQueryClient();
  const [status, setStatus] = useState<StatusFilter>('all');
  const [addon, setAddon] = useState<AddonFilter>('all');
  const [search, setSearch] = useState('');
  const [sgStatus, setSgStatus] = useState<string>('all');
  const [sgCategory, setSgCategory] = useState<string>('all');
  const [editing, setEditing] = useState<RoadmapItemRow | null>(null);
  const [creating, setCreating] = useState(false);

  const { data: items = [], isLoading } = useQuery({
    queryKey: ['admin-roadmap-items'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('roadmap_items' as any)
        .select('*')
        .order('sort_order', { ascending: true })
        .limit(500);
      if (error) throw error;
      return (data ?? []) as unknown as RoadmapItemRow[];
    },
    staleTime: 60_000,
  });

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return items.filter((it) => {
      if (status !== 'all' && it.status !== status) return false;
      if (addon === 'addon' && !it.addon) return false;
      if (addon === 'core' && it.addon) return false;
      if (term && !`${it.title} ${it.description}`.toLowerCase().includes(term)) return false;
      return true;
    });
  }, [items, status, addon, search]);

  const counts = useMemo(() => ({
    total: items.length,
    done: items.filter((i) => i.status === 'done').length,
    inProgress: items.filter((i) => i.status === 'in_progress').length,
    soon: items.filter((i) => i.status === 'soon').length,
    addons: items.filter((i) => i.addon).length,
  }), [items]);

  const removeItem = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('roadmap_items' as any).delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success('Item removido');
      qc.invalidateQueries({ queryKey: ['admin-roadmap-items'] });
      qc.invalidateQueries({ queryKey: ['roadmap-items-public'] });
    },
    onError: (e: any) => toast.error(e?.message || 'Erro ao remover'),
  });

  const quickStatus = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: RoadmapStatus }) => {
      const patch: Record<string, any> = { status };
      if (status === 'done') patch.released_at = new Date().toISOString();
      const { error } = await supabase
        .from('roadmap_items' as any)
        .update(patch)
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success('Status atualizado');
      qc.invalidateQueries({ queryKey: ['admin-roadmap-items'] });
      qc.invalidateQueries({ queryKey: ['roadmap-items-public'] });
    },
    onError: (e: any) => toast.error(e?.message || 'Erro ao atualizar status'),
  });

  const { data: suggestions = [], isLoading: loadingSg } = useQuery({
    queryKey: ['admin-roadmap-suggestions', sgStatus, sgCategory],
    queryFn: async () => {
      let q = supabase
        .from('roadmap_suggestions' as any)
        .select('*')
        .order('created_at', { ascending: false })
        .limit(500);
      if (sgStatus !== 'all') q = q.eq('status', sgStatus);
      if (sgCategory !== 'all') q = q.eq('category', sgCategory);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as any[];
    },
    staleTime: 60_000,
  });

  return (
    <PageShell
      icon={<Rocket className="w-5 h-5" />}
      title="Roadmap (Master)"
      subtitle="Controle os itens do roadmap (Pronto, Em desenvolvimento, Em breve) e veja sugestões dos usuários."
      actions={
        <Button onClick={() => setCreating(true)} size="sm" className="gap-1.5">
          <Plus className="w-4 h-4" /> Novo item
        </Button>
      }
    >
      <div className="space-y-8">

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <StatCard label="Total" value={counts.total} />
        <StatCard label="Pronto" value={counts.done} />
        <StatCard label="Em desenvolvimento" value={counts.inProgress} />
        <StatCard label="Em breve" value={counts.soon} />
        <StatCard label="Add-ons" value={counts.addons} />
      </div>

      <Card className="p-5 space-y-4">
        <div className="flex items-center gap-2">
          <Filter className="w-4 h-4 text-muted-foreground" />
          <h2 className="font-display text-lg font-bold">Itens do roadmap</h2>
          <Badge variant="outline" className="ml-auto">{filtered.length} resultado(s)</Badge>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div className="space-y-1.5">
            <Label>Status</Label>
            <Select value={status} onValueChange={(v) => setStatus(v as StatusFilter)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os status</SelectItem>
                <SelectItem value="done">Pronto</SelectItem>
                <SelectItem value="in_progress">Em desenvolvimento</SelectItem>
                <SelectItem value="soon">Em breve</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Tipo</Label>
            <Select value={addon} onValueChange={(v) => setAddon(v as AddonFilter)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os tipos</SelectItem>
                <SelectItem value="addon">Apenas add-ons</SelectItem>
                <SelectItem value="core">Apenas recursos nativos</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Buscar</Label>
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Título ou descrição..."
            />
          </div>
        </div>

        {isLoading ? (
          <div className="py-10 text-center text-sm text-muted-foreground">
            <Loader2 className="w-4 h-4 animate-spin inline mr-2" /> Carregando...
          </div>
        ) : (
          <div className="rounded-lg border border-border overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[60px]">Ordem</TableHead>
                  <TableHead>Item</TableHead>
                  <TableHead className="w-[200px]">Status</TableHead>
                  <TableHead className="w-[160px]">Progresso</TableHead>
                  <TableHead className="w-[90px]">Add-on</TableHead>
                  <TableHead className="w-[120px] text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center text-sm text-muted-foreground py-10">
                      Nenhum item para os filtros atuais.
                    </TableCell>
                  </TableRow>
                ) : filtered.map((item) => {
                  const Icon = getRoadmapIcon(item.icon);
                  return (
                    <TableRow key={item.id}>
                      <TableCell className="text-xs text-muted-foreground">{item.sort_order}</TableCell>
                      <TableCell>
                        <div className="flex items-start gap-3">
                          <div className="w-8 h-8 rounded-lg bg-muted border border-border flex items-center justify-center shrink-0">
                            <Icon className="w-4 h-4 text-foreground" />
                          </div>
                          <div className="min-w-0">
                            <div className="font-medium">{item.title}</div>
                            <div className="text-xs text-muted-foreground line-clamp-2 mt-0.5">
                              {item.description}
                            </div>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Select
                          value={item.status}
                          onValueChange={(v) => quickStatus.mutate({ id: item.id, status: v as RoadmapStatus })}
                        >
                          <SelectTrigger className="h-8">
                            <SelectValue>
                              <RoadmapStatusBadge status={item.status} />
                            </SelectValue>
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="done">Pronto</SelectItem>
                            <SelectItem value="in_progress">Em desenvolvimento</SelectItem>
                            <SelectItem value="soon">Em breve</SelectItem>
                          </SelectContent>
                        </Select>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Progress value={item.progress ?? 0} className="h-1.5 flex-1" />
                          <span className="text-xs tabular-nums w-9 text-right text-muted-foreground">
                            {item.progress ?? 0}%
                          </span>
                        </div>
                      </TableCell>
                      <TableCell>
                        {item.addon ? (
                          <Badge variant="outline" className="border-amber-500/40 text-amber-500 bg-amber-500/10">
                            Sim
                          </Badge>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Button size="icon" variant="ghost" onClick={() => setEditing(item)}>
                            <Pencil className="w-4 h-4" />
                          </Button>
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button size="icon" variant="ghost" className="text-destructive">
                                <Trash2 className="w-4 h-4" />
                              </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>Remover item?</AlertDialogTitle>
                                <AlertDialogDescription>
                                  Esta ação não pode ser desfeita. O item "{item.title}" será removido do roadmap.
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>Cancelar</AlertDialogCancel>
                                <AlertDialogAction
                                  onClick={() => removeItem.mutate(item.id)}
                                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                >
                                  Remover
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </Card>

      <Card className="p-5 space-y-4">
        <div className="flex items-center gap-2">
          <MessageSquare className="w-4 h-4 text-muted-foreground" />
          <h2 className="font-display text-lg font-bold">Sugestões enviadas</h2>
          <Badge variant="outline" className="ml-auto">{suggestions.length}</Badge>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label>Status</Label>
            <Select value={sgStatus} onValueChange={setSgStatus}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                <SelectItem value="new">Nova</SelectItem>
                <SelectItem value="reviewing">Em análise</SelectItem>
                <SelectItem value="planned">Planejada</SelectItem>
                <SelectItem value="done">Implementada</SelectItem>
                <SelectItem value="rejected">Rejeitada</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Categoria</Label>
            <Select value={sgCategory} onValueChange={setSgCategory}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas</SelectItem>
                {Object.entries(CATEGORY_LABEL).map(([k, v]) => (
                  <SelectItem key={k} value={k}>{v}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="rounded-lg border border-border overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[140px]">Data</TableHead>
                <TableHead className="w-[160px]">Categoria</TableHead>
                <TableHead>Título / Descrição</TableHead>
                <TableHead className="w-[120px]">Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loadingSg ? (
                <TableRow><TableCell colSpan={4} className="text-center text-sm text-muted-foreground py-10">Carregando sugestões...</TableCell></TableRow>
              ) : suggestions.length === 0 ? (
                <TableRow><TableCell colSpan={4} className="text-center text-sm text-muted-foreground py-10">Nenhuma sugestão para os filtros atuais.</TableCell></TableRow>
              ) : suggestions.map((s) => (
                <TableRow key={s.id}>
                  <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                    {new Date(s.created_at).toLocaleString('pt-BR')}
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline">{CATEGORY_LABEL[s.category] ?? s.category}</Badge>
                  </TableCell>
                  <TableCell>
                    <div className="font-medium">{s.title}</div>
                    <div className="text-xs text-muted-foreground line-clamp-2 mt-0.5">{s.description}</div>
                  </TableCell>
                  <TableCell><Badge variant="outline" className="capitalize">{s.status}</Badge></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </Card>

      <ItemFormDialog
        open={creating || !!editing}
        item={editing}
        onClose={() => { setEditing(null); setCreating(false); }}
        onSaved={() => {
          qc.invalidateQueries({ queryKey: ['admin-roadmap-items'] });
          qc.invalidateQueries({ queryKey: ['roadmap-items-public'] });
        }}
      />
      </div>
    </PageShell>
  );
}

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <Card className="p-4">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-2xl font-display font-bold mt-1">{value}</div>
    </Card>
  );
}

function ItemFormDialog({
  open, item, onClose, onSaved,
}: {
  open: boolean;
  item: RoadmapItemRow | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const isEdit = !!item;
  const [title, setTitle] = useState(item?.title ?? '');
  const [description, setDescription] = useState(item?.description ?? '');
  const [icon, setIcon] = useState(item?.icon ?? 'Sparkles');
  const [status, setStatus] = useState<RoadmapStatus>(item?.status ?? 'soon');
  const [addon, setAddon] = useState<boolean>(item?.addon ?? false);
  const [sortOrder, setSortOrder] = useState<number>(item?.sort_order ?? 100);
  const [progress, setProgress] = useState<number>(item?.progress ?? 0);
  const [saving, setSaving] = useState(false);

  // Reset state when dialog opens with a different item
  useEffect(() => {
    if (open) {
      setTitle(item?.title ?? '');
      setDescription(item?.description ?? '');
      setIcon(item?.icon ?? 'Sparkles');
      setStatus(item?.status ?? 'soon');
      setAddon(item?.addon ?? false);
      setSortOrder(item?.sort_order ?? 100);
      setProgress(item?.progress ?? 0);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, item?.id]);

  const Icon = getRoadmapIcon(icon);

  const handleSave = async () => {
    if (title.trim().length < 3 || description.trim().length < 5) {
      toast.error('Preencha título e descrição.');
      return;
    }
    setSaving(true);
    try {
      const payload: Record<string, any> = {
        title: title.trim(),
        description: description.trim(),
        icon,
        status,
        addon,
        sort_order: Number.isFinite(sortOrder) ? sortOrder : 100,
        progress: Math.max(0, Math.min(100, Math.round(progress))),
      };
      if (status === 'done') {
        payload.progress = 100;
        if (!item || item.status !== 'done') {
          payload.released_at = new Date().toISOString();
        }
      }
      if (status === 'soon' && (payload.progress ?? 0) > 0) {
        payload.progress = 0;
      }
      if (isEdit && item) {
        const { error } = await supabase
          .from('roadmap_items' as any)
          .update(payload)
          .eq('id', item.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('roadmap_items' as any).insert(payload);
        if (error) throw error;
      }
      toast.success(isEdit ? 'Item atualizado' : 'Item criado');
      onSaved();
      onClose();
    } catch (e: any) {
      toast.error(e?.message || 'Erro ao salvar');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Editar item do roadmap' : 'Novo item do roadmap'}</DialogTitle>
        </DialogHeader>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-1.5 md:col-span-2">
            <Label>Título</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={120} />
          </div>
          <div className="space-y-1.5 md:col-span-2">
            <Label>Descrição</Label>
            <Textarea
              rows={4}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              maxLength={1000}
            />
          </div>

          <div className="space-y-1.5">
            <Label>Status</Label>
            <Select value={status} onValueChange={(v) => setStatus(v as RoadmapStatus)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="done">{STATUS_LABEL.done}</SelectItem>
                <SelectItem value="in_progress">{STATUS_LABEL.in_progress}</SelectItem>
                <SelectItem value="soon">{STATUS_LABEL.soon}</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label>Ícone</Label>
            <Select value={icon} onValueChange={setIcon}>
              <SelectTrigger>
                <div className="flex items-center gap-2">
                  <Icon className="w-4 h-4" />
                  <span>{icon}</span>
                </div>
              </SelectTrigger>
              <SelectContent>
                {ROADMAP_ICON_KEYS.map((k) => {
                  const I = getRoadmapIcon(k);
                  return (
                    <SelectItem key={k} value={k}>
                      <div className="flex items-center gap-2">
                        <I className="w-4 h-4" />
                        <span>{k}</span>
                      </div>
                    </SelectItem>
                  );
                })}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label>Ordem</Label>
            <Input
              type="number"
              value={sortOrder}
              onChange={(e) => setSortOrder(parseInt(e.target.value, 10) || 0)}
            />
          </div>

          <div className="space-y-1.5 flex items-end">
            <div className="flex items-center justify-between w-full rounded-md border border-border p-3">
              <div>
                <div className="text-sm font-medium">Add-on</div>
                <div className="text-xs text-muted-foreground">Será comercializado como módulo opcional</div>
              </div>
              <Switch checked={addon} onCheckedChange={setAddon} />
            </div>
          </div>

          <div className="space-y-2 md:col-span-2">
            <div className="flex items-center justify-between">
              <Label>Progresso</Label>
              <span className="text-sm font-medium tabular-nums">{progress}%</span>
            </div>
            <Slider
              value={[progress]}
              min={0}
              max={100}
              step={5}
              onValueChange={(v) => setProgress(v[0] ?? 0)}
              disabled={status === 'soon'}
            />
            <Progress value={progress} className="h-1.5" />
            <p className="text-xs text-muted-foreground">
              {status === 'soon'
                ? 'Itens "Em breve" sempre ficam em 0%.'
                : status === 'done'
                ? 'Itens "Pronto" são salvos como 100%.'
                : 'Arraste para indicar quanto do recurso já está concluído.'}
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>Cancelar</Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            {isEdit ? 'Salvar alterações' : 'Criar item'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
