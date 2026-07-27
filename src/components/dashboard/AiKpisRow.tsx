import { Bot, Coins, MessageSquare, Cpu, CheckCircle2, UserRound, Timer, ShieldAlert } from 'lucide-react';
import { StatCard } from './StatCard';
import type { AiKpis } from '@/hooks/useMasterAiData';

interface Props {
  kpis: AiKpis;
  blockedCount: number;
}

function formatBRL(v: number) {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function AiKpisRow({ kpis, blockedCount }: Props) {
  return (
    <>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard
          label="Empresas com IA"
          value={kpis.addonsActive.toLocaleString('pt-BR')}
          rawValue={kpis.addonsActive} countUp
          current={kpis.addonsActive} previous={kpis.addonsActivePrev}
          icon={Bot}
          iconColor="text-[hsl(var(--violet))]" iconBg="bg-[hsl(var(--violet))]/15"
        />
        <StatCard
          label="MRR Add-on IA"
          value={formatBRL(kpis.mrrAddon)}
          current={kpis.mrrAddon} previous={kpis.mrrAddon}
          icon={Coins}
          iconColor="text-[hsl(var(--emerald))]" iconBg="bg-[hsl(var(--emerald))]/15"
        />
        <StatCard
          label="Mensagens IA consumidas"
          value={kpis.messages.toLocaleString('pt-BR')}
          rawValue={kpis.messages} countUp
          current={kpis.messages} previous={kpis.messagesPrev}
          icon={MessageSquare}
          iconColor="text-[hsl(var(--cyan))]" iconBg="bg-[hsl(var(--cyan))]/15"
        />
        <StatCard
          label="Custo LLM estimado"
          value={formatBRL(kpis.cost)}
          current={kpis.cost} previous={kpis.costPrev}
          icon={Cpu}
          iconColor="text-[hsl(var(--amber))]" iconBg="bg-[hsl(var(--amber))]/15"
        />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard
          label="Taxa de qualificação"
          value={`${kpis.qualificationRate.toFixed(1)}%`}
          current={kpis.qualificationRate} previous={kpis.qualificationRate}
          deltaUnit="pp"
          icon={CheckCircle2}
          iconColor="text-[hsl(var(--emerald))]" iconBg="bg-[hsl(var(--emerald))]/15"
        />
        <StatCard
          label="Handoff humano"
          value={`${kpis.handoffRate.toFixed(1)}%`}
          current={kpis.handoffRate} previous={kpis.handoffRate}
          deltaUnit="pp" invertDelta
          icon={UserRound}
          iconColor="text-primary" iconBg="bg-primary/15"
        />
        <StatCard
          label="Latência média"
          value={`${kpis.avgLatencyMs.toLocaleString('pt-BR')} ms`}
          current={kpis.avgLatencyMs} previous={kpis.avgLatencyMs}
          icon={Timer}
          iconColor="text-[hsl(var(--cyan))]" iconBg="bg-[hsl(var(--cyan))]/15"
        />
        <StatCard
          label="Empresas bloqueadas"
          value={blockedCount.toLocaleString('pt-BR')}
          rawValue={blockedCount} countUp
          current={blockedCount} previous={blockedCount}
          icon={ShieldAlert}
          iconColor={blockedCount > 0 ? 'text-[hsl(var(--rose))]' : 'text-muted-foreground'}
          iconBg={blockedCount > 0 ? 'bg-[hsl(var(--rose))]/15' : 'bg-secondary'}
        />
      </div>
    </>
  );
}
