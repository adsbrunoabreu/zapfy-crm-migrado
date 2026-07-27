import { Smartphone, Users, Rocket } from 'lucide-react';

const steps = [
  {
    n: '01',
    icon: Smartphone,
    title: 'Conecte seu WhatsApp',
    desc: 'Em menos de 2 minutos sua linha está integrada e pronta para atender.',
  },
  {
    n: '02',
    icon: Users,
    title: 'Convide sua equipe',
    desc: 'Adicione vendedores, defina permissões e distribua leads automaticamente.',
  },
  {
    n: '03',
    icon: Rocket,
    title: 'Comece a vender',
    desc: 'Acompanhe o pipeline, bata metas e veja a receita crescer em tempo real.',
  },
];

export function HowItWorksSection() {
  return (
    <section id="how-it-works" className="py-20 md:py-28 bg-secondary/20 border-y border-border/40">
      <div className="max-w-7xl mx-auto px-6">
        <div className="text-center max-w-2xl mx-auto mb-16">
          <span className="text-sm font-semibold text-primary uppercase tracking-wider">
            Como funciona
          </span>
          <h2 className="font-display text-3xl md:text-5xl font-bold mt-3 tracking-tight">
            Comece em 3 passos
          </h2>
          <p className="text-muted-foreground text-lg mt-4">
            Sem treinamento longo, sem consultor caro. É plug and play de verdade.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 relative">
          {/* Linha conectora — atrás dos ícones */}
          <div className="hidden md:block absolute top-12 left-[16%] right-[16%] h-px bg-gradient-to-r from-transparent via-primary/30 to-transparent z-0" />

          {steps.map((s) => {
            const Icon = s.icon;
            return (
              <div key={s.n} className="relative text-center px-4 z-10">
                <div className="relative inline-flex items-center justify-center w-24 h-24 mb-6">
                  {/* Fundo opaco para ocultar a linha por trás do ícone */}
                  <div className="absolute inset-0 rounded-2xl bg-secondary" />
                  <div className="absolute inset-0 rounded-2xl bg-gradient-to-br from-primary/20 to-primary/5 border border-primary/30" />
                  <Icon className="w-9 h-9 text-primary relative z-10" />
                  <span className="absolute -top-2 -right-2 w-8 h-8 rounded-full bg-background border border-primary/40 flex items-center justify-center text-xs font-bold text-primary z-20">
                    {s.n}
                  </span>
                </div>
                <h3 className="font-display text-xl font-semibold mb-2">{s.title}</h3>
                <p className="text-sm text-muted-foreground leading-relaxed max-w-xs mx-auto">
                  {s.desc}
                </p>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
