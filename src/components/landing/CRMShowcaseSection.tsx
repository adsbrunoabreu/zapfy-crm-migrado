import { LayoutGrid, Users, Tag, Phone, FileText, BarChart3 } from 'lucide-react';

const features = [
  { icon: LayoutGrid, title: 'Pipelines ilimitados', desc: 'Funis personalizados por equipe ou produto.' },
  { icon: Users, title: 'Distribuição automática', desc: 'Round-robin justo entre vendedores.' },
  { icon: Tag, title: 'Tags e segmentação', desc: 'Organize leads como você pensa.' },
  { icon: Phone, title: 'Multi-atendente', desc: 'Vários vendedores num mesmo número.' },
  { icon: FileText, title: 'Tickets e SLA', desc: 'Atendimento com prazo e prioridade.' },
  { icon: BarChart3, title: 'Relatórios em tempo real', desc: 'Métricas por vendedor, equipe e empresa.' },
];

export function CRMShowcaseSection() {
  return (
    <section className="py-20 md:py-28 relative overflow-hidden">
      <div className="absolute inset-0 -z-10">
        <div className="absolute top-1/4 right-1/4 w-[500px] h-[500px] bg-primary/10 blur-[140px] rounded-full" />
      </div>

      <div className="max-w-7xl mx-auto px-6">
        <div className="grid lg:grid-cols-2 gap-12 items-center">
          {/* Texto + features */}
          <div>
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-primary/10 border border-primary/30 text-xs font-medium text-primary mb-4">
              <LayoutGrid className="w-3.5 h-3.5" />
              CRM completo
            </div>
            <h2 className="font-display text-3xl md:text-5xl font-bold tracking-tight">
              Pipeline visual.{' '}
              <span className="bg-gradient-to-r from-primary to-primary bg-clip-text text-transparent">
                Decisão clara.
              </span>
            </h2>
            <p className="text-muted-foreground text-lg mt-4 leading-relaxed">
              Tudo que você espera de um CRM moderno — sem a complexidade de planilha
              gigante nem a rigidez dos antigões.
            </p>

            <div className="mt-8 grid sm:grid-cols-2 gap-3">
              {features.map((f) => {
                const Icon = f.icon;
                return (
                  <div
                    key={f.title}
                    className="rounded-xl border border-border/60 bg-card/40 p-4 hover:border-primary/40 hover:bg-card/70 transition-all"
                  >
                    <Icon className="w-5 h-5 text-primary mb-2.5" />
                    <div className="font-semibold text-sm">{f.title}</div>
                    <div className="text-xs text-muted-foreground mt-1 leading-relaxed">{f.desc}</div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Mockup kanban + ficha */}
          <div className="relative">
            <div className="rounded-2xl border border-border/60 bg-card/60 backdrop-blur-sm p-2 shadow-[0_0_100px_-20px_hsl(265_85%_60%/0.4)]">
              <div className="rounded-xl bg-white border border-zinc-200 overflow-hidden text-zinc-900">
                <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-200 bg-zinc-50">
                  <div className="text-xs font-semibold text-zinc-900">Pipeline · Vendas</div>
                  <div className="flex gap-1">
                    {['G', 'A', 'L'].map((l, i) => (
                      <div
                        key={i}
                        className="w-6 h-6 rounded-full border-2 border-white bg-gradient-to-br from-primary to-primary text-[10px] font-bold flex items-center justify-center -ml-2 first:ml-0 text-white"
                      >
                        {l}
                      </div>
                    ))}
                  </div>
                </div>

                <div className="p-3 grid grid-cols-3 gap-2">
                  {[
                    { name: 'Novo', n: 8, c: 'border-primary/30 bg-primary/5' },
                    { name: 'Contato', n: 5, c: 'border-amber-300 bg-amber-50' },
                    { name: 'Ganho', n: 3, c: 'border-emerald-300 bg-emerald-50' },
                  ].map((col, ci) => (
                    <div key={col.name} className={`rounded-lg border ${col.c} p-2`}>
                      <div className="text-[10px] font-semibold mb-2 flex items-center justify-between text-zinc-700">
                        <span>{col.name}</span>
                        <span className="text-zinc-500">{col.n}</span>
                      </div>
                      <div className="space-y-1.5">
                        {Array.from({ length: 3 }).map((_, i) => (
                          <div
                            key={i}
                            className={`rounded-md bg-white border p-2 space-y-1 shadow-sm ${
                              ci === 0 && i === 0 ? 'border-primary/60 shadow-[0_0_20px_-5px_hsl(var(--primary)/0.5)]' : 'border-zinc-200'
                            }`}
                            style={{ opacity: 1 - i * 0.15 }}
                          >
                            <div className="h-1.5 w-3/4 rounded bg-zinc-300" />
                            <div className="h-1 w-1/2 rounded bg-zinc-200" />
                            <div className="flex gap-1 mt-1">
                              <div className="h-1.5 w-6 rounded bg-primary/40" />
                              <div className="h-1.5 w-4 rounded bg-primary/40" />
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>

                {/* Lead drawer preview */}
                <div className="border-t border-zinc-200 p-3 space-y-2 bg-zinc-50">
                  <div className="flex items-center gap-2.5">
                    <div className="w-9 h-9 rounded-full bg-gradient-to-br from-primary to-primary flex items-center justify-center text-xs font-bold text-white">
                      MA
                    </div>
                    <div className="flex-1">
                      <div className="text-sm font-semibold text-zinc-900">Mariana Albuquerque</div>
                      <div className="text-[10px] text-zinc-500">+55 11 99999-9999 · há 2min</div>
                    </div>
                    <div className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 border border-emerald-200 font-medium">
                      Quente
                    </div>
                  </div>
                  <div className="flex gap-1.5 flex-wrap">
                    {['VIP', 'Indicação', 'Produto X'].map((tag) => (
                      <span
                        key={tag}
                        className="text-[10px] px-2 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/30 font-medium"
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                  <div className="grid grid-cols-3 gap-2 pt-1">
                    {[
                      { l: 'Valor', v: 'R$ 4.2k' },
                      { l: 'Origem', v: 'Instagram' },
                      { l: 'Vendedor', v: 'Lucas' },
                    ].map((kpi) => (
                      <div key={kpi.l}>
                        <div className="text-[9px] text-zinc-500 uppercase font-semibold">{kpi.l}</div>
                        <div className="text-[11px] font-bold text-zinc-900">{kpi.v}</div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
