import { useEffect, useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList,
} from '@/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  ShoppingBag, CheckCircle2, ExternalLink, Loader2, ChevronsUpDown, Building2, Sparkles,
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { StoreSyncProgress } from '@/components/store/StoreSyncProgress';

type ProviderId = 'shopify' | 'vnda' | 'tray';

interface Provider {
  id: ProviderId;
  name: string;
  available: boolean;
  blurb: string;
  helpUrl?: string;
  helpHint?: string;
}

const PROVIDERS: Provider[] = [
  {
    id: 'shopify',
    name: 'Shopify',
    available: true,
    blurb: 'Conecte com um Admin API token. Sincronização automática de produtos.',
    helpUrl: 'https://help.shopify.com/en/manual/apps/app-types/custom-apps',
    helpHint: 'Apps → Develop apps → Create app → escopos: read_products, read_inventory.',
  },
  { id: 'vnda', name: 'VNDA', available: false, blurb: 'Em breve.' },
  { id: 'tray', name: 'Tray', available: false, blurb: 'Em breve.' },
];

interface CompanyOpt { id: string; name: string; ecommerce_enabled: boolean }

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  /** When true, shows company picker (Master flow). Otherwise uses logged company. */
  isMaster?: boolean;
  /** Pre-selected company (e.g. reconnect from row). */
  forcedCompanyId?: string;
  forcedCompanyName?: string;
  defaultProvider?: ProviderId;
  /** Rotate-only: lock store URL and only require the new token. */
  rotateMode?: boolean;
  rotateStoreUrl?: string;
  onConnected?: () => void;
}

export function ConnectStoreWizard({
  open, onOpenChange, isMaster, forcedCompanyId, forcedCompanyName,
  defaultProvider = 'shopify', rotateMode, rotateStoreUrl, onConnected,
}: Props) {
  const qc = useQueryClient();
  const [step, setStep] = useState<'provider' | 'creds' | 'done'>(rotateMode ? 'creds' : 'provider');
  const [provider, setProvider] = useState<ProviderId>(defaultProvider);
  const [companyId, setCompanyId] = useState<string>(forcedCompanyId ?? '');
  const [companyPickerOpen, setCompanyPickerOpen] = useState(false);
  const [storeUrl, setStoreUrl] = useState(rotateStoreUrl ?? '');
  const [adminToken, setAdminToken] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [result, setResult] = useState<{
    shop?: { name?: string; currency?: string; domain?: string };
    webhooks?: { count: number; error: string | null };
    rotated?: boolean;
    token_last4?: string;
  } | null>(null);

  // Reset on open
  useEffect(() => {
    if (open) {
      setStep(rotateMode ? 'creds' : 'provider');
      setProvider(defaultProvider);
      setCompanyId(forcedCompanyId ?? '');
      setStoreUrl(rotateStoreUrl ?? ''); setAdminToken(''); setDisplayName('');
      setResult(null);
    }
  }, [open, defaultProvider, forcedCompanyId, rotateMode, rotateStoreUrl]);

  // Companies list (Master only, no forced company)
  const { data: companies = [] } = useQuery({
    queryKey: ['admin-store-companies-eligible'],
    enabled: open && !!isMaster && !forcedCompanyId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('companies')
        .select('id, name, ecommerce_enabled')
        .order('name');
      if (error) throw error;
      return (data ?? []) as CompanyOpt[];
    },
    staleTime: 60_000,
  });

  const selectedCompanyName = useMemo(() => {
    if (forcedCompanyName) return forcedCompanyName;
    return companies.find((c) => c.id === companyId)?.name ?? '';
  }, [companies, companyId, forcedCompanyName]);

  const connectMut = useMutation({
    mutationFn: async () => {
      const cleanUrl = storeUrl.trim().replace(/^https?:\/\//, '').replace(/\/+$/, '');
      if (!rotateMode && provider === 'shopify' && !/\.myshopify\.com$/i.test(cleanUrl)) {
        throw new Error('Use o domínio *.myshopify.com (ex.: minha-loja.myshopify.com)');
      }
      const body: Record<string, unknown> = {
        action: rotateMode ? 'rotate_token' : 'connect_shopify',
        admin_token: adminToken.trim(),
      };
      if (!rotateMode) {
        body.store_url = cleanUrl;
        body.display_name = displayName.trim() || undefined;
      }
      if (isMaster && companyId) body.company_id = companyId;
      const { data, error } = await supabase.functions.invoke('store-proxy', { body });
      if (error) {
        const ctx = await error.context?.json?.().catch(() => null);
        throw new Error(ctx?.error || error.message);
      }
      return data as {
        ok: boolean;
        shop?: { name: string; currency: string; domain: string };
        webhooks?: { count: number; error: string | null };
        rotated?: boolean;
        token_last4?: string;
      };
    },
    onSuccess: (d) => {
      setResult({ shop: d.shop, webhooks: d.webhooks, rotated: d.rotated, token_last4: d.token_last4 });
      setStep('done');
      qc.invalidateQueries({ queryKey: ['admin-store-integrations'] });
      qc.invalidateQueries({ queryKey: ['admin-store-unconnected'] });
      qc.invalidateQueries({ queryKey: ['store-integration'] });
      qc.invalidateQueries({ queryKey: ['store-products'] });
      onConnected?.();
    },
    onError: (e: Error) => toast.error(e.message || (rotateMode ? 'Falha ao rotacionar' : 'Falha ao conectar')),
  });

  const canProceedFromProvider = !!provider && PROVIDERS.find((p) => p.id === provider)?.available;
  const canConnect =
    !!adminToken && (rotateMode || !!storeUrl) && (!isMaster || !!companyId) && !connectMut.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg bg-background border-border">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShoppingBag className="h-4 w-4" />
            {rotateMode
              ? (step === 'done' ? 'Token rotacionado' : 'Rotacionar API token')
              : (step === 'done' ? 'Loja conectada' : 'Conectar loja')}
          </DialogTitle>
        </DialogHeader>

        {/* Stepper (oculto no modo rotate) */}
        {!rotateMode && (
          <div className="flex items-center gap-2 text-[11px] text-muted-foreground -mt-2">
            <StepDot active={step === 'provider'} done={step !== 'provider'} label="Provedor" />
            <span>—</span>
            <StepDot active={step === 'creds'} done={step === 'done'} label="Credencial" />
            <span>—</span>
            <StepDot active={step === 'done'} done={false} label="Pronto" />
          </div>
        )}

        {/* STEP 1 — Provider */}
        {step === 'provider' && (
          <div className="space-y-2">
            {PROVIDERS.map((p) => (
              <button
                key={p.id}
                disabled={!p.available}
                onClick={() => { setProvider(p.id); }}
                className={cn(
                  'w-full text-left border rounded-md p-3 transition-colors',
                  'border-border bg-card/60 hover:border-border',
                  provider === p.id && 'border-emerald/60 bg-emerald/5',
                  !p.available && 'opacity-50 cursor-not-allowed hover:border-border',
                )}
              >
                <div className="flex items-center justify-between">
                  <div className="font-medium text-sm">{p.name}</div>
                  {p.available ? (
                    <Badge variant="outline" className="text-[10px] border-emerald/30 text-emerald">
                      Disponível
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="text-[10px]">Em breve</Badge>
                  )}
                </div>
                <div className="text-xs text-muted-foreground mt-1">{p.blurb}</div>
              </button>
            ))}
            <DialogFooter className="pt-2">
              <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
              <Button disabled={!canProceedFromProvider} onClick={() => setStep('creds')}>
                Continuar
              </Button>
            </DialogFooter>
          </div>
        )}

        {/* STEP 2 — Credentials */}
        {step === 'creds' && (
          <div className="space-y-3">
            {isMaster && !forcedCompanyId && (
              <div>
                <Label className="text-xs">Empresa</Label>
                <Popover open={companyPickerOpen} onOpenChange={setCompanyPickerOpen}>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      role="combobox"
                      className="w-full justify-between mt-1 bg-card border-border"
                    >
                      <span className="inline-flex items-center gap-2 truncate">
                        <Building2 className="h-3.5 w-3.5" />
                        {selectedCompanyName || 'Selecione a empresa…'}
                      </span>
                      <ChevronsUpDown className="h-3.5 w-3.5 opacity-60" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-[420px] p-0 bg-background border-border">
                    <Command>
                      <CommandInput placeholder="Buscar empresa…" />
                      <CommandList>
                        <CommandEmpty>Nenhuma empresa.</CommandEmpty>
                        <CommandGroup>
                          {companies.map((c) => (
                            <CommandItem
                              key={c.id}
                              value={c.name}
                              onSelect={() => { setCompanyId(c.id); setCompanyPickerOpen(false); }}
                            >
                              <span className="truncate">{c.name}</span>
                              {!c.ecommerce_enabled && (
                                <Badge variant="outline" className="ml-auto text-[10px] text-amber">
                                  Add-on off
                                </Badge>
                              )}
                              {c.ecommerce_enabled && (
                                <Sparkles className="ml-auto h-3 w-3 text-emerald" />
                              )}
                            </CommandItem>
                          ))}
                        </CommandGroup>
                      </CommandList>
                    </Command>
                  </PopoverContent>
                </Popover>
              </div>
            )}
            {forcedCompanyName && (
              <div className="text-xs text-muted-foreground">
                Conectando para <strong className="text-foreground">{forcedCompanyName}</strong>
              </div>
            )}

            {!rotateMode ? (
              <div>
                <Label htmlFor="store_url" className="text-xs">Domínio da loja</Label>
                <Input
                  id="store_url"
                  value={storeUrl}
                  onChange={(e) => setStoreUrl(e.target.value)}
                  placeholder="minha-loja.myshopify.com"
                  className="mt-1"
                />
                <p className="text-[11px] text-muted-foreground mt-1">
                  Use o domínio *.myshopify.com (sem https).
                </p>
              </div>
            ) : (
              <div className="text-xs text-muted-foreground">
                Loja: <strong className="text-foreground">{rotateStoreUrl}</strong>
              </div>
            )}

            <div>
              <Label htmlFor="admin_token" className="text-xs">
                {rotateMode ? 'Novo Admin API Access Token' : 'Admin API Access Token'}
              </Label>
              <Input
                id="admin_token"
                type="password"
                value={adminToken}
                onChange={(e) => setAdminToken(e.target.value)}
                placeholder="shpat_..."
                className="mt-1 font-mono"
                autoComplete="off"
              />
              <div className="flex items-center justify-between mt-1">
                <p className="text-[11px] text-muted-foreground">
                  Token criptografado em repouso (AES-256-GCM). Apenas os 4 últimos dígitos ficam visíveis.
                </p>
                <a
                  href="https://help.shopify.com/en/manual/apps/app-types/custom-apps"
                  target="_blank" rel="noreferrer"
                  className="text-[11px] inline-flex items-center gap-1 text-primary hover:underline"
                >
                  Como obter? <ExternalLink className="h-3 w-3" />
                </a>
              </div>
            </div>

            {!rotateMode && (
              <div>
                <Label htmlFor="display_name" className="text-xs">Apelido (opcional)</Label>
                <Input
                  id="display_name"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder="Minha Loja"
                  className="mt-1"
                />
              </div>
            )}

            <DialogFooter className="pt-1">
              {!rotateMode ? (
                <Button variant="outline" onClick={() => setStep('provider')}>Voltar</Button>
              ) : (
                <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
              )}
              <Button disabled={!canConnect} onClick={() => connectMut.mutate()}>
                {connectMut.isPending ? (
                  <><Loader2 className="h-3.5 w-3.5 mr-2 animate-spin" /> {rotateMode ? 'Rotacionando…' : 'Conectando…'}</>
                ) : (
                  rotateMode ? 'Rotacionar token' : 'Conectar e sincronizar'
                )}
              </Button>
            </DialogFooter>
          </div>
        )}

        {/* STEP 3 — Done */}
        {step === 'done' && (
          <div className="space-y-3">
            <div className="rounded-md border border-emerald/30 bg-emerald/5 p-4 flex items-start gap-3">
              <CheckCircle2 className="h-5 w-5 text-emerald shrink-0 mt-0.5" />
              <div className="text-sm">
                <div className="font-medium">
                  {result?.rotated
                    ? 'Token rotacionado com sucesso.'
                    : `${result?.shop?.name ?? 'Loja'} conectada com sucesso.`}
                </div>
                <div className="text-xs text-muted-foreground mt-1">
                  {result?.shop?.domain && <>Domínio: {result.shop.domain} · </>}
                  Moeda: {result?.shop?.currency ?? 'BRL'}.
                  {result?.token_last4 && <> Token salvo: <code>••••{result.token_last4}</code>.</>}
                  {!result?.rotated && ' A sincronização inicial de produtos está em andamento.'}
                </div>
              </div>
            </div>
            {!result?.rotated && (
              <StoreSyncProgress
                companyId={isMaster ? companyId : undefined}
                isMaster={isMaster}
                autoStart={false}
              />
            )}
            <DialogFooter>
              <Button onClick={() => onOpenChange(false)}>Concluir</Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function StepDot({ active, done, label }: { active: boolean; done: boolean; label: string }) {
  return (
    <span className={cn(
      'inline-flex items-center gap-1',
      active && 'text-foreground',
      done && 'text-emerald',
    )}>
      <span className={cn(
        'h-1.5 w-1.5 rounded-full bg-muted',
        active && 'bg-foreground',
        done && 'bg-emerald',
      )} />
      {label}
    </span>
  );
}
