import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Target } from 'lucide-react';

const statusConfig: { key: string; label: string; colorClass: string; bgClass: string }[] = [
  { key: 'new', label: 'Novos', colorClass: 'bg-cyan', bgClass: 'bg-cyan/20' },
  { key: 'contacted', label: 'Contactados', colorClass: 'bg-amber', bgClass: 'bg-amber/20' },
  { key: 'qualified', label: 'Qualificados', colorClass: 'bg-violet', bgClass: 'bg-violet/20' },
  { key: 'proposal', label: 'Proposta', colorClass: 'bg-rose', bgClass: 'bg-rose/20' },
  { key: 'negotiation', label: 'Negociação', colorClass: 'bg-amber', bgClass: 'bg-amber/20' },
  { key: 'won', label: 'Fechados', colorClass: 'bg-emerald', bgClass: 'bg-emerald/20' },
  { key: 'lost', label: 'Perdidos', colorClass: 'bg-muted-foreground', bgClass: 'bg-muted/50' },
];

interface ConversionFunnelProps {
  byStatus: Record<string, number>;
  total: number;
}

export function ConversionFunnel({ byStatus, total }: ConversionFunnelProps) {
  const maxCount = Math.max(...Object.values(byStatus), 1);

  return (
    <Card className="glass-card">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <Target className="w-5 h-5 text-primary" />
          Funil de Conversão
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {statusConfig.map(({ key, label, colorClass, bgClass }) => {
          const count = byStatus[key] || 0;
          const widthPct = total > 0 ? Math.max((count / maxCount) * 100, 4) : 4;

          return (
            <div key={key} className="space-y-1">
              <div className="flex items-center justify-between text-sm">
                <span className="flex items-center gap-2 font-medium">
                  <div className={`w-2.5 h-2.5 rounded-full ${colorClass}`} />
                  {label}
                </span>
                <span className="text-muted-foreground">
                  {count} {total > 0 && <span className="text-xs">({Math.round((count / total) * 100)}%)</span>}
                </span>
              </div>
              <div className={`h-6 rounded-md ${bgClass} overflow-hidden`}>
                <div
                  className={`h-full rounded-md ${colorClass} transition-all duration-500`}
                  style={{ width: `${widthPct}%` }}
                />
              </div>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
