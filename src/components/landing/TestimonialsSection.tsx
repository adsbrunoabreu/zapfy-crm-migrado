import { Star, Quote } from 'lucide-react';

const testimonials = [
  {
    name: 'Mariana Albuquerque',
    role: 'CEO',
    company: 'Albuquerque Crédito',
    quote:
      'Reduzimos 40% do tempo de resposta no Zap e fechamos 2x mais propostas no primeiro mês. Virou o coração da operação.',
    avatar: 'https://i.pravatar.cc/120?img=47',
  },
  {
    name: 'Rafael Monteiro',
    role: 'Sócio',
    company: 'Monteiro Consig',
    quote:
      'Sai de planilhas pra um CRM que minha equipe usa de verdade. O pipeline visual deixou óbvio onde a gente perdia dinheiro.',
    avatar: 'https://i.pravatar.cc/120?img=12',
  },
  {
    name: 'Juliana Costa',
    role: 'Diretora Comercial',
    company: 'Costa Promotora',
    quote:
      'Distribuição automática acabou com a briga interna. Cada vendedor sabe o que precisa fazer no minuto.',
    avatar: 'https://i.pravatar.cc/120?img=32',
  },
  {
    name: 'Bruno Tavares',
    role: 'Founder',
    company: 'Tavares Imóveis',
    quote:
      'Coloquei 6 corretores no mesmo número de WhatsApp e nenhum lead se perde mais. O pipeline visual virou nossa reunião de segunda.',
    avatar: 'https://i.pravatar.cc/120?img=68',
  },
  {
    name: 'Camila Reis',
    role: 'Gerente de Vendas',
    company: 'Reis Cosméticos',
    quote:
      'Plug and play de verdade. Em 1 dia já tinha 4 vendedoras atendendo no mesmo número sem confusão.',
    avatar: 'https://i.pravatar.cc/120?img=45',
  },
  {
    name: 'Paulo Henrique',
    role: 'CEO',
    company: 'PH Contabilidade',
    quote:
      'As automações fazem o que 2 estagiários faziam. Pago o Zapfy e ainda sobra dinheiro no fim do mês.',
    avatar: 'https://i.pravatar.cc/120?img=15',
  },
];

function Card({ t }: { t: (typeof testimonials)[number] }) {
  return (
    <div className="relative w-[340px] sm:w-[380px] shrink-0 rounded-xl border border-border/60 bg-card/60 backdrop-blur-sm p-6 flex flex-col">
      <Quote className="absolute top-4 right-4 w-7 h-7 text-primary/15" />
      <div className="flex items-center gap-1 mb-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <Star key={i} className="w-3.5 h-3.5 fill-amber-400 text-amber-400" />
        ))}
      </div>
      <p className="text-sm text-foreground/90 leading-relaxed flex-1">"{t.quote}"</p>
      <div className="mt-5 pt-4 border-t border-border/40 flex items-center gap-3">
        <img
          src={t.avatar}
          alt={t.name}
          loading="lazy"
          className="w-10 h-10 rounded-full object-cover border border-border/60"
        />
        <div>
          <div className="text-sm font-semibold">{t.name}</div>
          <div className="text-[11px] text-muted-foreground">
            {t.role} · {t.company}
          </div>
        </div>
      </div>
    </div>
  );
}

export function TestimonialsSection() {
  // duplicar para loop infinito
  const loop = [...testimonials, ...testimonials];

  return (
    <section id="testimonials" className="py-20 md:py-28 overflow-hidden">
      <div className="max-w-7xl mx-auto px-6 mb-12">
        <div className="text-center max-w-2xl mx-auto">
          <span className="text-sm font-semibold text-primary uppercase tracking-wider">
            Depoimentos
          </span>
          <h2 className="font-display text-3xl md:text-5xl font-bold mt-3 tracking-tight">
            Quem usa, recomenda
          </h2>
          <p className="text-muted-foreground text-lg mt-4">
            Empresas brasileiras crescendo com mais previsibilidade e menos planilha.
          </p>
        </div>
      </div>

      <div
        className="relative group"
        style={{
          maskImage:
            'linear-gradient(to right, transparent, black 8%, black 92%, transparent)',
        }}
      >
        <div className="flex gap-5 w-max animate-marquee group-hover:[animation-play-state:paused]">
          {loop.map((t, i) => (
            <Card key={`${t.name}-${i}`} t={t} />
          ))}
        </div>
      </div>
    </section>
  );
}
