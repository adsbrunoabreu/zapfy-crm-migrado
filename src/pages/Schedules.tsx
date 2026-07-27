import { useState, useEffect, useRef } from 'react';
import { Lock } from 'lucide-react';
import { CalendarPage } from '@/components/schedules/calendar/CalendarPage';
import { ScheduledMessagesTab } from '@/components/schedules/messages/ScheduledMessagesTab';
import { PageShell } from '@/components/layout/PageShell';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useCompanyAddons } from '@/hooks/useCompanyAddons';
import { useAuth } from '@/contexts/AuthContext';

interface SchedulesProps {
  embedded?: boolean;
  forceTab?: 'calendar' | 'messages';
}

function AutomationsLockedCard() {
  return (
    <Card className="p-8 max-w-2xl mx-auto text-center space-y-4">
      <div className="w-14 h-14 mx-auto rounded-full bg-primary/10 flex items-center justify-center">
        <Lock className="w-7 h-7 text-primary" />
      </div>
      <h2 className="text-xl font-semibold">Mensagens agendadas é um add-on</h2>
      <p className="text-sm text-muted-foreground">
        Mensagens agendadas fazem parte do módulo de Automações. Entre em contato com o
        suporte para ativar este add-on para sua empresa.
      </p>
      <Button asChild>
        <a href="mailto:suporte@zapfy.com.br?subject=Ativar%20add-on%20Automa%C3%A7%C3%B5es">
          Falar com o suporte
        </a>
      </Button>
    </Card>
  );
}

export default function Schedules({ embedded = false, forceTab }: SchedulesProps) {
  const { isMaster } = useAuth();
  const { addons, isLoading: loadingAddons } = useCompanyAddons();
  const automationsActive = isMaster || addons.automations;

  const [tab, setTab] = useState<'calendar' | 'messages'>(forceTab ?? 'calendar');
  const actionsRef = useRef<HTMLDivElement | null>(null);
  const [actionsEl, setActionsEl] = useState<HTMLDivElement | null>(null);

  useEffect(() => {
    if (forceTab) setTab(forceTab);
  }, [forceTab]);

  useEffect(() => {
    setActionsEl(actionsRef.current);
  }, []);

  // Quando embutido em outra tela já gateada (Automations), respeita o forceTab
  if (embedded && forceTab) {
    if (forceTab === 'messages' && !loadingAddons && !automationsActive) {
      return <AutomationsLockedCard />;
    }
    return forceTab === 'messages' ? <ScheduledMessagesTab /> : <CalendarPage />;
  }

  const showMessagesTab = automationsActive || loadingAddons;

  // Se o usuário tinha 'messages' selecionado mas perdeu acesso, força calendar
  const effectiveTab: 'calendar' | 'messages' =
    tab === 'messages' && !automationsActive && !loadingAddons ? 'calendar' : tab;

  const body =
    effectiveTab === 'calendar'
      ? <CalendarPage actionsPortalTarget={actionsEl} />
      : (automationsActive ? <ScheduledMessagesTab /> : <AutomationsLockedCard />);

  if (embedded) {
    return <div className="space-y-4">{body}</div>;
  }

  return (
    <PageShell
      title="Agendamentos"
      subtitle="Compromissos com clientes e mensagens agendadas"
      actions={<div ref={actionsRef} className="flex items-center gap-2 flex-wrap" />}
    >
      {body}
    </PageShell>
  );
}
