import { AnimatedCounter } from './AnimatedCounter';

// TODO: substituir pelos números reais quando disponíveis
const stats = [
  { value: 500, suffix: '+', label: 'Empresas ativas' },
  { value: 10, suffix: 'k+', label: 'Leads gerenciados' },
  { value: 98, suffix: '%', label: 'Uptime garantido' },
  { value: 4.9, decimals: 1, suffix: '/5', label: 'Satisfação dos clientes' },
];

export function StatsSection() {
  return (
    <section className="py-20 md:py-24">
      <div className="max-w-7xl mx-auto px-6">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-8 md:gap-4">
          {stats.map((s) => (
            <div key={s.label} className="text-center">
              <div className="font-display text-4xl md:text-6xl font-bold bg-gradient-to-b from-foreground to-foreground/60 bg-clip-text text-transparent">
                <AnimatedCounter
                  to={s.value}
                  decimals={s.decimals ?? 0}
                  suffix={s.suffix}
                />
              </div>
              <p className="mt-2 text-sm text-muted-foreground">{s.label}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
