import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import {
  ArrowRight,
  Zap,
  MessageCircle,
  TrendingUp,
  Users,
  CheckCircle2,
  Star,
  Sparkles,
} from 'lucide-react';

export function HeroSection() {
  const navigate = useNavigate();

  return (
    <section className="relative pt-32 pb-20 md:pt-40 md:pb-28 overflow-hidden">
      {/* Background glow */}
      <div className="absolute inset-0 -z-10">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[80%] h-[600px] bg-gradient-to-b from-primary/15 via-primary/5 to-transparent blur-3xl rounded-full" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,hsl(var(--primary)/0.08),transparent_60%)]" />
        <div
          className="absolute inset-0 opacity-[0.04]"
          style={{
            backgroundImage:
              'linear-gradient(hsl(var(--foreground)) 1px, transparent 1px), linear-gradient(90deg, hsl(var(--foreground)) 1px, transparent 1px)',
            backgroundSize: '48px 48px',
            maskImage:
              'radial-gradient(ellipse at 50% 0%, black 30%, transparent 70%)',
          }}
        />
      </div>

      <div className="max-w-7xl mx-auto px-6">
        <div className="max-w-4xl mx-auto text-center animate-fade-in">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-primary/10 border border-primary/20 text-xs font-medium text-primary mb-6">
            <Zap className="w-3.5 h-3.5 fill-primary" />
            Novo: IA que qualifica lead no Zap, 24/7
          </div>

          <h1 className="font-display text-4xl sm:text-5xl md:text-6xl lg:text-7xl font-bold tracking-tight leading-[1.05]">
            O{' '}
            <span className="bg-gradient-to-r from-primary via-primary to-primary/60 bg-clip-text text-transparent">
              Zap da sua empresa
            </span>
            ,<br className="hidden md:block" /> no automático.
          </h1>

          <p className="mt-6 text-base md:text-xl text-muted-foreground max-w-2xl mx-auto leading-relaxed">
            Centralize conversas, qualifique leads com IA e feche venda no WhatsApp —
            sem perder cliente no meio do caminho.
          </p>

          <div className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-3">
            <Button
              size="lg"
              variant="glow"
              onClick={() => navigate('/auth')}
              className="h-12 px-7 gap-2 text-base"
            >
              Começar grátis no Zap <ArrowRight className="w-4 h-4" />
            </Button>
            <Button
              size="lg"
              variant="outline"
              onClick={() =>
                document.getElementById('pricing')?.scrollIntoView({ behavior: 'smooth' })
              }
              className="h-12 px-7 text-base"
            >
              Ver planos
            </Button>
          </div>

          <div className="mt-8 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-xs text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <CheckCircle2 className="w-4 h-4 text-emerald-500" />
              Sem cartão de crédito
            </span>
            <span className="flex items-center gap-1.5">
              <CheckCircle2 className="w-4 h-4 text-emerald-500" />
              Setup em 5 minutos
            </span>
            <span className="flex items-center gap-1.5">
              <Star className="w-4 h-4 text-amber-400 fill-amber-400" />
              4,9/5 — +500 empresas
            </span>
          </div>
        </div>

        {/* Mockup do dashboard */}
        <div className="mt-16 md:mt-20 max-w-5xl mx-auto animate-fade-in">
          <div className="relative rounded-2xl border border-border/60 bg-card/50 backdrop-blur-sm p-2 shadow-[0_0_120px_-20px_hsl(var(--primary)/0.4)]">
            <div className="rounded-xl bg-muted/40 border border-border/40 overflow-hidden">
              {/* Window bar */}
              <div className="flex items-center gap-1.5 px-4 py-3 border-b border-border/40">
                <div className="w-2.5 h-2.5 rounded-full bg-red-500/80" />
                <div className="w-2.5 h-2.5 rounded-full bg-amber-500/80" />
                <div className="w-2.5 h-2.5 rounded-full bg-emerald-500/80" />
                <div className="ml-3 text-xs text-muted-foreground">app.zapfy.com.br/dashboard</div>
              </div>

              {/* Fake dashboard content */}
              <div className="p-5 grid grid-cols-12 gap-4">
                {/* Sidebar */}
                <div className="col-span-2 hidden md:flex flex-col gap-1.5">
                  {['Dashboard', 'Leads', 'Pipeline', 'Conversas', 'Equipe'].map((t, i) => (
                    <div
                      key={t}
                      className={`text-xs px-2.5 py-2 rounded-md ${
                        i === 0
                          ? 'bg-primary/15 text-primary border border-primary/20'
                          : 'text-muted-foreground'
                      }`}
                    >
                      {t}
                    </div>
                  ))}
                </div>

                {/* Main */}
                <div className="col-span-12 md:col-span-10 space-y-4">
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    {[
                      { label: 'Leads no mês', value: '1.284', icon: Users, c: 'text-primary' },
                      { label: 'Conversões', value: '24%', icon: TrendingUp, c: 'text-emerald-400' },
                      { label: 'Mensagens', value: '8.7k', icon: MessageCircle, c: 'text-amber-400' },
                      { label: 'Receita', value: 'R$ 92k', icon: Sparkles, c: 'text-primary' },
                    ].map((s) => {
                      const Icon = s.icon;
                      return (
                        <div
                          key={s.label}
                          className="rounded-lg border border-border/40 bg-muted/40/60 p-3"
                        >
                          <Icon className={`w-4 h-4 ${s.c}`} />
                          <div className="mt-2 text-lg font-semibold">{s.value}</div>
                          <div className="text-[10px] text-muted-foreground">{s.label}</div>
                        </div>
                      );
                    })}
                  </div>

                  <div className="rounded-lg border border-border/40 bg-muted/40/40 p-4">
                    <div className="flex items-center justify-between mb-3">
                      <div className="text-xs font-semibold">Pipeline de vendas</div>
                      <div className="text-[10px] text-muted-foreground">7 dias</div>
                    </div>
                    <div className="grid grid-cols-4 gap-2">
                      {[
                        { name: 'Novo', n: 32, c: 'bg-primary/30 border-primary/40' },
                        { name: 'Contato', n: 18, c: 'bg-amber-500/30 border-amber-500/40' },
                        { name: 'Proposta', n: 9, c: 'bg-primary/30 border-primary/40' },
                        { name: 'Ganho', n: 5, c: 'bg-emerald-500/30 border-emerald-500/40' },
                      ].map((col) => (
                        <div key={col.name} className="space-y-1.5">
                          <div className="text-[10px] text-muted-foreground flex items-center justify-between">
                            <span>{col.name}</span>
                            <span>{col.n}</span>
                          </div>
                          <div className={`h-12 rounded border ${col.c}`} />
                          <div className={`h-8 rounded border ${col.c} opacity-70`} />
                          <div className={`h-10 rounded border ${col.c} opacity-50`} />
                        </div>
                      ))}
                    </div>
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
