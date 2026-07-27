// Faixa de prova social — logos tipográficos em marquee infinito.

const logos = [
  'Pitada Digital',
  'NextAds',
  'SC Gráfica',
  'EquiPass',
  'PetCare+',
  'ZapCloud',
  'Clinica Vida',
  'BarberFlow',
  'LawSync',
  'Construtora JK',
  'LogiHub',
];

export function SocialProofBar() {
  // Duplica para loop sem cortes
  const loop = [...logos, ...logos];

  return (
    <section className="border-y border-border/40 bg-background/40">
      <div className="max-w-7xl mx-auto px-6 py-10">
        <p className="text-center text-xs font-medium text-muted-foreground uppercase tracking-wider mb-6">
          Empresas vendendo todo dia no Zapfy
        </p>

        <div
          className="relative overflow-hidden"
          style={{
            maskImage:
              'linear-gradient(to right, transparent 0, #000 8%, #000 92%, transparent 100%)',
            WebkitMaskImage:
              'linear-gradient(to right, transparent 0, #000 8%, #000 92%, transparent 100%)',
          }}
        >
          <div className="flex gap-12 md:gap-16 w-max animate-marquee">
            {loop.map((name, i) => (
              <div
                key={`${name}-${i}`}
                className="shrink-0 font-display text-xl font-bold text-muted-foreground/60 hover:text-muted-foreground transition-colors whitespace-nowrap"
              >
                {name}
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
