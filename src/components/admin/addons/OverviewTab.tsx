import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Bot, Sparkles, ShoppingBag, ArrowRight } from 'lucide-react';
import { useCompaniesWithAddons } from '@/hooks/useAdminAddons';

interface OverviewTabProps {
  onNavigate: (tab: string) => void;
}

export function OverviewTab({ onNavigate }: OverviewTabProps) {
  const { data: companies = [] } = useCompaniesWithAddons();
  const total = companies.length || 1;
  const stats = {
    total: companies.length,
    ai: companies.filter((c) => c.ai_agent_enabled).length,
    auto: companies.filter((c) => c.automations_enabled).length,
    store: companies.filter((c) => c.ecommerce_enabled).length,
  };
  const pct = (n: number) => Math.round((n / total) * 100);

  const cards = [
    {
      key: 'ai',
      title: 'Agente IA',
      icon: Bot,
      count: stats.ai,
      pct: pct(stats.ai),
      desc: 'Assistente de qualificação automática via WhatsApp.',
      tab: 'ai',
      cta: 'Configurar provedor global',
    },
    {
      key: 'auto',
      title: 'Automações',
      icon: Sparkles,
      count: stats.auto,
      pct: pct(stats.auto),
      desc: 'Triggers, sequências e crons da plataforma.',
      tab: 'automations',
      cta: 'Controle global',
    },
    {
      key: 'store',
      title: 'e-Commerce',
      icon: ShoppingBag,
      count: stats.store,
      pct: pct(stats.store),
      desc: 'Conexão com Shopify e venda via IA.',
      tab: 'store',
      cta: 'Configurar provedores',
    },
  ];

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
        <Card className="p-4 bg-background border-border">
          <div className="text-xs text-muted-foreground">Total de empresas</div>
          <div className="text-2xl font-semibold mt-1">{stats.total}</div>
        </Card>
        {cards.map((c) => (
          <Card key={c.key} className="p-4 bg-background border-border">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <c.icon className="h-3.5 w-3.5" /> {c.title}
            </div>
            <div className="text-2xl font-semibold mt-1">
              {c.count} <span className="text-sm text-muted-foreground">({c.pct}%)</span>
            </div>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {cards.map((c) => (
          <Card key={c.key} className="p-5 bg-background border-border flex flex-col gap-3">
            <div className="flex items-center gap-2">
              <div className="h-9 w-9 rounded-lg bg-background ring-1 ring-border flex items-center justify-center">
                <c.icon className="h-4 w-4" />
              </div>
              <div>
                <h3 className="text-sm font-semibold">{c.title}</h3>
                <p className="text-xs text-muted-foreground">{c.desc}</p>
              </div>
            </div>
            <Button size="sm" variant="outline" className="mt-auto justify-between"
              onClick={() => onNavigate(c.tab)}>
              {c.cta} <ArrowRight className="h-3.5 w-3.5" />
            </Button>
          </Card>
        ))}
      </div>
    </div>
  );
}
