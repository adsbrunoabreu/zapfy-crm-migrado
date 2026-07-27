import { PageShell } from '@/components/layout/PageShell';
import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { Navigate, useSearchParams } from 'react-router-dom';
import {
  Save,
  Building2,
  Loader2,
  AlertTriangle,
  Trash2,
  Clock,
  ShieldAlert,
  Webhook,
  Smartphone,
  Headphones,
  MapPin,
  Phone,
  Mail,
  Globe,
  IdCard,
  Palette,
  Monitor,
  Library,
  Wrench,
  Stethoscope,
  Tag as TagIcon,
  XCircle,
  Compass,
  Package,
  CalendarClock,
  ShieldPlus,
  ListTree,
  Hospital,
} from 'lucide-react';
import { useUIScale, type UIScale } from '@/contexts/UIScaleContext';
import { useCompanyVertical } from '@/hooks/useCompanyVertical';

const SCALE_LABELS: Record<UIScale, { label: string; hint: string }> = {
  80: { label: '80%', hint: 'Denso' },
  90: { label: '90%', hint: 'Compacto' },
  100: { label: '100%', hint: 'Padrão' },
};

import { PaletteSelector } from '@/components/branding/PaletteSelector';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { useUserCompany, useUpdateCompany } from '@/hooks/useCompanies';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import ConnectionsSettings from '@/components/settings/ConnectionsSettings';
import WebhookSettings from '@/components/settings/WebhookSettings';
import AttendanceSettings from '@/components/settings/AttendanceSettings';
import CompanyLogoUpload from '@/components/settings/CompanyLogoUpload';
import { NotificationSoundSettings } from '@/components/settings/NotificationSoundSettings';
import ProfessionalsSettings from '@/components/settings/appointments/ProfessionalsSettings';
import ReasonsSettings from '@/components/settings/appointments/ReasonsSettings';
import DemoDataCard from '@/components/settings/DemoDataCard';
import TagsManager from '@/components/settings/TagsManager';
import LossReasonsManager from '@/components/settings/LossReasonsManager';
import LeadSourcesManager from '@/components/settings/LeadSourcesManager';
import NotificationPrefsCard from '@/components/settings/NotificationPrefsCard';
import ProductsManager from '@/components/settings/ProductsManager';
import { supabase } from '@/integrations/supabase/client';
import { SettingsSkeleton } from '@/components/skeletons/PageSkeletons';
import { formatCep, formatCnpj, formatBrPhone } from '@/lib/viacep';
import { CepInput } from '@/components/forms/CepInput';
import { BR_TIMEZONES } from '@/lib/timezones';
import { cn } from '@/lib/utils';

interface CompanyForm {
  name: string;
  trade_name: string;
  legal_name: string;
  cnpj: string;
  logo_url: string | null;
  email: string;
  phone: string;
  website: string;
  zip_code: string;
  address: string;
  address_number: string;
  address_complement: string;
  neighborhood: string;
  city: string;
  state: string;
  timezone: string;
}

const EMPTY_FORM: CompanyForm = {
  name: '',
  trade_name: '',
  legal_name: '',
  cnpj: '',
  logo_url: null,
  email: '',
  phone: '',
  website: '',
  zip_code: '',
  address: '',
  address_number: '',
  address_complement: '',
  neighborhood: '',
  city: '',
  state: '',
  timezone: 'America/Sao_Paulo',
};

// === Catálogos: sub-navegação ===
type CatalogId =
  | 'tags'
  | 'products'
  | 'sources'
  | 'loss'
  | 'professionals'
  | 'appointment-reasons'
  | 'doctors'
  | 'insurances'
  | 'procedures'
  | 'facilities';

interface CatalogEntry {
  id: CatalogId;
  label: string;
  icon: typeof TagIcon;
  medical?: boolean;
  render: () => JSX.Element;
}

export default function Settings() {
  const { isCompanyAdmin, loading: authLoading, user } = useAuth();
  const { toast } = useToast();
  const { data: company, isLoading: companyLoading } = useUserCompany();
  const updateCompany = useUpdateCompany();
  const { data: vertical } = useCompanyVertical();
  const [searchParams] = useSearchParams();
  const rawTab = searchParams.get('tab') || 'company';
  // Mapeia URLs legadas (?tab=loss-reasons / lead-sources / tags / appointments / medical / appearance)
  // para a nova IA de 5 abas.
  const LEGACY_TAB_MAP: Record<string, string> = {
    'loss-reasons': 'catalogs',
    'lead-sources': 'catalogs',
    tags: 'catalogs',
    appointments: 'catalogs',
    medical: 'catalogs',
    doctors: 'catalogs',
    professionals: 'catalogs',
    appearance: 'advanced',
    notifications: 'advanced',
    connections: 'channels',
  };
  const initialTab = LEGACY_TAB_MAP[rawTab] ?? rawTab;

  const isMedical = vertical === 'medical';
  const [form, setForm] = useState<CompanyForm>(EMPTY_FORM);
  const [activeCatalog, setActiveCatalog] = useState<CatalogId>('tags');

  const [cleanupDialogOpen, setCleanupDialogOpen] = useState(false);
  const [cleanupPassword, setCleanupPassword] = useState('');
  const [cleanupLoading, setCleanupLoading] = useState(false);

  useEffect(() => {
    if (company) {
      const c = company as any;
      setForm({
        name: c.name || '',
        trade_name: c.trade_name || '',
        legal_name: c.legal_name || '',
        cnpj: c.cnpj ? formatCnpj(c.cnpj) : '',
        logo_url: c.logo_url || null,
        email: c.email || '',
        phone: c.phone ? formatBrPhone(c.phone) : '',
        website: c.website || '',
        zip_code: c.zip_code ? formatCep(c.zip_code) : '',
        address: c.address || '',
        address_number: c.address_number || '',
        address_complement: c.address_complement || '',
        neighborhood: c.neighborhood || '',
        city: c.city || '',
        state: c.state || '',
        timezone: c.timezone || 'America/Sao_Paulo',
      });
    }
  }, [company]);

  if (!authLoading && !isCompanyAdmin) {
    return <Navigate to="/dashboard" replace />;
  }

  const set = <K extends keyof CompanyForm>(key: K, value: CompanyForm[K]) =>
    setForm((p) => ({ ...p, [key]: value }));

  const applyCepFields = (f: { address: string; neighborhood: string; city: string; state: string }) => {
    setForm((p) => ({
      ...p,
      address: f.address || p.address,
      neighborhood: f.neighborhood || p.neighborhood,
      city: f.city || p.city,
      state: f.state || p.state,
    }));
  };

  const handleSaveCompany = async () => {
    if (!company?.id) return;
    try {
      await updateCompany.mutateAsync({
        id: company.id,
        name: form.name,
        timezone: form.timezone,
        trade_name: form.trade_name || null,
        legal_name: form.legal_name || null,
        cnpj: form.cnpj.replace(/\D/g, '') || null,
        logo_url: form.logo_url,
        email: form.email || null,
        phone: form.phone.replace(/\D/g, '') || null,
        website: form.website || null,
        zip_code: form.zip_code.replace(/\D/g, '') || null,
        address: form.address || null,
        address_number: form.address_number || null,
        address_complement: form.address_complement || null,
        neighborhood: form.neighborhood || null,
        city: form.city || null,
        state: form.state || null,
      } as any);
      toast({ title: 'Configurações salvas', description: 'As informações da empresa foram atualizadas.' });
    } catch {
      toast({ title: 'Erro ao salvar', description: 'Não foi possível salvar as configurações.', variant: 'destructive' });
    }
  };

  const handleCleanup = async () => {
    if (!cleanupPassword) return;
    setCleanupLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Sem sessão');

      const { data, error } = await supabase.functions.invoke('admin-data-cleanup', {
        body: { action: 'clear_leads', password: cleanupPassword },
      });

      if (error) {
        let errorMessage = 'Não foi possível executar a limpeza.';
        try {
          const context = (error as any).context;
          if (context && typeof context.json === 'function') {
            const body = await context.json();
            if (body?.error) {
              if (body.error === 'Senha incorreta') {
                errorMessage = 'Senha incorreta. Verifique e tente novamente.';
                setCleanupPassword('');
              } else if (body.error.startsWith('Acesso negado')) {
                errorMessage = body.error;
              } else if (body.error === 'Token inválido') {
                errorMessage = 'Sessão expirada. Faça login novamente.';
              } else {
                errorMessage = body.error;
              }
            }
          }
        } catch {
          /* fallback */
        }
        toast({ title: 'Erro na limpeza', description: errorMessage, variant: 'destructive' });
        return;
      }

      if (data?.error) {
        toast({ title: 'Erro na limpeza', description: data.error, variant: 'destructive' });
        return;
      }

      const total = Object.values(data.results as Record<string, number>).reduce(
        (a: number, b: number) => a + b,
        0,
      );
      toast({ title: 'Limpeza concluída', description: `${total} registro(s) removido(s) com sucesso.` });
      setCleanupDialogOpen(false);
    } catch {
      toast({ title: 'Erro na limpeza', description: 'Não foi possível executar a limpeza.', variant: 'destructive' });
    } finally {
      setCleanupLoading(false);
    }
  };

  if (companyLoading && !company) {
    return <SettingsSkeleton />;
  }

  if (!company) {
    return (
      <div className="p-6 lg:p-8">
        <Card className="glass-card p-8 text-center max-w-md mx-auto">
          <AlertTriangle className="w-12 h-12 text-amber mx-auto mb-4" />
          <h2 className="font-display text-xl font-semibold mb-2">Sem empresa vinculada</h2>
          <p className="text-muted-foreground">
            Você ainda não está vinculado a nenhuma empresa. Entre em contato com o administrador da plataforma.
          </p>
        </Card>
      </div>
    );
  }

  // === Catálogos: lista dinâmica ===
  const catalogs: CatalogEntry[] = [
    { id: 'tags', label: 'Tags', icon: TagIcon, render: () => <TagsManager /> },
    { id: 'products', label: 'Produtos', icon: Package, render: () => <ProductsManager /> },
    { id: 'sources', label: 'Origens', icon: Compass, render: () => <LeadSourcesManager /> },
    { id: 'loss', label: 'Motivos de perda', icon: XCircle, render: () => <LossReasonsManager /> },
    { id: 'professionals', label: 'Profissionais', icon: Stethoscope, render: () => <ProfessionalsSettings /> },
    { id: 'appointment-reasons', label: 'Motivos de agendamento', icon: CalendarClock, render: () => <ReasonsSettings /> },
  ];
    catalogs.push(
      { id: 'insurances', label: 'Convênios', icon: ShieldPlus, medical: true, render: () => <InsurancesManager /> },
      { id: 'procedures', label: 'Procedimentos', icon: ListTree, medical: true, render: () => <ProceduresManager /> },
      { id: 'facilities', label: 'Hospitais & Clínicas', icon: Hospital, medical: true, render: () => <FacilitiesManager /> },
    );
  }
  const currentCatalog = catalogs.find((c) => c.id === activeCatalog) ?? catalogs[0];

  return (
    <PageShell title="Configurações" subtitle="Configure sua empresa e integrações">
      <Tabs defaultValue={initialTab} className="space-y-6">
        <TabsList className="bg-secondary/50">
          <TabsTrigger value="company" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
            <Building2 className="w-4 h-4 mr-2" />
            Empresa
          </TabsTrigger>
          <TabsTrigger value="attendance" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
            <Headphones className="w-4 h-4 mr-2" />
            Atendimento
          </TabsTrigger>
          <TabsTrigger value="channels" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
            <Smartphone className="w-4 h-4 mr-2" />
            Canais
          </TabsTrigger>
          <TabsTrigger value="catalogs" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
            <Library className="w-4 h-4 mr-2" />
            Catálogos
          </TabsTrigger>
          <TabsTrigger value="advanced" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
            <Wrench className="w-4 h-4 mr-2" />
            Avançado
          </TabsTrigger>
        </TabsList>

        {/* ===================== EMPRESA ===================== */}
        <TabsContent value="company" className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Identificação */}
            <Card className="glass-card p-6">
              <div className="flex items-center gap-2 mb-4">
                <IdCard className="w-5 h-5 text-primary" />
                <h2 className="font-display text-lg font-semibold">Identificação</h2>
              </div>
              <div className="space-y-4">
                <div>
                  <Label className="mb-2 block">Logo</Label>
                  <CompanyLogoUpload
                    companyId={company.id}
                    logoUrl={form.logo_url}
                    onChange={(url) => set('logo_url', url)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="name">Nome (exibição) *</Label>
                  <Input id="name" value={form.name} onChange={(e) => set('name', e.target.value)} className="bg-secondary/50 border-border/50" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="trade_name">Nome fantasia</Label>
                  <Input id="trade_name" value={form.trade_name} onChange={(e) => set('trade_name', e.target.value)} className="bg-secondary/50 border-border/50" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="legal_name">Razão social</Label>
                  <Input id="legal_name" value={form.legal_name} onChange={(e) => set('legal_name', e.target.value)} className="bg-secondary/50 border-border/50" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="cnpj">CNPJ</Label>
                  <Input
                    id="cnpj"
                    value={form.cnpj}
                    onChange={(e) => set('cnpj', formatCnpj(e.target.value))}
                    placeholder="00.000.000/0000-00"
                    className="bg-secondary/50 border-border/50"
                  />
                </div>
              </div>
            </Card>

            {/* Endereço */}
            <Card className="glass-card p-6">
              <div className="flex items-center gap-2 mb-4">
                <MapPin className="w-5 h-5 text-primary" />
                <h2 className="font-display text-lg font-semibold">Endereço</h2>
              </div>
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label htmlFor="zip_code">CEP</Label>
                    <CepInput
                      id="zip_code"
                      value={form.zip_code}
                      onChange={(v) => set('zip_code', v)}
                      onAddressFound={applyCepFields}
                      className="bg-secondary/50 border-border/50"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="state">UF</Label>
                    <Input id="state" maxLength={2} value={form.state} onChange={(e) => set('state', e.target.value.toUpperCase())} className="bg-secondary/50 border-border/50" />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="address">Endereço</Label>
                  <Input id="address" value={form.address} onChange={(e) => set('address', e.target.value)} className="bg-secondary/50 border-border/50" />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label htmlFor="address_number">Número</Label>
                    <Input id="address_number" value={form.address_number} onChange={(e) => set('address_number', e.target.value)} className="bg-secondary/50 border-border/50" />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="address_complement">Complemento</Label>
                    <Input id="address_complement" value={form.address_complement} onChange={(e) => set('address_complement', e.target.value)} className="bg-secondary/50 border-border/50" />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label htmlFor="neighborhood">Bairro</Label>
                    <Input id="neighborhood" value={form.neighborhood} onChange={(e) => set('neighborhood', e.target.value)} className="bg-secondary/50 border-border/50" />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="city">Cidade</Label>
                    <Input id="city" value={form.city} onChange={(e) => set('city', e.target.value)} className="bg-secondary/50 border-border/50" />
                  </div>
                </div>
              </div>
            </Card>

            {/* Contato */}
            <Card className="glass-card p-6">
              <div className="flex items-center gap-2 mb-4">
                <Phone className="w-5 h-5 text-primary" />
                <h2 className="font-display text-lg font-semibold">Contato</h2>
              </div>
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="email"><Mail className="w-3.5 h-3.5 inline mr-1" />E-mail comercial</Label>
                  <Input id="email" type="email" value={form.email} onChange={(e) => set('email', e.target.value)} placeholder="contato@empresa.com" className="bg-secondary/50 border-border/50" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="phone"><Phone className="w-3.5 h-3.5 inline mr-1" />Telefone</Label>
                  <Input
                    id="phone"
                    value={form.phone}
                    onChange={(e) => set('phone', formatBrPhone(e.target.value))}
                    placeholder="(11) 99999-9999"
                    className="bg-secondary/50 border-border/50"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="website"><Globe className="w-3.5 h-3.5 inline mr-1" />Site</Label>
                  <Input id="website" value={form.website} onChange={(e) => set('website', e.target.value)} placeholder="https://empresa.com" className="bg-secondary/50 border-border/50" />
                </div>
              </div>
            </Card>

            {/* Preferências */}
            <Card className="glass-card p-6">
              <div className="flex items-center gap-2 mb-4">
                <Clock className="w-5 h-5 text-primary" />
                <h2 className="font-display text-lg font-semibold">Preferências</h2>
              </div>
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="timezone">Fuso horário</Label>
                  <Select value={form.timezone} onValueChange={(v) => set('timezone', v)}>
                    <SelectTrigger className="bg-secondary/50 border-border/50">
                      <SelectValue placeholder="Selecione o fuso horário" />
                    </SelectTrigger>
                    <SelectContent>
                      {BR_TIMEZONES.map((tz) => (
                        <SelectItem key={tz.value} value={tz.value}>{tz.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    Usado também no horário de atendimento e nos agendamentos.
                  </p>
                </div>
              </div>
            </Card>
          </div>

          {/* Save bar */}
          <div className="flex items-center justify-end gap-3 sticky bottom-0 bg-background/80 backdrop-blur p-3 -mx-3 rounded-lg z-10">
            <Button variant="glow" onClick={handleSaveCompany} disabled={updateCompany.isPending}>
              {updateCompany.isPending ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <Save className="w-4 h-4 mr-2" />
              )}
              Salvar alterações
            </Button>
          </div>
        </TabsContent>

        {/* ===================== ATENDIMENTO ===================== */}
        <TabsContent value="attendance">
          <AttendanceSettings />
        </TabsContent>

        {/* ===================== CANAIS ===================== */}
        <TabsContent value="channels" className="space-y-6">
          <ConnectionsSettings />
          <Card className="glass-card p-6">
            <div className="flex items-center gap-2 mb-4">
              <Webhook className="w-5 h-5 text-primary" />
              <h2 className="font-display text-lg font-semibold">Webhooks</h2>
            </div>
            <WebhookSettings />
          </Card>
        </TabsContent>

        {/* ===================== CATÁLOGOS ===================== */}
        <TabsContent value="catalogs" className="space-y-4">
          <Card className="glass-card p-1.5">
            <nav className="flex gap-1 overflow-x-auto">
              {catalogs.map((c) => {
                const Icon = c.icon;
                const isActive = currentCatalog.id === c.id;
                return (
                  <button
                    key={c.id}
                    onClick={() => setActiveCatalog(c.id)}
                    className={cn(
                      'flex items-center gap-2 px-3 py-2 rounded-md text-sm whitespace-nowrap transition-colors shrink-0',
                      isActive
                        ? 'bg-primary text-primary-foreground'
                        : 'text-muted-foreground hover:bg-secondary hover:text-foreground',
                    )}
                  >
                    <Icon className="w-4 h-4" />
                    <span>{c.label}</span>
                    {c.medical && (
                      <span className="ml-1 text-[10px] px-1.5 py-0.5 rounded bg-secondary/60 uppercase tracking-wide">
                        clínica
                      </span>
                    )}
                  </button>
                );
              })}
            </nav>
          </Card>
          <Card className="glass-card p-6">{currentCatalog.render()}</Card>
        </TabsContent>

        {/* ===================== AVANÇADO ===================== */}
        <TabsContent value="advanced" className="space-y-6">
          {/* Aparência */}
          <Card className="glass-card p-6 space-y-4">
            <div className="flex items-center gap-2">
              <Palette className="w-5 h-5 text-primary" />
              <h2 className="font-display text-lg font-semibold">Aparência</h2>
            </div>
            <div>
              <h3 className="text-sm font-semibold">Paleta de cores da empresa</h3>
              <p className="text-xs text-muted-foreground mt-1 mb-3">
                Aplicada para todos os usuários da empresa.
              </p>
              <PaletteSelector companyId={company?.id} />
            </div>
          </Card>

          <AppearanceScaleCard />

          {/* Notificações por e-mail (preferência da empresa) */}
          <NotificationPrefsCard />

          {/* Som de notificação (preferência do dispositivo) */}
          <NotificationSoundSettings />


          {/* Vertical médica: opt-in */}
          <Card className="glass-card p-6 space-y-4">
            <div className="flex items-center gap-2">
              <Stethoscope className="w-5 h-5 text-primary" />
              <h2 className="font-display text-lg font-semibold">Vertical / Clínica</h2>
            </div>
            <MedicalVerticalSettings />
          </Card>

          {/* Zona de Perigo */}
          <Card className="glass-card p-6 border-destructive/30">
            <div className="flex items-start gap-4 mb-6">
              <div className="w-12 h-12 rounded-xl bg-destructive/20 flex items-center justify-center">
                <ShieldAlert className="w-6 h-6 text-destructive" />
              </div>
              <div>
                <h2 className="font-display text-xl font-semibold text-destructive">Zona de Perigo</h2>
                <p className="text-muted-foreground text-sm">Ações irreversíveis. Tenha certeza antes de prosseguir.</p>
              </div>
            </div>

            <div className="space-y-6 max-w-xl">
              <div className="p-4 rounded-lg border border-destructive/20 bg-destructive/5">
                <h3 className="font-medium mb-1">Apagar Todos os Leads</h3>
                <p className="text-sm text-muted-foreground mb-3">
                  Remove todos os leads e dados relacionados (atividades, tags, anexos e agendamentos). Esta ação é irreversível.
                </p>
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={() => {
                    setCleanupPassword('');
                    setCleanupDialogOpen(true);
                  }}
                >
                  <Trash2 className="w-4 h-4 mr-2" />
                  Apagar Todos os Leads
                </Button>
              </div>
            </div>
          </Card>

          {isCompanyAdmin && company?.id && <DemoDataCard companyId={company.id} />}
        </TabsContent>
      </Tabs>

      {/* Cleanup dialog */}
      <Dialog
        open={cleanupDialogOpen}
        onOpenChange={(open) => {
          if (!cleanupLoading) {
            setCleanupDialogOpen(open);
            if (!open) setCleanupPassword('');
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="text-destructive">Apagar Todos os Leads</DialogTitle>
            <DialogDescription>
              Todos os leads e dados relacionados (atividades, tags, anexos e agendamentos) serão removidos permanentemente.
            </DialogDescription>
          </DialogHeader>

          <div className="py-4 space-y-4">
            <div className="flex items-center gap-2 p-3 rounded-lg bg-destructive/10 text-destructive text-sm">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>Esta ação é irreversível. Digite sua senha para confirmar.</span>
            </div>
            <div className="space-y-2">
              <Label htmlFor="cleanup-password">Senha</Label>
              <Input
                id="cleanup-password"
                type="password"
                placeholder="Digite sua senha"
                value={cleanupPassword}
                onChange={(e) => setCleanupPassword(e.target.value)}
                className="bg-secondary/50 border-border/50"
                disabled={cleanupLoading}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setCleanupDialogOpen(false)} disabled={cleanupLoading}>
              Cancelar
            </Button>
            <Button variant="destructive" onClick={handleCleanup} disabled={!cleanupPassword || cleanupLoading}>
              {cleanupLoading ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <Trash2 className="w-4 h-4 mr-2" />
              )}
              Confirmar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageShell>
  );
}

function AppearanceScaleCard() {
  const { scale, setScale, options } = useUIScale();
  return (
    <Card className="glass-card p-6 space-y-5">
      <div className="flex items-start gap-2">
        <Monitor className="h-5 w-5 mt-0.5 text-muted-foreground" />
        <div>
          <h3 className="text-base font-semibold">Escala da interface</h3>
          <p className="text-sm text-muted-foreground mt-1">
            Ajuste o tamanho da interface. A preferência fica salva neste navegador.
          </p>
        </div>
      </div>
      <div className="grid grid-cols-3 gap-2">
        {options.map((opt) => {
          const meta = SCALE_LABELS[opt];
          const active = scale === opt;
          return (
            <button
              key={opt}
              type="button"
              onClick={() => setScale(opt)}
              className={`flex flex-col items-center justify-center rounded-lg border px-3 py-3 transition ${
                active
                  ? 'border-primary bg-primary/10 text-foreground'
                  : 'border-border bg-secondary/30 text-muted-foreground hover:bg-secondary/60 hover:text-foreground'
              }`}
            >
              <span className="text-base font-semibold">{meta.label}</span>
              <span className="text-[10px] uppercase tracking-wide mt-0.5">{meta.hint}</span>
            </button>
          );
        })}
      </div>
    </Card>
  );
}
