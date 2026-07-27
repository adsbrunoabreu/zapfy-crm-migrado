import { Zap, Filter, MessageSquare, Trophy, Wrench } from 'lucide-react';

const nodes = [
  { icon: Zap, label: 'Gatilho', sub: 'Lead novo + tag VIP', c: 'cyan' },
  { icon: Filter, label: 'Condição', sub: 'Horário comercial', c: 'amber' },
  { icon: MessageSquare, label: 'Ação', sub: 'Mensagem em 30s', c: 'primary' },
  { icon: Trophy, label: 'Resultado', sub: 'Reunião agendada', c: 'emerald' },
] as const;

const colorMap = {
  cyan: 'border-primary/40 bg-primary/10 text-primary',
  amber: 'border-amber-500/40 bg-amber-500/10 text-amber-400',
  primary: 'border-primary/40 bg-primary/10 text-primary',
  emerald: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-400',
};

export function AutomationFlowSection() {
  return (
    <section className="py-20 md:py-28 bg-secondary/20 border-y border-border/40 relative overflow-hidden">
      <div className="max-w-7xl mx-auto px-6">
        <div className="text-center max-w-2xl mx-auto mb-16">
          <div className="inline-flex flex-wrap items-center justify-center gap-2 mb-4">
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-primary/10 border border-primary/20 text-xs font-medium text-primary">
              <Zap className="w-3.5 h-3.5 fill-primary" />
              Automações sem código
            </div>
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-amber-500/10 border border-amber-500/30 text-xs font-medium text-amber-400">
              <Wrench className="w-3.5 h-3.5" />
              Em desenvolvimento
            </div>
          </div>
          <h2 className="font-display text-3xl md:text-5xl font-bold tracking-tight">
            Monte fluxos.{' '}
            <span className="bg-gradient-to-r from-primary to-primary bg-clip-text text-transparent">
              Durma tranquilo.
            </span>
          </h2>
          <p className="text-muted-foreground text-lg mt-4">
            Gatilhos, condições e ações encadeados em segundos. Recurso em construção — chega em breve pra deixar sua operação rodando 24/7.
          </p>
        </div>

        {/* Flow diagram */}
        <div className="relative max-w-5xl mx-auto">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6 md:gap-3 relative">
            {/* Connector line desktop */}
            <svg
              className="hidden md:block absolute top-12 left-[12.5%] right-[12.5%] h-2 w-3/4 -z-10"
              viewBox="0 0 800 8"
              preserveAspectRatio="none"
            >
              <line
                x1="0"
                y1="4"
                x2="800"
                y2="4"
                stroke="hsl(var(--primary))"
                strokeOpacity="0.4"
                strokeWidth="2"
                strokeDasharray="6 4"
                className="animate-flow-dash"
              />
            </svg>

            {nodes.map((n, i) => {
              const Icon = n.icon;
              return (
                <div key={n.label} className="relative">
                  <div
                    className={`mx-auto w-24 h-24 rounded-2xl border-2 ${colorMap[n.c]} flex items-center justify-center backdrop-blur-sm bg-background/80 shadow-[0_0_40px_-10px_currentColor] animate-fade-in`}
                    style={{ animationDelay: `${i * 0.15}s`, opacity: 0 }}
                  >
                    <Icon className="w-9 h-9" />
                  </div>
                  <div className="text-center mt-4">
                    <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                      {n.label}
                    </div>
                    <div className="text-sm font-semibold mt-1">{n.sub}</div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Examples */}
          <div className="mt-16 grid md:grid-cols-3 gap-3 max-w-4xl mx-auto">
            {[
              'Lead silencioso há 2 dias → reengajar',
              'Cliente respondeu fora do expediente → resposta automática',
              'NPS após 7 dias do atendimento',
              'Boas-vindas + apresentação da equipe',
              'Aniversário do cliente → mensagem personalizada',
              'Follow-up se não respondeu em 24h',
            ].map((ex) => (
              <div
                key={ex}
                className="rounded-xl border border-border/60 bg-card/40 px-4 py-3 text-sm hover:border-primary/40 transition-colors flex items-center gap-2.5"
              >
                <Zap className="w-3.5 h-3.5 text-primary fill-primary shrink-0" />
                <span className="text-foreground/90">{ex}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
