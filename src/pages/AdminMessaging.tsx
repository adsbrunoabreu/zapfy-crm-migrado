import { useSearchParams } from 'react-router-dom';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Activity, MessageSquare, Webhook, RotateCw, Zap, ListChecks, Plug } from 'lucide-react';
import { lazy, Suspense } from 'react';
import { Loader2 } from 'lucide-react';
import MessagingAlertBanner from '@/components/admin/MessagingAlertBanner';

const AdminMessageAudit = lazy(() => import('./AdminMessageAudit'));
const AdminWebhookAudit = lazy(() => import('./AdminWebhookAudit'));
const AdminRetryQueue = lazy(() => import('./AdminRetryQueue'));
const MessagingHealth = lazy(() => import('./MessagingHealth'));
const EvolutionMetrics = lazy(() => import('./EvolutionMetrics'));
const JobsMetrics = lazy(() => import('./JobsMetrics'));
const AdminInstanceStatus = lazy(() => import('./AdminInstanceStatus'));

const TABS = ['overview', 'messages', 'webhooks', 'retries', 'evolution', 'jobs', 'instances'] as const;
type TabId = (typeof TABS)[number];

const Fallback = () => (
  <div className="flex items-center justify-center py-20">
    <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
  </div>
);

export default function AdminMessaging() {
  const [params, setParams] = useSearchParams();
  const raw = params.get('tab');
  const tab: TabId = (TABS as readonly string[]).includes(raw ?? '') ? (raw as TabId) : 'overview';

  const setTab = (t: string) => {
    const next = new URLSearchParams(params);
    next.set('tab', t);
    setParams(next, { replace: true });
  };

  return (
    <div className="flex flex-col h-full">
      <div className="sticky top-0 z-40 bg-background border-b border-border pl-14 md:pl-6 lg:pl-8 pr-6 lg:pr-8 py-2">
        <Tabs value={tab} onValueChange={setTab}>
          <TabsList className="bg-background border border-border flex-wrap h-auto">
            <TabsTrigger value="overview" className="gap-1.5">
              <Activity className="h-3.5 w-3.5" /> Visão geral
            </TabsTrigger>
            <TabsTrigger value="messages" className="gap-1.5">
              <MessageSquare className="h-3.5 w-3.5" /> Mensagens
            </TabsTrigger>
            <TabsTrigger value="webhooks" className="gap-1.5">
              <Webhook className="h-3.5 w-3.5" /> Webhooks
            </TabsTrigger>
            <TabsTrigger value="retries" className="gap-1.5">
              <RotateCw className="h-3.5 w-3.5" /> Retries
            </TabsTrigger>
            <TabsTrigger value="evolution" className="gap-1.5">
              <Zap className="h-3.5 w-3.5" /> Evolution
            </TabsTrigger>
            <TabsTrigger value="jobs" className="gap-1.5">
              <ListChecks className="h-3.5 w-3.5" /> Jobs
            </TabsTrigger>
            <TabsTrigger value="instances" className="gap-1.5">
              <Plug className="h-3.5 w-3.5" /> Instâncias
            </TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      <MessagingAlertBanner />

      <div className="flex-1 min-h-0">
        <Suspense fallback={<Fallback />}>
          {tab === 'overview' && <MessagingHealth />}
          {tab === 'messages' && <AdminMessageAudit />}
          {tab === 'webhooks' && <AdminWebhookAudit />}
          {tab === 'retries' && <AdminRetryQueue />}
          {tab === 'evolution' && <EvolutionMetrics />}
          {tab === 'jobs' && <JobsMetrics />}
          {tab === 'instances' && <AdminInstanceStatus />}
        </Suspense>
      </div>
    </div>
  );
}
