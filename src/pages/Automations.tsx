import { PageShell } from '@/components/layout/PageShell';
import { useEffect, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { CalendarClock, FileText, Activity, Bug, Sparkles, Lock } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useCompanyAddons } from '@/hooks/useCompanyAddons';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import Schedules from './Schedules';
import MessageTemplates from './MessageTemplates';
import AutomationStatus from './AutomationStatus';
import AutomationAudit from './AutomationAudit';

type TabKey = 'schedules' | 'templates' | 'status' | 'audit';
const VALID_TABS: TabKey[] = ['schedules', 'templates', 'status', 'audit'];

export default function Automations() {
  const [searchParams, setSearchParams] = useSearchParams();
  const { isCompanyAdmin, isMaster } = useAuth();
  const { addons, isLoading: loadingAddons } = useCompanyAddons();
  const canSeeAdminTabs = isCompanyAdmin || isMaster;
  const automationsActive = isMaster || addons.automations;

  const currentTab = useMemo<TabKey>(() => {
    const t = searchParams.get('tab') as TabKey | null;
    if (t && VALID_TABS.includes(t)) {
      if (!canSeeAdminTabs && (t === 'templates' || t === 'status' || t === 'audit')) {
        return 'schedules';
      }
      return t;
    }
    return 'schedules';
  }, [searchParams, canSeeAdminTabs]);

  useEffect(() => {
    if (!searchParams.get('tab')) {
      const next = new URLSearchParams(searchParams);
      next.set('tab', currentTab);
      setSearchParams(next, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleTabChange = (value: string) => {
    const next = new URLSearchParams(searchParams);
    next.set('tab', value);
    if (value !== 'schedules') next.delete('new');
    setSearchParams(next, { replace: true });
  };

  const tabs = (
    <Tabs value={currentTab} onValueChange={handleTabChange}>
      <TabsList className="bg-secondary/50">
        <TabsTrigger
          value="schedules"
          className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"
        >
          <CalendarClock className="w-4 h-4 mr-2" />
          Agendar mensagem
        </TabsTrigger>
        {canSeeAdminTabs && (
          <>
            <TabsTrigger
              value="templates"
              className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"
            >
              <FileText className="w-4 h-4 mr-2" />
              Templates & Fluxos
            </TabsTrigger>
            <TabsTrigger
              value="status"
              className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"
            >
              <Activity className="w-4 h-4 mr-2" />
              Status
            </TabsTrigger>
            <TabsTrigger
              value="audit"
              className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"
            >
              <Bug className="w-4 h-4 mr-2" />
              Auditoria
            </TabsTrigger>
          </>
        )}
      </TabsList>
    </Tabs>
  );

  if (!loadingAddons && !automationsActive) {
    return (
      <PageShell
        title="Automações"
        subtitle="Add-on disponível mediante ativação."
        icon={<Sparkles className="w-4 h-4 text-primary" />}
      >
        <Card className="p-8 max-w-2xl mx-auto text-center space-y-4">
          <div className="w-14 h-14 mx-auto rounded-full bg-primary/10 flex items-center justify-center">
            <Lock className="w-7 h-7 text-primary" />
          </div>
          <h2 className="text-xl font-semibold">Automações é um add-on</h2>
          <p className="text-sm text-muted-foreground">
            Templates de mensagens, fluxos de follow-up e mensagens agendadas estão disponíveis
            como módulo opcional. Entre em contato com o suporte para ativar este add-on para
            sua empresa.
          </p>
          <Button asChild>
            <a href="mailto:suporte@zapfy.com.br?subject=Ativar%20add-on%20Automa%C3%A7%C3%B5es">
              Falar com o suporte
            </a>
          </Button>
        </Card>
      </PageShell>
    );
  }

  return (
    <PageShell
      title="Automações"
      subtitle="Mensagens agendadas, templates, fluxos e monitoramento de automações."
      icon={<Sparkles className="w-4 h-4 text-primary" />}
      tabs={tabs}
    >
      {currentTab === 'schedules' && <Schedules embedded forceTab="messages" />}
      {canSeeAdminTabs && currentTab === 'templates' && <MessageTemplates embedded />}
      {canSeeAdminTabs && currentTab === 'status' && <AutomationStatus embedded />}
      {canSeeAdminTabs && currentTab === 'audit' && <AutomationAudit embedded />}
    </PageShell>
  );
}
