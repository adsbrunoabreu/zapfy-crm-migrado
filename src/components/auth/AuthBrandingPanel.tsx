import { Zap, MessageCircle, Users, CheckCircle2, Sparkles, Star, TrendingUp } from 'lucide-react';

export function AuthBrandingPanel() {
  return (
    <aside className="hidden lg:flex lg:w-1/2 relative overflow-hidden border-r border-border/40 bg-background min-h-dvh">
      {/* Background glow + grid */}
      <div className="absolute inset-0 -z-10">
        <div className="absolute -top-40 -left-20 w-[600px] h-[600px] bg-gradient-to-br from-primary/20 via-primary/5 to-transparent blur-3xl rounded-full" />
        <div className="absolute bottom-0 right-0 w-[500px] h-[500px] bg-gradient-to-tl from-primary/10 via-transparent to-transparent blur-3xl rounded-full" />
        <div
          className="absolute inset-0 opacity-[0.04]"
          style={{
            backgroundImage:
              'linear-gradient(hsl(var(--foreground)) 1px, transparent 1px), linear-gradient(90deg, hsl(var(--foreground)) 1px, transparent 1px)',
            backgroundSize: '48px 48px',
            maskImage: 'radial-gradient(ellipse at 30% 30%, black 30%, transparent 75%)',
          }}
        />
      </div>

      {/* ===== CONTEÚDO CENTRALIZADO VERTICALMENTE ===== */}
      <div className="relative z-[1] w-full flex-col px-12 py-16 min-h-dvh flex items-center justify-center">
        <div className="gap-6 max-w-[520px] w-full flex-col flex items-start justify-start mx-0 px-[32px] py-[32px]">
          {/* Feature badge */}
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary/10 border border-primary/20 text-xs font-medium text-primary mb-2">
            <Zap className="w-4 h-4 fill-primary" />
            CRM brasileiro com WhatsApp + IA
          </div>

          {/* Heading */}
          <h1 className="font-display text-5xl font-bold leading-[1.2] tracking-tight m-0 text-left xl:text-7xl">
            O{' '}
            <span className="bg-gradient-to-r from-primary via-primary to-primary/60 bg-clip-text text-transparent">
              Zap da sua empresa
            </span>
            ,<br />
            no automático.
          </h1>

          {/* Description */}
          <p className="text-base text-muted-foreground leading-relaxed m-0 max-w-[480px]">
            Centralize conversas, qualifique leads com IA e feche venda no WhatsApp —
            sem perder cliente no meio do caminho.
          </p>

          {/* Card exemplo */}
          <div className="mt-2 w-full max-w-[360px] rounded-xl border border-primary/15 bg-primary/[0.04] p-6 shadow-[0_0_80px_-20px_hsl(var(--primary)/0.35)]">
            <div className="flex items-start justify-between mb-5">
              <div className="flex items-center gap-3 flex-1 min-w-0">
                <div className="w-10 h-10 rounded-lg bg-primary/15 border border-primary/20 flex items-center justify-center shrink-0">
                  <MessageCircle className="w-5 h-5 text-primary" />
                </div>
                <div className="flex flex-col gap-1 min-w-0">
                  <div className="text-sm font-semibold text-foreground truncate">Novo lead via WhatsApp</div>
                  <div className="text-xs text-muted-foreground truncate">há 2 min · Pipeline Vendas</div>
                </div>
              </div>
              <span className="text-[11px] font-medium px-3 py-1 rounded bg-primary/15 text-primary border border-primary/20 shrink-0">
                Novo
              </span>
            </div>

            <div className="grid grid-cols-3 gap-5 border-t border-primary/10 pt-5">
              {[
                { v: '1.284', l: 'Leads', i: Users },
                { v: '24%', l: 'Conv.', i: TrendingUp },
                { v: '8.7k', l: 'Msgs', i: MessageCircle },
              ].map((s) => {
                const Icon = s.i;
                return (
                  <div key={s.l} className="flex flex-col items-center gap-2 text-center min-w-0">
                    <Icon className="w-4 h-4 text-primary" />
                    <div className="text-xl font-bold text-primary leading-none">{s.v}</div>
                    <div className="text-xs text-muted-foreground">{s.l}</div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Footer features — logo abaixo do card, parte do bloco centralizado */}
          <div className="flex items-center flex-wrap gap-x-6 gap-y-3 mt-2">
            <span className="flex items-center gap-2 text-[13px] text-muted-foreground">
              <CheckCircle2 className="w-4 h-4 text-primary" />
              <strong className="text-primary font-medium">24 horas</strong> grátis
            </span>
            <span className="flex items-center gap-2 text-[13px] text-muted-foreground">
              <CheckCircle2 className="w-4 h-4 text-primary" />
              Sem cartão
            </span>
            <span className="flex items-center gap-2 text-[13px] text-muted-foreground">
              <Star className="w-4 h-4 fill-amber-400 text-amber-400" />
              <strong className="text-primary font-medium">4,9/5</strong> · +500 empresas
            </span>
          </div>
        </div>
      </div>
    </aside>
  );
}
