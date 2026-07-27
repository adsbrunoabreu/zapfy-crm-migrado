import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { PageShell } from '@/components/layout/PageShell';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { ConnectStoreWizard } from '@/components/admin/addons/ConnectStoreWizard';
import { ShoppingBag, Plug, RefreshCw, Lock, Trash2, ExternalLink, KeyRound } from 'lucide-react';
import { useCompanyAddons } from '@/hooks/useCompanyAddons';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { StoreCouponsTab } from '@/components/store/StoreCouponsTab';
import { StoreSyncProgress } from '@/components/store/StoreSyncProgress';
import { StoreJobsAuditPanel } from '@/components/store/StoreJobsAuditPanel';

interface Integration {
  id: string;
  provider: string;
  display_name: string;
  store_url: string;
  currency: string;
  status: string;
  product_count: number;
  last_sync_at: string | null;
  last_sync_error: string | null;
  token_last4: string | null;
  token_rotated_at: string | null;
}

interface Product {
  id: string;
  title: string;
  sku: string | null;
  price: number;
  stock: number | null;
  image_url: string | null;
  product_url: string | null;
  is_active: boolean;
}

interface Cart {
  id: string;
  total: number;
  currency: string;
  status: string;
  checkout_url: string;
  created_at: string;
  items: Array<{ title: string; quantity: number }>;
}

const fmtBRL = (v: number, currency = 'BRL') =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency }).format(v ?? 0);

export default function Store() {
  const { profile } = useAuth();
  const { addons, isLoading: loadingAddons, isMaster } = useCompanyAddons();
  const qc = useQueryClient();
  const [tab, setTab] = useState('overview');
  const [connectOpen, setConnectOpen] = useState(false);
  const [rotateOpen, setRotateOpen] = useState(false);

  const ecommerceActive = isMaster || addons.ecommerce;
  const companyId = profile?.company_id;

  const { data: integration } = useQuery({
    queryKey: ['store-integration', companyId],
    enabled: !!companyId && ecommerceActive,
    queryFn: async () => {
      const { data } = await supabase
        .from('store_integrations' as never)
        .select('id, provider, display_name, store_url, currency, status, product_count, last_sync_at, last_sync_error, token_last4, token_rotated_at')
        .eq('company_id', companyId!)
        .maybeSingle();
      return data as Integration | null;
    },
  });

  const { data: products = [] } = useQuery({
    queryKey: ['store-products', companyId],
    enabled: !!companyId && !!integration,
    queryFn: async () => {
      const { data } = await supabase
        .from('store_products' as never)
        .select('id, title, sku, price, stock, image_url, product_url, is_active')
        .eq('company_id', companyId!)
        .order('title')
        .limit(100);
      return (data ?? []) as Product[];
    },
  });

  const { data: carts = [] } = useQuery({
    queryKey: ['store-carts', companyId],
    enabled: !!companyId && !!integration,
    queryFn: async () => {
      const { data } = await supabase
        .from('store_carts' as never)
        .select('id, total, currency, status, checkout_url, created_at, items')
        .eq('company_id', companyId!)
        .order('created_at', { ascending: false })
        .limit(50);
      return (data ?? []) as Cart[];
    },
  });

  const syncMut = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke('store-proxy', { body: { action: 'sync' } });
      if (error) throw error;
      return data;
    },
    onSuccess: (d: { count?: number }) => {
      toast.success(`${d?.count ?? 0} produtos sincronizados`);
      qc.invalidateQueries({ queryKey: ['store-integration'] });
      qc.invalidateQueries({ queryKey: ['store-products'] });
    },
    onError: (e: Error) => toast.error(e.message ?? 'Falha no sync'),
  });

  const disconnectMut = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.functions.invoke('store-proxy', { body: { action: 'disconnect' } });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success('Loja desconectada');
      qc.invalidateQueries({ queryKey: ['store-integration'] });
      qc.invalidateQueries({ queryKey: ['store-products'] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (!loadingAddons && !ecommerceActive) {
    return (
      <PageShell title="Loja virtual" subtitle="Add-on disponível mediante ativação." icon={<ShoppingBag className="w-4 h-4" />}>
        <Card className="p-8 max-w-2xl mx-auto text-center space-y-4">
          <div className="w-14 h-14 mx-auto rounded-full bg-primary/10 flex items-center justify-center">
            <Lock className="w-7 h-7 text-primary" />
          </div>
          <h2 className="text-xl font-semibold">Loja virtual é um add-on</h2>
          <p className="text-sm text-muted-foreground">
            Conecte sua loja Shopify para que o Agente IA consulte produtos, envie fotos, sugira itens e gere
            links de carrinho diretamente no WhatsApp. Entre em contato com o suporte para ativar este add-on.
          </p>
          <Button asChild>
            <a href="mailto:suporte@zapfy.com.br?subject=Ativar%20add-on%20Loja%20virtual">
              Falar com o suporte
            </a>
          </Button>
        </Card>
      </PageShell>
    );
  }

  return (
    <PageShell title="Loja virtual" subtitle="Conecte sua loja para o Agente IA vender 24/7 no WhatsApp." icon={<ShoppingBag className="w-4 h-4" />}>
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="bg-secondary/50">
          <TabsTrigger value="overview">Visão geral</TabsTrigger>
          <TabsTrigger value="products" disabled={!integration}>Catálogo</TabsTrigger>
          <TabsTrigger value="carts" disabled={!integration}>Carrinhos</TabsTrigger>
          <TabsTrigger value="coupons" disabled={!integration}>Cupons</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-4 mt-4">
          {!integration ? (
            <Card className="p-8 text-center space-y-3">
              <Plug className="w-10 h-10 mx-auto text-muted-foreground" />
              <h3 className="text-lg font-semibold">Nenhuma loja conectada</h3>
              <p className="text-sm text-muted-foreground">Conecte sua Shopify para começar.</p>
              <Button onClick={() => setConnectOpen(true)}>Conectar Shopify</Button>
              <ConnectStoreWizard
                open={connectOpen}
                onOpenChange={setConnectOpen}
                onConnected={() => qc.invalidateQueries({ queryKey: ['store-integration'] })}
              />
            </Card>
          ) : (
            <Card className="p-6 space-y-4">
              <div className="flex items-start justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-lg font-semibold">{integration.display_name}</h3>
                    <Badge variant={integration.status === 'active' ? 'default' : 'destructive'}>
                      {integration.status}
                    </Badge>
                  </div>
                  <p className="text-sm text-muted-foreground mt-1">{integration.store_url}</p>
                  <div className="grid grid-cols-3 gap-6 mt-4 text-sm">
                    <div>
                      <div className="text-muted-foreground">Produtos</div>
                      <div className="font-semibold text-base">{integration.product_count}</div>
                    </div>
                    <div>
                      <div className="text-muted-foreground">Moeda</div>
                      <div className="font-semibold text-base">{integration.currency}</div>
                    </div>
                    <div>
                      <div className="text-muted-foreground">Último sync</div>
                      <div className="font-semibold text-base">
                        {integration.last_sync_at ? new Date(integration.last_sync_at).toLocaleString('pt-BR') : '—'}
                      </div>
                    </div>
                  </div>
                  <div className="mt-4 flex items-center gap-2 text-xs text-muted-foreground">
                    <KeyRound className="w-3.5 h-3.5" />
                    <span>API token:</span>
                    <code className="font-mono text-foreground">
                      {integration.token_last4 ? `••••${integration.token_last4}` : '••••'}
                    </code>
                    {integration.token_rotated_at && (
                      <span>· rotacionado em {new Date(integration.token_rotated_at).toLocaleDateString('pt-BR')}</span>
                    )}
                    <Badge variant="outline" className="ml-1 text-[10px]">Criptografado</Badge>
                  </div>
                  {integration.last_sync_error && (
                    <p className="text-xs text-destructive mt-3">{integration.last_sync_error}</p>
                  )}
                </div>
                <div className="flex gap-2 flex-wrap justify-end">
                  <Button variant="outline" size="sm" onClick={() => syncMut.mutate()} disabled={syncMut.isPending}>
                    <RefreshCw className={`w-4 h-4 mr-2 ${syncMut.isPending ? 'animate-spin' : ''}`} />
                    Sincronizar
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => setRotateOpen(true)}>
                    <KeyRound className="w-4 h-4 mr-2" />
                    Rotacionar token
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => { if (confirm('Desconectar a loja? Os dados de produtos serão removidos.')) disconnectMut.mutate(); }}>
                    <Trash2 className="w-4 h-4 mr-2" />
                    Desconectar
                  </Button>
                </div>
              </div>
              <ConnectStoreWizard
                open={rotateOpen}
                onOpenChange={setRotateOpen}
                rotateMode
                rotateStoreUrl={integration.store_url}
                onConnected={() => qc.invalidateQueries({ queryKey: ['store-integration'] })}
              />
              <StoreSyncProgress autoStart />
            </Card>
          )}
          {integration && <StoreJobsAuditPanel companyId={companyId} />}
        </TabsContent>

        <TabsContent value="products" className="mt-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
            {products.map((p) => (
              <Card key={p.id} className="p-3 space-y-2">
                {p.image_url && <img src={p.image_url} alt={p.title} className="w-full h-32 object-cover rounded" loading="lazy" />}
                <div className="text-sm font-medium line-clamp-2">{p.title}</div>
                <div className="flex items-center justify-between text-xs">
                  <span className="font-semibold">{fmtBRL(p.price)}</span>
                  <span className="text-muted-foreground">Estoque: {p.stock ?? '—'}</span>
                </div>
                {p.product_url && (
                  <a href={p.product_url} target="_blank" rel="noreferrer" className="text-xs text-primary inline-flex items-center gap-1">
                    Ver na loja <ExternalLink className="w-3 h-3" />
                  </a>
                )}
              </Card>
            ))}
            {products.length === 0 && <p className="text-sm text-muted-foreground">Nenhum produto sincronizado ainda.</p>}
          </div>
        </TabsContent>

        <TabsContent value="carts" className="mt-4">
          <Card className="divide-y divide-border">
            {carts.map((c) => (
              <div key={c.id} className="p-4 flex items-center justify-between gap-4">
                <div>
                  <div className="text-sm font-medium">{fmtBRL(c.total, c.currency)} • {c.items?.length ?? 0} itens</div>
                  <div className="text-xs text-muted-foreground">
                    {new Date(c.created_at).toLocaleString('pt-BR')} • {c.status}
                  </div>
                </div>
                <Button asChild variant="outline" size="sm">
                  <a href={c.checkout_url} target="_blank" rel="noreferrer">
                    Abrir carrinho <ExternalLink className="w-3 h-3 ml-2" />
                  </a>
                </Button>
              </div>
            ))}
            {carts.length === 0 && <div className="p-6 text-sm text-muted-foreground text-center">Nenhum carrinho gerado ainda.</div>}
          </Card>
        </TabsContent>

        <TabsContent value="coupons" className="mt-4">
          {integration && companyId && (
            <StoreCouponsTab companyId={companyId} storeIntegrationId={integration.id} />
          )}
        </TabsContent>
      </Tabs>
    </PageShell>
  );
}

