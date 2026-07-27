import { useState } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { MessageTemplatesTab } from '@/components/templates/MessageTemplatesTab';
import { MessageSequencesTab } from '@/components/templates/MessageSequencesTab';
import { PageShell } from '@/components/layout/PageShell';

interface MessageTemplatesProps {
  embedded?: boolean;
}

export default function MessageTemplates({ embedded = false }: MessageTemplatesProps) {
  const [tab, setTab] = useState<'templates' | 'sequences'>('templates');

  const tabs = (
    <Tabs value={tab} onValueChange={(v) => setTab(v as any)}>
      <TabsList>
        <TabsTrigger value="templates">Templates</TabsTrigger>
        <TabsTrigger value="sequences">Fluxos de follow-up</TabsTrigger>
      </TabsList>
    </Tabs>
  );

  const body = tab === 'templates' ? <MessageTemplatesTab /> : <MessageSequencesTab />;

  if (embedded) {
    return (
      <div className="space-y-4">
        {tabs}
        {body}
      </div>
    );
  }

  return (
    <PageShell
      title="Templates & Fluxos"
      subtitle="Crie textos reutilizáveis e fluxos de follow-up automáticos com variáveis do lead."
      tabs={tabs}
    >
      {body}
    </PageShell>
  );
}
