import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  AlertTriangle, AlertCircle, Info, CheckCircle2, X, Sparkles,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  useMedicalInsights,
  useUpdateMedicalInsight,
} from '@/hooks/medical/useMedicalInsights';
import { InsightSeverity, InsightType, type MedicalInsight } from '@/types/medical';
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface Props {
  practiceId: string | null;
}

const severityConfig: Record<InsightSeverity, { icon: typeof Info; tone: string; bg: string }> = {
  [InsightSeverity.CRITICAL]: {
    icon: AlertTriangle,
    tone: 'text-destructive',
    bg: 'bg-destructive/10 border-destructive/40',
  },
  [InsightSeverity.WARNING]: {
    icon: AlertCircle,
    tone: 'text-amber-500',
    bg: 'bg-amber-500/10 border-amber-500/30',
  },
  [InsightSeverity.INFO]: {
    icon: Info,
    tone: 'text-primary',
    bg: 'bg-primary/10 border-primary/30',
  },
};

const typeLabels: Record<InsightType, string> = {
  [InsightType.ALERT]: 'Alerta',
  [InsightType.RECOMMENDATION]: 'Recomendação',
  [InsightType.ANOMALY]: 'Anomalia',
  [InsightType.PREDICTION]: 'Previsão',
};

export function InsightsPanel({ practiceId }: Props) {
  const { data: insights = [], isLoading } = useMedicalInsights(practiceId);
  const update = useUpdateMedicalInsight(practiceId);

  return (
    <Card className="p-4 lg:p-5 h-full max-h-[360px] flex flex-col overflow-hidden">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-primary" />
          <h3 className="text-base font-semibold text-foreground">Insights inteligentes</h3>
        </div>
        <span className="text-xs text-muted-foreground tabular-nums">
          {insights.length} ativo{insights.length === 1 ? '' : 's'}
        </span>
      </div>

      {isLoading ? (
        <div className="space-y-2">
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-20 w-full" />
        </div>
      ) : insights.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center text-center py-10">
          <CheckCircle2 className="w-10 h-10 text-emerald mb-2 opacity-70" />
          <p className="text-sm font-medium text-foreground">Tudo sob controle</p>
          <p className="text-xs text-muted-foreground mt-1">
            Nenhum alerta ou recomendação pendente para esta clínica.
          </p>
        </div>
      ) : (
        <ul className="flex-1 min-h-0 overflow-y-auto pr-1 space-y-2">
          {insights.map((insight) => (
            <InsightItem
              key={insight.id}
              insight={insight}
              onDismiss={(id) => update.mutate({ id, variant: 'dismiss' })}
              onActionTaken={(id) => update.mutate({ id, variant: 'action_taken' })}
            />
          ))}
        </ul>
      )}
    </Card>
  );
}

interface ItemProps {
  insight: MedicalInsight;
  onDismiss: (id: string) => void;
  onActionTaken: (id: string) => void;
}

function InsightItem({ insight, onDismiss, onActionTaken }: ItemProps) {
  const cfg = severityConfig[insight.severity as InsightSeverity] ?? severityConfig[InsightSeverity.INFO];
  const Icon = cfg.icon;
  const createdAgo = formatDistanceToNow(new Date(insight.created_at), {
    addSuffix: true,
    locale: ptBR,
  });

  return (
    <li className={cn('rounded-lg border p-3 space-y-2', cfg.bg)}>
      <div className="flex items-start gap-2.5">
        <Icon className={cn('w-4 h-4 mt-0.5 shrink-0', cfg.tone)} />
        <div className="flex-1 min-w-0 space-y-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-medium text-foreground">{insight.title}</span>
            <span className="text-[10px] uppercase tracking-wide text-muted-foreground/70 font-medium">
              {typeLabels[insight.insight_type as InsightType] ?? 'Insight'}
            </span>
          </div>
          {insight.description && (
            <p className="text-xs text-muted-foreground leading-relaxed">{insight.description}</p>
          )}
          {insight.action_suggested && (
            <p className="text-xs text-foreground/80">
              <span className="text-muted-foreground">Ação sugerida: </span>
              {insight.action_suggested}
            </p>
          )}
          <p className="text-[10px] text-muted-foreground/60">{createdAgo}</p>
        </div>
        <button
          type="button"
          onClick={() => onDismiss(insight.id)}
          aria-label="Descartar"
          className="text-muted-foreground/60 hover:text-foreground transition-colors p-1 -m-1"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
      {!insight.action_taken && (
        <div className="flex justify-end gap-2">
          <Button
            size="sm"
            variant="outline"
            className="h-7 text-xs"
            onClick={() => onActionTaken(insight.id)}
          >
            <CheckCircle2 className="w-3 h-3 mr-1" />
            Marcar como resolvido
          </Button>
        </div>
      )}
    </li>
  );
}
