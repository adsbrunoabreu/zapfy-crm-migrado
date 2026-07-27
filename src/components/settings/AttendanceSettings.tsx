import { useEffect, useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Loader2, Save, Clock, Ticket, XCircle, Star, MessageSquareText, PenLine, SlidersHorizontal, Shuffle } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import {
  useAttendanceSettings,
  useSaveAttendanceSettings,
} from '@/hooks/useAttendanceSettings';
import type { AttendanceSettings as Settings } from '@/hooks/useAttendanceSettings';
import { useAuth } from '@/contexts/AuthContext';
import BusinessHoursSection from './attendance/BusinessHoursSection';
import TicketsSection from './attendance/TicketsSection';
import ClosingSection from './attendance/ClosingSection';
import RatingSection from './attendance/RatingSection';
import QuickRepliesSection from './attendance/QuickRepliesSection';
import SignatureSection from './attendance/SignatureSection';
import GeneralSection from './attendance/GeneralSection';
import LeadDistributionSettings from './LeadDistributionSettings';

const SECTIONS = [
  { id: 'hours', label: 'Horário', icon: Clock },
  { id: 'tickets', label: 'Tickets', icon: Ticket },
  { id: 'closing', label: 'Encerramento', icon: XCircle },
  { id: 'rating', label: 'Avaliação', icon: Star },
  { id: 'replies', label: 'Mensagens rápidas', icon: MessageSquareText },
  { id: 'signature', label: 'Assinatura', icon: PenLine },
  { id: 'general', label: 'Geral', icon: SlidersHorizontal },
  { id: 'distribution', label: 'Distribuição', icon: Shuffle },
] as const;

type SectionId = typeof SECTIONS[number]['id'];

export default function AttendanceSettings() {
  const { profile } = useAuth();
  const { data, isLoading } = useAttendanceSettings();
  const save = useSaveAttendanceSettings();

  const [active, setActive] = useState<SectionId>('hours');
  const [draft, setDraft] = useState<Settings | null>(null);

  useEffect(() => {
    if (data) setDraft(data);
  }, [data]);

  if (isLoading || !draft) {
    return (
      <Card className="glass-card p-12 flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </Card>
    );
  }

  const update = <K extends keyof Settings>(key: K, value: Settings[K]) => {
    setDraft((prev) => (prev ? { ...prev, [key]: value } : prev));
  };

  const handleSave = async () => {
    // Validações simples
    if (!draft.tickets.prefix || draft.tickets.prefix.length > 5) {
      toast.error('Prefixo do ticket deve ter entre 1 e 5 caracteres');
      setActive('tickets');
      return;
    }
    if (draft.general.max_concurrent_per_agent < 1) {
      toast.error('Limite de atendimentos simultâneos deve ser ≥ 1');
      setActive('general');
      return;
    }

    try {
      await save.mutateAsync(draft);
      toast.success('Configurações salvas');
    } catch (err: any) {
      toast.error('Erro ao salvar', { description: err?.message || 'Tente novamente' });
    }
  };

  return (
    <div className="space-y-4">
      {/* Tabs horizontais (consistente com restante das Configurações) */}
      <Card className="glass-card p-1.5">
        <nav className="flex gap-1 overflow-x-auto">
          {SECTIONS.map((s) => {
            const Icon = s.icon;
            const isActive = active === s.id;
            return (
              <button
                key={s.id}
                onClick={() => setActive(s.id)}
                className={cn(
                  'flex items-center gap-2 px-3 py-2 rounded-md text-sm whitespace-nowrap transition-colors shrink-0',
                  isActive
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:bg-secondary hover:text-foreground',
                )}
              >
                <Icon className="w-4 h-4 shrink-0" />
                <span>{s.label}</span>
              </button>
            );
          })}
        </nav>
      </Card>

      {/* Conteúdo */}
      {active === 'distribution' ? (
        <LeadDistributionSettings />
      ) : (
        <>
          <Card className="glass-card p-6">
            {active === 'hours' && (
              <BusinessHoursSection
                value={draft.business_hours}
                onChange={(v) => update('business_hours', v)}
                holidays={draft.holidays}
                onHolidaysChange={(v) => update('holidays', v)}
              />
            )}
            {active === 'tickets' && (
              <TicketsSection value={draft.tickets} onChange={(v) => update('tickets', v)} />
            )}
            {active === 'closing' && (
              <ClosingSection value={draft.closing} onChange={(v) => update('closing', v)} />
            )}
            {active === 'rating' && (
              <RatingSection value={draft.rating} onChange={(v) => update('rating', v)} />
            )}
            {active === 'replies' && (
              <QuickRepliesSection value={draft.quick_replies} onChange={(v) => update('quick_replies', v)} />
            )}
            {active === 'signature' && (
              <SignatureSection
                value={draft.signature}
                onChange={(v) => update('signature', v)}
                agentName={profile?.full_name || 'Nome do Agente'}
                agentAvatar={profile?.avatar_url || null}
              />
            )}
            {active === 'general' && (
              <GeneralSection value={draft.general} onChange={(v) => update('general', v)} />
            )}
          </Card>

          {/* Footer salvar */}
          <div className="flex items-center justify-end gap-3 sticky bottom-0 bg-background/80 backdrop-blur p-3 -mx-3 rounded-lg">
            <Button
              variant="outline"
              onClick={() => data && setDraft(data)}
              disabled={save.isPending}
            >
              Descartar
            </Button>
            <Button onClick={handleSave} disabled={save.isPending}>
              {save.isPending ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <Save className="w-4 h-4 mr-2" />
              )}
              Salvar configurações
            </Button>
          </div>
        </>
      )}
    </div>
  );
}

