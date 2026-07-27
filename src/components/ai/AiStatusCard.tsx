import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Cpu, MessageSquare, Activity, AlertTriangle } from 'lucide-react';

interface Props {
  companyId: string | null;
  agent: { id: string; tone?: string | null; is_active?: boolean; paused_until?: string | null } | null;
}

export default function AiStatusCard({ companyId, agent }: Props) {
  const { data: limits } = useQuery({
    queryKey: ['ai-limits', companyId],
    enabled: !!companyId,
    staleTime: 120_000,
    queryFn: async () => {
      const { data } = await supabase
        .from('ai_agent_limits')
        .select('monthly_message_cap, monthly_token_cap, currently_blocked')
        .eq('company_id', companyId!)
        .maybeSingle();
      return data;
    },
  });

  const { data: usage } = useQuery({
    queryKey: ['ai-usage-month', companyId],
    enabled: !!companyId,
    staleTime: 120_000,
    queryFn: async () => {
      const start = new Date();
      start.setDate(1);
      start.setHours(0, 0, 0, 0);
      const { data } = await supabase
        .from('ai_agent_runs')
        .select('messages_consumed')
        .eq('company_id', companyId!)
        .gte('created_at', start.toISOString())
        .limit(5000);
      const msgs = (data || []).reduce((s, r: any) => s + (r.messages_consumed || 0), 0);
      return { msgs };
    },
  });

  const cap = limits?.monthly_message_cap || 0;
  const used = usage?.msgs || 0;
  const pct = cap > 0 ? Math.min(100, Math.round((used / cap) * 100)) : 0;
  const isHard = cap > 0 && used >= cap;
  const isSoft = cap > 0 && pct >= 80 && !isHard;

  const barColor = isHard ? 'bg-rose' : isSoft ? 'bg-amber' : 'bg-emerald';
  const tone = agent?.tone || '—';

  return (
    <Card className="p-4 space-y-3 border-l-4 border-l-violet">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Metric icon={<Cpu className="w-3.5 h-3.5" />} label="MODELO" value="Plataforma" />
        <Metric icon={<MessageSquare className="w-3.5 h-3.5" />} label="TOM DE VOZ" value={tone} className="capitalize" />
        <Metric
          icon={<Activity className="w-3.5 h-3.5" />}
          label="USO ATUAL"
          value={cap > 0 ? `${used.toLocaleString('pt-BR')} / ${cap.toLocaleString('pt-BR')}` : `${used.toLocaleString('pt-BR')} msgs`}
        />
        <div className="space-y-1">
          <p className="text-[10px] font-medium text-muted-foreground tracking-wide flex items-center gap-1">
            <AlertTriangle className="w-3.5 h-3.5" /> LIMITE
          </p>
          {isHard ? (
            <Badge variant="outline" className="bg-rose/10 text-rose border-rose/20">Atingido</Badge>
          ) : isSoft ? (
            <Badge variant="outline" className="bg-amber/10 text-amber border-amber/20">Próximo</Badge>
          ) : (
            <Badge variant="outline" className="bg-emerald/10 text-emerald border-emerald/20">Normal</Badge>
          )}
        </div>
      </div>

      {cap > 0 && (
        <div className="space-y-1">
          <div className="flex items-center justify-between text-[10px] text-muted-foreground">
            <span>Progresso mensal</span>
            <span>{pct}%</span>
          </div>
          <div className="h-1.5 bg-muted rounded-full overflow-hidden">
            <div className={`h-full ${barColor} transition-all`} style={{ width: `${pct}%` }} />
          </div>
        </div>
      )}
    </Card>
  );
}

function Metric({ icon, label, value, className = '' }: { icon: React.ReactNode; label: string; value: string; className?: string }) {
  return (
    <div className="space-y-1">
      <p className="text-[10px] font-medium text-muted-foreground tracking-wide flex items-center gap-1">
        {icon} {label}
      </p>
      <p className={`text-sm font-semibold text-foreground truncate ${className}`}>{value}</p>
    </div>
  );
}
