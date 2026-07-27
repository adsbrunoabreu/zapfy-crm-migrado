import { useSearchParams } from 'react-router-dom';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { CircleDollarSign, Hourglass } from 'lucide-react';
import AdminSubscriptions from './AdminSubscriptions';
import AdminTrials from './AdminTrials';

const TABS = ['subscriptions', 'trials'] as const;
type TabId = typeof TABS[number];

export default function AdminBilling() {
  const [params, setParams] = useSearchParams();
  const raw = params.get('tab');
  const tab: TabId = (TABS as readonly string[]).includes(raw ?? '') ? (raw as TabId) : 'subscriptions';

  const setTab = (t: string) => {
    const next = new URLSearchParams(params);
    next.set('tab', t);
    setParams(next, { replace: true });
  };

  return (
    <div className="flex flex-col h-full">
      <div className="sticky top-0 z-40 bg-background border-b border-border pl-14 md:pl-6 lg:pl-8 pr-6 lg:pr-8 py-2">
        <Tabs value={tab} onValueChange={setTab}>
          <TabsList className="bg-background border border-border">
            <TabsTrigger value="subscriptions" className="gap-1.5">
              <CircleDollarSign className="h-3.5 w-3.5" /> Assinaturas
            </TabsTrigger>
            <TabsTrigger value="trials" className="gap-1.5">
              <Hourglass className="h-3.5 w-3.5" /> Trials
            </TabsTrigger>
          </TabsList>
        </Tabs>
      </div>
      <div className="flex-1 min-h-0">
        {tab === 'subscriptions' && <AdminSubscriptions />}
        {tab === 'trials' && <AdminTrials />}
      </div>
    </div>
  );
}
