import { useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Loader2, UserPlus, Building2, Trash2, Link2 } from 'lucide-react';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { usePendingUsers, useLinkUserToCompany, useCreateCompanyForUser, type PendingUser } from '@/hooks/usePendingUsers';
import { useDeleteUser } from '@/hooks/useAllUsers';
import { useCompanies } from '@/hooks/useCompanies';
import { useToast } from '@/hooks/use-toast';

export function PendingUsersTab() {
  const { data: pending = [], isLoading } = usePendingUsers();
  const { data: companies = [] } = useCompanies();
  const link = useLinkUserToCompany();
  const createForUser = useCreateCompanyForUser();
  const del = useDeleteUser();
  const { toast } = useToast();

  const [linkTarget, setLinkTarget] = useState<PendingUser | null>(null);
  const [companyId, setCompanyId] = useState<string>('');
  const [createTarget, setCreateTarget] = useState<PendingUser | null>(null);
  const [companyName, setCompanyName] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<PendingUser | null>(null);

  const handleLink = async () => {
    if (!linkTarget || !companyId) return;
    try {
      await link.mutateAsync({ user_id: linkTarget.id, company_id: companyId });
      toast({ title: 'Vinculado', description: `${linkTarget.full_name || linkTarget.email} agora pertence à empresa.` });
      setLinkTarget(null);
      setCompanyId('');
    } catch (e: any) {
      toast({ title: 'Erro', description: e.message, variant: 'destructive' });
    }
  };

  const handleCreate = async () => {
    if (!createTarget || !companyName.trim()) return;
    try {
      await createForUser.mutateAsync({ user_id: createTarget.id, company_name: companyName.trim() });
      toast({ title: 'Empresa criada', description: `${companyName} criada e vinculada a ${createTarget.full_name || createTarget.email}.` });
      setCreateTarget(null);
      setCompanyName('');
    } catch (e: any) {
      toast({ title: 'Erro', description: e.message, variant: 'destructive' });
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      await del.mutateAsync(deleteTarget.id);
      toast({ title: 'Usuário excluído' });
      setDeleteTarget(null);
    } catch (e: any) {
      toast({ title: 'Erro', description: e.message, variant: 'destructive' });
    }
  };

  if (isLoading) {
    return <div className="flex items-center justify-center h-40"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>;
  }

  return (
    <>
      <Card className="glass-card overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="border-b border-border hover:bg-transparent">
              <TableHead>Nome</TableHead>
              <TableHead>E-mail</TableHead>
              <TableHead>Papel</TableHead>
              <TableHead>Cadastro</TableHead>
              <TableHead className="text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody className="divide-y divide-border">
            {pending.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center py-10 text-muted-foreground">
                  Nenhum usuário pendente. Tudo certo!
                </TableCell>
              </TableRow>
            ) : (
              pending.map((u) => (
                <TableRow key={u.id} className="border-0 hover:bg-muted/40">
                  <TableCell className="font-medium">{u.full_name || '—'}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{u.email}</TableCell>
                  <TableCell className="text-sm">{u.role}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {format(new Date(u.created_at), "dd/MM/yyyy HH:mm", { locale: ptBR })}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center justify-end gap-1">
                      <Button variant="ghost" size="sm" onClick={() => { setLinkTarget(u); setCompanyId(''); }}>
                        <Link2 className="w-4 h-4 mr-1" /> Vincular
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => { setCreateTarget(u); setCompanyName(u.full_name ? `Empresa de ${u.full_name}` : ''); }}>
                        <Building2 className="w-4 h-4 mr-1" /> Criar empresa
                      </Button>
                      <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive hover:bg-destructive/10" onClick={() => setDeleteTarget(u)}>
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </Card>

      {/* Link to existing company */}
      <Dialog open={!!linkTarget} onOpenChange={(o) => !o && setLinkTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Vincular {linkTarget?.full_name || linkTarget?.email} a uma empresa</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <Label>Empresa</Label>
            <Select value={companyId} onValueChange={setCompanyId}>
              <SelectTrigger><SelectValue placeholder="Selecionar empresa..." /></SelectTrigger>
              <SelectContent>
                {companies.map((c) => (
                  <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setLinkTarget(null)}>Cancelar</Button>
            <Button onClick={handleLink} disabled={!companyId || link.isPending}>
              {link.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Vincular como admin
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Create company for user */}
      <Dialog open={!!createTarget} onOpenChange={(o) => !o && setCreateTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Criar empresa para {createTarget?.full_name || createTarget?.email}</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <Label>Nome da empresa</Label>
            <Input value={companyName} onChange={(e) => setCompanyName(e.target.value)} placeholder="Ex: Acme LTDA" />
            <p className="text-xs text-muted-foreground">A empresa será criada em modo trial. O usuário será vinculado como admin. Você pode completar os dados cadastrais depois.</p>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setCreateTarget(null)}>Cancelar</Button>
            <Button onClick={handleCreate} disabled={!companyName.trim() || createForUser.isPending}>
              {createForUser.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Criar e vincular
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirm */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir definitivamente?</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteTarget?.full_name || deleteTarget?.email} será removido do login, perfil e papéis. Ação irreversível.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive hover:bg-destructive/90">Excluir</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
