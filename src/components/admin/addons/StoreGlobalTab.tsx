import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  ShoppingBag, Plug, CheckCircle2, XCircle, Loader2, RefreshCw,
  Activity, ExternalLink, Building2, Plus, Unplug, KeyRound,
} from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { ConnectStoreWizard } from './ConnectStoreWizard';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';

interface IntegrationRow {
  id: string;
  company_id: string;
  company_name: string;
  ecommerce_enabled: boolean;
  provider: string;
  display_name: string;
  store_url: string;
  currency: string;
  status: 'active' | 'paused' | 'error' | string;
  product_count: number;
  last_sync_at: string | null;
  last_sync_error: string | null;
  created_at: string;
  token_last4: string | null;
  token_rotated_at: string | null;
}

const PROVIDERS = [
  {
    id: 'shopify',
    name: 'Shopify',
    status: 'available' as const,
    note: 'Admin REST API 2024-10. Token configurado por empresa em /store.',
    docsUrl: 'https://shopify.dev/docs/api/admin-rest',
  },
  { id: 'vnda', name: 'VNDA', status: 'roadmap' as const, note: 'Planejado para próximas sprints.' },
  { id: 'tray', name: 'Tray', status: 'roadmap' as const, note: 'Planejado para próximas sprints.' },
];

function StatusBadge({ status }: { status: string }) {
  if (status === 'active') {
    return (
      <Badge className="bg-emerald/10 text-emerald border-emerald/30 gap-1">
        <CheckCircle2 className="h-3 w-3" /> Conectado
      </Badge>
    );
  }
  if (status === 'error') {
    return (
      <Badge className="bg-destructive/10 text-destructive border-destructive/30 gap-1">
        <XCircle className="h-3 w-3" /> Erro
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className="text-muted-foreground gap-1">
      <Activity className="h-3 w-3" /> {status}
    </Badge>
  );
}

export function StoreGlobalTab() {
  const qc = useQueryClient();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [wizardOpen, setWizardOpen] = useState(false);
  const [wizardCompany, setWizardCompany] = useState<{ id?: string; name?: string }>({});
  const [rotateOpen, setRotateOpen] = useState(false);
  const [rotateTarget, setRotateTarget] = useState<{ id: string; name: string; storeUrl: string } | null>(null);

  const openWizard = (id?: string, name?: string) => {
    setWizardCompany({ id, name });
    setWizardOpen(true);
  };

  const openRotate = (row: IntegrationRow) => {
    setRotateTarget({ id: row.company_id, name: row.company_name, storeUrl: row.store_url });
    setRotateOpen(true);
  };

  const { data: integrations = [], isLoading } = useQuery({
    queryKey: ['admin-store-integrations'],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke('store-proxy', {
        body: { action: 'list_all' },
      });
      if (error) {
        const ctx = await error.context?.json?.().catch(() => null);
        throw new Error(ctx?.error || error.message);
      }
      return ((data as any)?.integrations ?? []) as IntegrationRow[];
    },
    staleTime: 60_000,
  });

  const testMutation = useMutation({
    mutationFn: async (row: IntegrationRow) => {
      const { data, error } = await supabase.functions.invoke('store-proxy', {
        body: { action: 'test', company_id: row.company_id },
      });
      if (error) {
        const ctx = await error.context?.json?.().catch(() => null);
        throw new Error(ctx?.error || error.message);
      }
      return data as { ok: boolean; error?: string; shop?: any };
    },
    onMutate: (row) => setBusyId(row.id),
    onSettled: () => setBusyId(null),
    onSuccess: (r, row) => {
      if (r.ok) toast.success(`${row.company_name}: conexão OK`);
      else toast.error(`${row.company_name}: ${r.error || 'falha'}`);
      qc.invalidateQueries({ queryKey: ['admin-store-integrations'] });
    },
    onError: (e: any) => toast.error(e?.message ?? 'Falha no teste'),
  });

  const syncMutation = useMutation({
    mutationFn: async (row: IntegrationRow) => {
      const { data, error } = await supabase.functions.invoke('store-proxy', {
        body: { action: 'sync', company_id: row.company_id },
      });
      if (error) {
        const ctx = await error.context?.json?.().catch(() => null);
        throw new Error(ctx?.error || error.message);
      }
      return data as { ok: boolean; count?: number };
    },
    onMutate: (row) => setBusyId(row.id),
    onSettled: () => setBusyId(null),
    onSuccess: (r, row) => {
      toast.success(`${row.company_name}: ${r.count ?? 0} produtos sincronizados`);
      qc.invalidateQueries({ queryKey: ['admin-store-integrations'] });
    },
    onError: (e: any) => toast.error(e?.message ?? 'Falha na sincronização'),
  });

  const disconnectMutation = useMutation({
    mutationFn: async (row: IntegrationRow) => {
      const { error } = await supabase.functions.invoke('store-proxy', {
        body: { action: 'disconnect', company_id: row.company_id },
      });
      if (error) {
        const ctx = await error.context?.json?.().catch(() => null);
        throw new Error(ctx?.error || error.message);
      }
    },
    onSuccess: (_r, row) => {
      toast.success(`${row.company_name}: loja desconectada`);
      qc.invalidateQueries({ queryKey: ['admin-store-integrations'] });
      qc.invalidateQueries({ queryKey: ['admin-store-unconnected'] });
    },
    onError: (e: any) => toast.error(e?.message ?? 'Falha ao desconectar'),
  });

  const { data: unconnected = [] } = useQuery({
    queryKey: ['admin-store-unconnected'],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke('store-proxy', {
        body: { action: 'list_unconnected' },
      });
      if (error) {
        const ctx = await error.context?.json?.().catch(() => null);
        throw new Error(ctx?.error || error.message);
      }
      return ((data as any)?.companies ?? []) as Array<{ id: string; name: string }>;
    },
    staleTime: 60_000,
  });

  const stats = {
    total: integrations.length,
    active: integrations.filter((i) => i.status === 'active').length,
    error: integrations.filter((i) => i.status === 'error').length,
    products: integrations.reduce((acc, i) => acc + (i.product_count ?? 0), 0),
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold flex items-center gap-2">
            <ShoppingBag className="h-4 w-4" /> Loja Virtual — Configurações Globais
          </h2>
          <p className="text-xs text-muted-foreground">
            Provedores disponíveis e status das lojas conectadas por empresa.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={() => qc.invalidateQueries({ queryKey: ['admin-store-integrations'] })}
            disabled={isLoading}
          >
            <RefreshCw className={cn('h-3.5 w-3.5 mr-2', isLoading && 'animate-spin')} /> Recarregar
          </Button>
          <Button size="sm" onClick={() => openWizard()}>
            <Plus className="h-3.5 w-3.5 mr-2" /> Conectar nova loja
          </Button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatTile label="Lojas conectadas" value={stats.total} />
        <StatTile label="Saudáveis" value={stats.active} accent="text-emerald" />
        <StatTile label="Com erro" value={stats.error} accent="text-destructive" />
        <StatTile label="Produtos sincronizados" value={stats.products} />
      </div>

      {/* Provedores */}
      <Card className="bg-background border-border">
        <CardContent className="p-5 space-y-3">
          <div className="flex items-center gap-2 text-sm font-medium">
            <Plug className="h-4 w-4" /> Provedores suportados
          </div>
          <div className="space-y-2">
            {PROVIDERS.map((p) => (
              <div key={p.id}
                className="flex items-center justify-between border border-border rounded p-3 bg-card/60">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <div className="text-sm font-medium">{p.name}</div>
                    {p.status === 'available' && p.docsUrl && (
                      <a href={p.docsUrl} target="_blank" rel="noreferrer"
                        className="text-[10px] text-muted-foreground hover:text-foreground inline-flex items-center gap-1">
                        docs <ExternalLink className="h-3 w-3" />
                      </a>
                    )}
                  </div>
                  <div className="text-xs text-muted-foreground">{p.note}</div>
                </div>
                {p.status === 'available' ? (
                  <Badge className="bg-emerald/10 text-emerald border-emerald/30 gap-1">
                    <CheckCircle2 className="h-3 w-3" /> Disponível
                  </Badge>
                ) : (
                  <Badge variant="outline" className="text-muted-foreground">Roadmap</Badge>
                )}
              </div>
            ))}
          </div>
          <p className="text-[11px] text-muted-foreground pt-1">
            Conexão simplificada: clique em <strong>Conectar nova loja</strong> e cole apenas a API key.
            Você pode conectar em nome de qualquer empresa.
          </p>
        </CardContent>
      </Card>

      {/* Empresas elegíveis sem loja */}
      {unconnected.length > 0 && (
        <Card className="bg-background border-border">
          <CardContent className="p-5 space-y-3">
            <div className="flex items-center gap-2 text-sm font-medium">
              <Plug className="h-4 w-4" /> Empresas com e-Commerce ativo sem loja conectada
              <Badge variant="outline" className="ml-auto text-[10px]">{unconnected.length}</Badge>
            </div>
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-2">
              {unconnected.map((c) => (
                <div key={c.id}
                  className="flex items-center justify-between border border-border rounded p-2.5 bg-card/60">
                  <div className="text-sm truncate">{c.name}</div>
                  <Button size="sm" variant="outline" onClick={() => openWizard(c.id, c.name)}>
                    <Plus className="h-3 w-3 mr-1" /> Conectar
                  </Button>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Lojas conectadas por empresa */}
      <Card className="bg-background border-border overflow-hidden">
        <div className="px-5 py-3 border-b border-border flex items-center gap-2">
          <Building2 className="h-4 w-4" />
          <h3 className="text-sm font-semibold">Lojas conectadas por empresa</h3>
          <Badge variant="outline" className="ml-auto text-[10px]">{integrations.length}</Badge>
        </div>
        <Table>
          <TableHeader>
            <TableRow className="border-border hover:bg-transparent">
              <TableHead>Empresa</TableHead>
              <TableHead>Provedor</TableHead>
              <TableHead>Loja</TableHead>
              <TableHead>Token</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Produtos</TableHead>
              <TableHead>Último sync</TableHead>
              <TableHead className="text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading && (
              <TableRow>
                <TableCell colSpan={8} className="text-center py-10">
                  <Loader2 className="h-5 w-5 animate-spin inline-block text-muted-foreground" />
                </TableCell>
              </TableRow>
            )}
            {!isLoading && integrations.length === 0 && (
              <TableRow>
                <TableCell colSpan={8} className="text-center py-10 text-muted-foreground text-sm">
                  Nenhuma empresa conectou uma loja ainda.
                </TableCell>
              </TableRow>
            )}
            {integrations.map((row) => {
              const busy = busyId === row.id;
              return (
                <TableRow key={row.id} className="border-border">
                  <TableCell>
                    <div className="font-medium text-sm">{row.company_name}</div>
                    {!row.ecommerce_enabled && (
                      <div className="text-[10px] text-amber">Add-on desativado</div>
                    )}
                  </TableCell>
                  <TableCell className="capitalize text-sm">{row.provider}</TableCell>
                  <TableCell>
                    <a
                      href={`https://${row.store_url}`}
                      target="_blank"
                      rel="noreferrer"
                      className="text-sm hover:underline inline-flex items-center gap-1"
                    >
                      {row.display_name}
                      <ExternalLink className="h-3 w-3 text-muted-foreground" />
                    </a>
                    <div className="text-[10px] text-muted-foreground">{row.store_url}</div>
                  </TableCell>
                  <TableCell>
                    {row.token_last4 ? (
                      <div className="text-xs">
                        <code className="font-mono text-foreground">••••{row.token_last4}</code>
                        <div className="text-[10px] text-muted-foreground mt-0.5">
                          {row.token_rotated_at
                            ? `rotacionado em ${new Date(row.token_rotated_at).toLocaleDateString('pt-BR')}`
                            : 'criptografado'}
                        </div>
                      </div>
                    ) : (
                      <span className="text-[10px] text-muted-foreground">legado</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <StatusBadge status={row.status} />
                    {row.last_sync_error && (
                      <div className="text-[10px] text-destructive mt-1 max-w-[260px] truncate"
                        title={row.last_sync_error}>
                        {row.last_sync_error}
                      </div>
                    )}
                  </TableCell>
                  <TableCell className="text-right text-sm font-mono">{row.product_count ?? 0}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {row.last_sync_at
                      ? new Date(row.last_sync_at).toLocaleString('pt-BR')
                      : '—'}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="inline-flex gap-1">
                      <Button size="sm" variant="outline" disabled={busy}
                        onClick={() => testMutation.mutate(row)}>
                        {busy && testMutation.isPending ? (
                          <Loader2 className="h-3 w-3 animate-spin" />
                        ) : (
                          <><Activity className="h-3 w-3 mr-1" /> Testar</>
                        )}
                      </Button>
                      <Button size="sm" variant="outline" disabled={busy}
                        onClick={() => syncMutation.mutate(row)}>
                        {busy && syncMutation.isPending ? (
                          <Loader2 className="h-3 w-3 animate-spin" />
                        ) : (
                          <><RefreshCw className="h-3 w-3 mr-1" /> Sync</>
                        )}
                      </Button>
                      <Button size="sm" variant="outline"
                        onClick={() => openRotate(row)}>
                        <KeyRound className="h-3 w-3 mr-1" /> Rotacionar
                      </Button>
                      <Button size="sm" variant="outline"
                        onClick={() => openWizard(row.company_id, row.company_name)}>
                        <Plug className="h-3 w-3 mr-1" /> Reconectar
                      </Button>
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button size="sm" variant="outline"
                            className="text-destructive hover:text-destructive">
                            <Unplug className="h-3 w-3" />
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent className="bg-background border-border">
                          <AlertDialogHeader>
                            <AlertDialogTitle>Desconectar loja de {row.company_name}?</AlertDialogTitle>
                            <AlertDialogDescription>
                              Os produtos sincronizados desta loja serão removidos. Esta ação não pode ser desfeita.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancelar</AlertDialogCancel>
                            <AlertDialogAction
                              onClick={() => disconnectMutation.mutate(row)}
                              className="bg-destructive hover:bg-destructive">
                              Desconectar
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
      </Card>

      <ConnectStoreWizard
        open={wizardOpen}
        onOpenChange={setWizardOpen}
        isMaster
        forcedCompanyId={wizardCompany.id}
        forcedCompanyName={wizardCompany.name}
      />
      {rotateTarget && (
        <ConnectStoreWizard
          open={rotateOpen}
          onOpenChange={(v) => { setRotateOpen(v); if (!v) setRotateTarget(null); }}
          isMaster
          rotateMode
          rotateStoreUrl={rotateTarget.storeUrl}
          forcedCompanyId={rotateTarget.id}
          forcedCompanyName={rotateTarget.name}
        />
      )}
    </div>
  );
}

function StatTile({ label, value, accent }: { label: string; value: number; accent?: string }) {
  return (
    <Card className="p-4 bg-background border-border">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={cn('text-2xl font-semibold mt-1', accent)}>{value}</div>
    </Card>
  );
}
