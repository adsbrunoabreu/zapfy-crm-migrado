import { PageShell } from '@/components/layout/PageShell';
import { useMemo, type ComponentType, type ReactNode } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ResendConfigCard } from '@/components/admin/integrations/ResendConfigCard';
import { AsaasConfigCard } from '@/components/admin/integrations/AsaasConfigCard';
import { AsaasLogsCard } from '@/components/admin/integrations/AsaasLogsCard';
import { TrackingConfigCard } from '@/components/admin/integrations/TrackingConfigCard';
import { EvolutionMasterCard } from '@/components/admin/integrations/EvolutionMasterCard';
import { SystemInstanceCard } from '@/components/admin/integrations/SystemInstanceCard';
import { InstanceAlertsCard } from '@/components/admin/integrations/InstanceAlertsCard';
import { AlertsOverviewCard } from '@/components/admin/integrations/AlertsOverviewCard';
import { AutoReconnectCard } from '@/components/admin/integrations/AutoReconnectCard';
import { VaultBootstrapCard } from '@/components/admin/integrations/VaultBootstrapCard';
import { WhatsappCloudCard } from '@/components/admin/integrations/WhatsappCloudCard';
import { EmailTemplatesTab } from '@/components/admin/integrations/EmailTemplatesTab';
import { WhatsappTemplatesTab } from '@/components/admin/integrations/WhatsappTemplatesTab';
import { useAuth } from '@/contexts/AuthContext';
import { Plug } from 'lucide-react';

import type { AppRole } from '@/lib/roles';

type TabSection = {
  /** Used as Tabs value; must be unique within the parent */
  value: string;
  /** Label shown in the tab trigger */
  label: string;
  /** Roles allowed to see this tab. Empty/undefined = visible to all auth'd admins */
  roles?: AppRole[];
  /** Optional wrapper className for the TabsContent (e.g. spacing) */
  contentClassName?: string;
  /** Render either a single component, multiple components, or nested tabs */
  render: () => ReactNode;
};

const renderCards = (cards: ComponentType[]) => (
  <>
    {cards.map((Card, idx) => (
      <Card key={idx} />
    ))}
  </>
);

const renderNestedTabs = (defaultValue: string, sections: TabSection[]) => (
  <Tabs defaultValue={defaultValue} className="space-y-4">
    <TabsList className="flex flex-wrap h-auto w-full justify-start gap-1">
      {sections.map((s) => (
        <TabsTrigger key={s.value} value={s.value}>
          {s.label}
        </TabsTrigger>
      ))}
    </TabsList>
    {sections.map((s) => (
      <TabsContent key={s.value} value={s.value} className={s.contentClassName}>
        {s.render()}
      </TabsContent>
    ))}
  </Tabs>
);

/**
 * Declarative integration tab registry.
 * Add or reorder integrations here — the layout adapts automatically.
 * Use `roles` to scope tabs to specific roles (defaults: master-only screen).
 */
const INTEGRATION_TABS: TabSection[] = [
  {
    value: 'email',
    label: 'E-mail (Resend)',
    roles: ['master'],
    render: () => renderCards([ResendConfigCard]),
  },
  {
    value: 'asaas',
    label: 'Asaas (Pagamentos)',
    roles: ['master'],
    contentClassName: 'space-y-4',
    render: () => renderCards([AsaasConfigCard, AsaasLogsCard]),
  },
  {
    value: 'tracking',
    label: 'Tracking & Pixels',
    roles: ['master'],
    render: () => renderCards([TrackingConfigCard]),
  },
  {
    value: 'evolution',
    label: 'Evolution API Master',
    roles: ['master'],
    render: () => renderCards([EvolutionMasterCard]),
  },
  {
    value: 'instance',
    label: 'Instância interna',
    roles: ['master'],
    render: () => renderCards([SystemInstanceCard]),
  },
  {
    value: 'whatsapp_cloud',
    label: 'WhatsApp Cloud (Meta)',
    roles: ['master'],
    render: () => renderCards([WhatsappCloudCard]),
  },
  {
    value: 'alerts',
    label: 'Alertas',
    roles: ['master'],
    contentClassName: 'space-y-4',
    render: () => renderCards([AlertsOverviewCard, InstanceAlertsCard, AutoReconnectCard, VaultBootstrapCard]),
  },
  {
    value: 'templates',
    label: 'Templates',
    roles: ['master'],
    render: () =>
      renderNestedTabs('email', [
        { value: 'email', label: 'E-mail', render: () => <EmailTemplatesTab /> },
        { value: 'whatsapp', label: 'WhatsApp', render: () => <WhatsappTemplatesTab /> },
      ]),
  },
];

const isVisible = (tab: TabSection, roles: AppRole[]): boolean => {
  if (!tab.roles || tab.roles.length === 0) return true;
  return tab.roles.some((r) => roles.includes(r));
};

const AdminIntegrations = () => {
  const { roles } = useAuth();

  const visibleTabs = useMemo(
    () => INTEGRATION_TABS.filter((t) => isVisible(t, roles)),
    [roles]
  );

  return (
    <PageShell
      title="Integrações"
      subtitle="Configurações globais de e-mail, pagamentos, tracking, WhatsApp e templates do sistema"
      icon={<Plug className="h-4 w-4" />}
    >

      {visibleTabs.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Você não tem permissão para visualizar integrações.
        </p>
      ) : (
        renderNestedTabs(visibleTabs[0].value, visibleTabs)
      )}
    </PageShell>
  );
};

export default AdminIntegrations;
