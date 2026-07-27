import { Headphones, Rocket, Lock, BadgeCheck } from 'lucide-react';

const items = [
  {
    icon: Headphones,
    title: 'Suporte humano em pt-BR',
    desc: 'Atendimento real por gente que entende do seu negócio.',
  },
  {
    icon: Rocket,
    title: 'Setup em minutos',
    desc: 'Sem consultor caro. Você mesmo configura tudo.',
  },
  {
    icon: BadgeCheck,
    title: 'Sem fidelidade',
    desc: 'Mensal ou anual, cancele quando quiser sem multa.',
  },
  {
    icon: Lock,
    title: 'LGPD compliant',
    desc: 'Seus dados e dos seus clientes em conformidade total.',
  },
];

export function WhyChooseSection() {
  return (
    <section className="py-20 md:py-24">
      <div className="max-w-7xl mx-auto px-6">
        <div className="text-center max-w-2xl mx-auto mb-12">
          <span className="text-sm font-semibold text-primary uppercase tracking-wider">
            Por que Zapfy
          </span>
          <h2 className="font-display text-3xl md:text-4xl font-bold mt-3 tracking-tight">
            Feito pra quem vende todo dia no Zap
          </h2>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {items.map((it) => {
            const Icon = it.icon;
            return (
              <div
                key={it.title}
                className="rounded-xl border border-border/60 bg-card/40 p-5 text-center md:text-left"
              >
                <Icon className="w-6 h-6 text-primary mb-3 mx-auto md:mx-0" />
                <h3 className="font-semibold text-sm md:text-base">{it.title}</h3>
                <p className="text-xs text-muted-foreground mt-1.5 leading-relaxed">{it.desc}</p>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
