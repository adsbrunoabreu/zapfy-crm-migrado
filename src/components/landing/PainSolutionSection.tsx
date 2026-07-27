import { X, Check } from 'lucide-react';

const without = [
  'Mensagem perdida em 3 celulares diferentes',
  'Lead esfriando enquanto ninguém responde',
  'Atendente sobrecarregado e cliente irritado',
  'Planilha desatualizada, zero visibilidade do funil',
  'Follow-up esquecido, venda perdida pro concorrente',
];

const withZapfy = [
  'Tudo num único Zap centralizado, com histórico',
  'Múltiplos atendentes no mesmo número, sem perder mensagem',
  'Distribuição automática, equipe focada no que fecha',
  'Pipeline visual em tempo real, relatório pronto',
  'Automação cuida do follow-up, ninguém esquece',
];

export function PainSolutionSection() {
  return (
    <section className="py-20 md:py-28 relative overflow-hidden">
      <div className="absolute inset-0 -z-10">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-primary/5 blur-[120px] rounded-full" />
      </div>

      <div className="max-w-7xl mx-auto px-6">
        <div className="text-center max-w-3xl mx-auto mb-16">
          <span className="text-sm font-semibold text-primary uppercase tracking-wider">
            Antes & Depois
          </span>
          <h2 className="font-display text-3xl md:text-5xl font-bold mt-3 tracking-tight">
            Pare de perder cliente entre o{' '}
            <span className="bg-gradient-to-r from-primary to-primary bg-clip-text text-transparent">
              Zap e a planilha
            </span>
            .
          </h2>
          <p className="text-muted-foreground text-lg mt-4">
            O caos do atendimento manual versus a clareza de uma operação que vende sozinha.
          </p>
        </div>

        <div className="grid md:grid-cols-2 gap-5 max-w-5xl mx-auto">
          {/* Sem Zapfy */}
          <div className="rounded-2xl border border-border/40 bg-card/30 p-7 relative">
            <div className="inline-flex items-center gap-2 text-xs font-semibold text-rose uppercase tracking-wider mb-5">
              <span className="w-2 h-2 rounded-full bg-rose" />
              Sem Zapfy
            </div>
            <ul className="space-y-3.5">
              {without.map((item) => (
                <li key={item} className="flex items-start gap-3 text-sm text-muted-foreground">
                  <X className="w-4 h-4 text-rose mt-0.5 shrink-0" />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </div>

          {/* Com Zapfy */}
          <div className="rounded-2xl border-2 border-primary/40 bg-gradient-to-br from-primary/[0.06] to-primary/[0.04] p-7 relative shadow-[0_0_60px_-20px_hsl(var(--primary)/0.5)]">
            <div className="inline-flex items-center gap-2 text-xs font-semibold text-primary uppercase tracking-wider mb-5">
              <span className="w-2 h-2 rounded-full bg-primary animate-pulse" />
              Com Zapfy
            </div>
            <ul className="space-y-3.5">
              {withZapfy.map((item) => (
                <li key={item} className="flex items-start gap-3 text-sm text-foreground/95">
                  <Check className="w-4 h-4 text-primary mt-0.5 shrink-0" />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </section>
  );
}
