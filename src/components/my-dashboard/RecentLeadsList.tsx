import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Users, ArrowRight, Phone } from 'lucide-react';

const statusLabels: Record<string, string> = {
  new: 'Novo',
  contacted: 'Contactado',
  qualified: 'Qualificado',
  proposal: 'Proposta',
  negotiation: 'Negociação',
  won: 'Fechado',
  lost: 'Perdido',
};

interface RecentLeadsListProps {
  leads: Array<{
    id: string;
    name: string;
    phone: string | null;
    value: number | null;
    status: string;
    pipeline?: { name: string };
  }>;
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 0 }).format(value);
}

export function RecentLeadsList({ leads }: RecentLeadsListProps) {
  const navigate = useNavigate();

  return (
    <Card className="glass-card">
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="flex items-center gap-2 text-lg">
          <Users className="w-5 h-5 text-primary" />
          Leads Recentes
        </CardTitle>
        <Button variant="ghost" size="sm" onClick={() => navigate('/leads')}>
          Ver todos
          <ArrowRight className="w-4 h-4 ml-1" />
        </Button>
      </CardHeader>
      <CardContent>
        {leads.length > 0 ? (
          <div className="space-y-3">
            {leads.map((lead) => (
              <div
                key={lead.id}
                className="flex items-center justify-between p-3 rounded-lg bg-secondary/30 hover:bg-secondary/50 transition-colors cursor-pointer"
                onClick={() => navigate('/pipelines')}
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center">
                    <span className="text-sm font-medium text-primary">{lead.name[0]}</span>
                  </div>
                  <div>
                    <p className="font-medium">{lead.name}</p>
                    <div className="flex items-center gap-3 text-xs text-muted-foreground">
                      {lead.phone && (
                        <span className="flex items-center gap-1">
                          <Phone className="w-3 h-3" />
                          {lead.phone}
                        </span>
                      )}
                      {lead.pipeline?.name && <span>{lead.pipeline.name}</span>}
                    </div>
                  </div>
                </div>
                <div className="text-right">
                  <p className="font-semibold text-emerald">{formatCurrency(lead.value || 0)}</p>
                  <Badge variant="outline" className="text-xs mt-1">
                    {statusLabels[lead.status] || lead.status}
                  </Badge>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-8 text-muted-foreground">
            <Users className="w-12 h-12 mx-auto mb-3 opacity-50" />
            <p>Nenhum lead atribuído a você ainda.</p>
            <p className="text-sm mt-1">Peça ao administrador para atribuir leads a você.</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
