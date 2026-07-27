import { memo, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { AlertCircle, Bot, Clock, Loader2, MessageSquare, Mic, TrendingUp } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { supabase } from '@/integrations/supabase/client';

interface UsageData {
  messages_consumed?: number;
  included_messages?: number;
  overage_messages?: number;
  projected_invoice_addon_total?: number;
  total_runs?: number;
  qualified_leads?: number;
  transferred_to_human?: number;
  audios_transcribed?: number;
  avg_latency_ms?: number;
  estimated_llm_cost_brl?: number;
}

function MetricBase({ icon, label, value }: { icon: ReactNode; label: string; value: number | undefined }) {
  return (
    <div className="text-center">
      <div className="flex items-center justify-center gap-1 text-muted-foreground text-[10px]">
        {icon} {label}
      </div>
      <p className="text-base font-semibold mt-0.5">{(value || 0).toLocaleString('pt-BR')}</p>
    </div>
  );
}
const Metric = memo(MetricBase);

function UsageDashboardBase({ companyId }: { companyId: string }) {
  const { data: usage, isLoading } = useQuery({
    queryKey: ['ai-addon-usage', companyId],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_ai_addon_usage', { _company_id: companyId });
      if (error) throw error;
      return data as unknown as UsageData;
    },
    enabled: !!companyId,
    staleTime: 60_000,
  });

  if (isLoading) {
    return (
      <Card className="p-4 flex items-center justify-center h-24">
        <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
      </Card>
    );
  }
  if (!usage) return null;

  const fmtBrl = (n: number) =>
    new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(n || 0);
  const consumed = usage.messages_consumed || 0;
  const included = usage.included_messages || 0;
  const pct = included > 0 ? Math.min(100, Math.round((consumed / included) * 100)) : 0;
  const overage = usage.overage_messages || 0;

  return (
    <Card className="p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs text-muted-foreground">Uso do mês atual</p>
          <p className="text-2xl font-bold">
            {consumed.toLocaleString('pt-BR')}
            <span className="text-sm text-muted-foreground font-normal">
              {included > 0 && ` / ${included.toLocaleString('pt-BR')}`} msgs
            </span>
          </p>
        </div>
        <div className="text-right">
          <p className="text-xs text-muted-foreground">Próxima fatura (add-on)</p>
          <p className="text-xl font-bold text-violet">
            {fmtBrl(usage.projected_invoice_addon_total || 0)}
          </p>
          {overage > 0 && (
            <p className="text-[10px] text-amber-foreground flex items-center gap-1 justify-end mt-0.5">
              <AlertCircle className="w-3 h-3" />
              +{overage.toLocaleString('pt-BR')} msgs excedentes
            </p>
          )}
        </div>
      </div>

      {included > 0 && (
        <div className="h-2 rounded-full bg-muted overflow-hidden">
          <div
            className={`h-full ${pct >= 90 ? 'bg-amber' : 'bg-violet'} transition-all`}
            style={{ width: `${pct}%` }}
          />
        </div>
      )}

      <div className="grid grid-cols-4 gap-2 pt-2 border-t border-border/50">
        <Metric icon={<MessageSquare className="w-3.5 h-3.5" />} label="Runs" value={usage.total_runs} />
        <Metric icon={<TrendingUp className="w-3.5 h-3.5" />} label="Qualificados" value={usage.qualified_leads} />
        <Metric icon={<Bot className="w-3.5 h-3.5" />} label="Transferidos" value={usage.transferred_to_human} />
        <Metric icon={<Mic className="w-3.5 h-3.5" />} label="Áudios" value={usage.audios_transcribed} />
      </div>
      <div className="text-[10px] text-muted-foreground flex items-center gap-1">
        <Clock className="w-3 h-3" />
        Latência média: {usage.avg_latency_ms || 0}ms · Custo LLM estimado: {fmtBrl(usage.estimated_llm_cost_brl || 0)}
      </div>
    </Card>
  );
}

export const UsageDashboard = memo(UsageDashboardBase);
