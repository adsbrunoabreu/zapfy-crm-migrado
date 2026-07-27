import { useSearchParams } from 'react-router-dom';
import { PageShell } from '@/components/layout/PageShell';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Puzzle, LayoutGrid, Building2, Bot, Sparkles, ShoppingBag } from 'lucide-react';
import { OverviewTab } from '@/components/admin/addons/OverviewTab';
import { CompaniesTab } from '@/components/admin/addons/CompaniesTab';
import { AiGlobalTab } from '@/components/admin/addons/AiGlobalTab';
import { AutomationsTab } from '@/components/admin/addons/AutomationsTab';
import { StoreGlobalTab } from '@/components/admin/addons/StoreGlobalTab';
import { SyncGlobalAddonsButton } from '@/components/admin/addons/SyncGlobalAddonsButton';

const VALID_TABS = ['overview', 'companies', 'ai', 'automations', 'store'] as const;
type TabId = typeof VALID_TABS[number];

export default function AdminAddons() {
  const [params, setParams] = useSearchParams();
  const raw = params.get('tab');
  const tab: TabId = (VALID_TABS as readonly string[]).includes(raw ?? '') ? (raw as TabId) : 'overview';

  const setTab = (t: string) => {
    const next = new URLSearchParams(params);
    next.set('tab', t);
    setParams(next, { replace: true });
  };

  return (
    <PageShell
      title="Add-ons"
      subtitle="Hub central de configurações globais dos add-ons da plataforma."
      icon={<Puzzle className="h-5 w-5" />}
      actions={<SyncGlobalAddonsButton />}
    >
      <Tabs value={tab} onValueChange={setTab} className="space-y-4">
        <TabsList className="bg-background border border-border">
          <TabsTrigger value="overview" className="gap-1.5">
            <LayoutGrid className="h-3.5 w-3.5" /> Visão geral
          </TabsTrigger>
          <TabsTrigger value="companies" className="gap-1.5">
            <Building2 className="h-3.5 w-3.5" /> Empresas
          </TabsTrigger>
          <TabsTrigger value="ai" className="gap-1.5">
            <Bot className="h-3.5 w-3.5" /> Agente IA
          </TabsTrigger>
          <TabsTrigger value="automations" className="gap-1.5">
            <Sparkles className="h-3.5 w-3.5" /> Automações
          </TabsTrigger>
          <TabsTrigger value="store" className="gap-1.5">
            <ShoppingBag className="h-3.5 w-3.5" /> e-Commerce
          </TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="mt-0">
          <OverviewTab onNavigate={setTab} />
        </TabsContent>
        <TabsContent value="companies" className="mt-0">
          <CompaniesTab />
        </TabsContent>
        <TabsContent value="ai" className="mt-0">
          <AiGlobalTab />
        </TabsContent>
        <TabsContent value="automations" className="mt-0">
          <AutomationsTab />
        </TabsContent>
        <TabsContent value="store" className="mt-0">
          <StoreGlobalTab />
        </TabsContent>
      </Tabs>
    </PageShell>
  );
}
