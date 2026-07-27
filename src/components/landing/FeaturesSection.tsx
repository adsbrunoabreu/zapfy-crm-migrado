import {
  MessageCircle,
  Kanban,
  Users,
  Zap,
  BarChart3,
  Shield,
} from 'lucide-react';

const features = [
  {
    icon: MessageCircle,
    title: 'WhatsApp integrado',
    desc: 'Atenda em segundos sem perder cliente. Conversas centralizadas, com histórico e equipe.',
  },
  {
    icon: Kanban,
    title: 'Pipeline visual',
    desc: 'Veja em qual etapa cada venda está parada e mova com um arrastar. Sem planilhas.',
  },
  {
    icon: Zap,
    title: 'Distribuição automática',
    desc: 'Distribua leads para sua equipe em segundos com round-robin inteligente.',
  },
  {
    icon: Users,
    title: 'Gestão de equipe',
    desc: 'Metas, permissões, ranking e atividade de cada vendedor em tempo real.',
  },
  {
    icon: BarChart3,
    title: 'Relatórios que importam',
    desc: 'Dashboards prontos sobre conversão, tempo de resposta e receita por canal.',
  },
  {
    icon: Shield,
    title: 'Seguro e LGPD',
    desc: 'Dados isolados por empresa, criptografados, com backup automático e conformidade total.',
  },
];

export function FeaturesSection() {
  return (
    <section id="features" className="py-20 md:py-28 relative">
      <div className="max-w-7xl mx-auto px-6">
        <div className="text-center max-w-2xl mx-auto mb-16">
          <span className="text-sm font-semibold text-primary uppercase tracking-wider">
            Recursos
          </span>
          <h2 className="font-display text-3xl md:text-5xl font-bold mt-3 tracking-tight">
            Tudo que você precisa para vender mais
          </h2>
          <p className="text-muted-foreground text-lg mt-4">
            Não é mais um CRM cheio de função que ninguém usa. É o essencial,
            feito para o dia a dia da sua operação.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {features.map((f) => {
            const Icon = f.icon;
            return (
              <div
                key={f.title}
                className="group relative rounded-xl border border-border/60 bg-card/40 p-6 hover:border-primary/40 hover:bg-card/70 transition-all"
              >
                <div className="w-11 h-11 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center mb-5 group-hover:bg-primary/20 transition-colors">
                  <Icon className="w-5 h-5 text-primary" />
                </div>
                <h3 className="font-display text-lg font-semibold mb-2">{f.title}</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">{f.desc}</p>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
