import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Sparkles, MessageSquare } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import type { AiOpportunity } from '@/hooks/useMasterAiData';

interface Props {
  opportunities: AiOpportunity[];
}

export function AiOpportunityCard({ opportunities }: Props) {
  return (
    <Card className="animate-fade-in h-full w-full min-w-0 flex flex-col">
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-[hsl(var(--violet))]" />
          Oportunidades para venda de IA
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          Empresas sem add-on com alto volume de mensagens humanas — candidatas naturais a Agente IA
        </p>
      </CardHeader>
      <CardContent className="flex-1 min-w-0">
        {opportunities.length === 0 ? (
          <div className="py-8 text-center text-sm text-muted-foreground">
            Nenhuma oportunidade identificada no período.
          </div>
        ) : (
          <div className="space-y-1.5">
            {opportunities.map(o => (
              <div key={o.id} className="flex items-center justify-between p-2.5 rounded-md hover:bg-muted/30 transition-colors border border-border/40">
                <div className="flex items-center gap-2 min-w-0">
                  <div className="w-8 h-8 rounded-md bg-secondary flex items-center justify-center text-xs font-semibold shrink-0">
                    {o.name.slice(0, 2).toUpperCase()}
                  </div>
                  <div className="min-w-0">
                    <div className="font-medium truncate text-sm">{o.name}</div>
                    <div className="text-[11px] text-muted-foreground capitalize">{o.plan_status}</div>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <Badge variant="outline" className="gap-1 text-xs">
                    <MessageSquare className="w-3 h-3" />
                    {o.human_messages.toLocaleString('pt-BR')} msgs
                  </Badge>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
