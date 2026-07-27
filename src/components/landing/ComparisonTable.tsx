import { Check, X, Sparkles } from 'lucide-react';

type Cellv = boolean | 'partial';
const rows: { feature: string; planilha: Cellv; crm: Cellv; zapfy: Cellv }[] = [
  { feature: 'WhatsApp nativo multi-atendente', planilha: false, crm: 'partial', zapfy: true },
  { feature: 'Pipeline visual em tempo real', planilha: false, crm: true, zapfy: true },
  { feature: 'Distribuição automática de leads', planilha: false, crm: 'partial', zapfy: true },
  { feature: 'Automações sem código', planilha: false, crm: 'partial', zapfy: true },
  { feature: 'Tickets, tags e histórico completo', planilha: false, crm: 'partial', zapfy: true },
  { feature: 'Relatórios prontos', planilha: 'partial', crm: true, zapfy: true },
  { feature: 'Setup em minutos', planilha: true, crm: false, zapfy: true },
  { feature: 'Agente de IA (add-on em desenvolvimento)', planilha: false, crm: false, zapfy: 'partial' },
  { feature: 'Preço acessível', planilha: true, crm: false, zapfy: true },
];

function Cell({ value }: { value: boolean | 'partial' }) {
  if (value === true) return <Check className="w-5 h-5 text-emerald-400 mx-auto" />;
  if (value === 'partial')
    return (
      <span className="inline-block w-5 h-px bg-muted-foreground mx-auto" aria-label="parcial" />
    );
  return <X className="w-5 h-5 text-muted-foreground/40 mx-auto" />;
}

export function ComparisonTable() {
  return (
    <section className="py-20 md:py-28">
      <div className="max-w-7xl mx-auto px-6">
        <div className="text-center max-w-2xl mx-auto mb-12">
          <span className="text-sm font-semibold text-primary uppercase tracking-wider">
            Comparativo
          </span>
          <h2 className="font-display text-3xl md:text-5xl font-bold mt-3 tracking-tight">
            Por que escolher{' '}
            <span className="bg-gradient-to-r from-primary to-primary bg-clip-text text-transparent">
              Zapfy?
            </span>
          </h2>
        </div>

        <div className="max-w-4xl mx-auto rounded-2xl border border-border/60 bg-card/40 overflow-hidden">
          <div className="grid grid-cols-[1fr_100px_120px_120px] md:grid-cols-[2fr_1fr_1fr_1fr] text-xs md:text-sm">
            {/* Header */}
            <div className="px-4 md:px-6 py-4 border-b border-border/60 font-semibold text-muted-foreground uppercase tracking-wider text-[11px]">
              Recurso
            </div>
            <div className="px-2 md:px-4 py-4 border-b border-border/60 text-center font-medium text-muted-foreground">
              Planilha
            </div>
            <div className="px-2 md:px-4 py-4 border-b border-border/60 text-center font-medium text-muted-foreground">
              CRM tradicional
            </div>
            <div className="px-2 md:px-4 py-4 border-b border-border/60 text-center font-bold text-primary bg-primary/5 flex items-center justify-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5" />
              Zapfy
            </div>

            {/* Rows */}
            {rows.map((r, i) => (
              <div key={r.feature} className="contents">
                <div
                  className={`px-4 md:px-6 py-3.5 ${
                    i < rows.length - 1 ? 'border-b border-border/40' : ''
                  } text-foreground/90`}
                >
                  {r.feature}
                </div>
                <div
                  className={`px-2 md:px-4 py-3.5 ${
                    i < rows.length - 1 ? 'border-b border-border/40' : ''
                  } flex items-center justify-center`}
                >
                  <Cell value={r.planilha} />
                </div>
                <div
                  className={`px-2 md:px-4 py-3.5 ${
                    i < rows.length - 1 ? 'border-b border-border/40' : ''
                  } flex items-center justify-center`}
                >
                  <Cell value={r.crm} />
                </div>
                <div
                  className={`px-2 md:px-4 py-3.5 ${
                    i < rows.length - 1 ? 'border-b border-border/40' : ''
                  } flex items-center justify-center bg-primary/5`}
                >
                  <Cell value={r.zapfy} />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
