import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import {
  ArrowRight,
  Zap,
  CheckCircle2,
  Star,
  Bot,
  Sparkles,
  TrendingUp,
  Users,
  MessageCircle,
} from 'lucide-react';

export function HeroSectionV2() {
  const navigate = useNavigate();

  return (
    <section className="relative pt-28 pb-16 md:pt-36 md:pb-24 overflow-hidden">
      {/* Aurora background */}
      <div className="absolute inset-0 -z-10">
        <div className="absolute top-[-10%] left-1/2 -translate-x-1/2 w-[90%] h-[700px] bg-gradient-to-b from-primary/20 via-primary/5 to-transparent blur-3xl rounded-full" />
        <div className="absolute top-[20%] left-[10%] w-[400px] h-[400px] bg-primary/15 blur-[140px] rounded-full" />
        <div className="absolute top-[10%] right-[5%] w-[350px] h-[350px] bg-primary/10 blur-[120px] rounded-full" />
        <div
          className="absolute inset-0 opacity-[0.04]"
          style={{
            backgroundImage:
              'linear-gradient(hsl(var(--foreground)) 1px, transparent 1px), linear-gradient(90deg, hsl(var(--foreground)) 1px, transparent 1px)',
            backgroundSize: '56px 56px',
            maskImage: 'radial-gradient(ellipse at 50% 0%, black 30%, transparent 75%)',
          }}
        />
      </div>

      <div className="max-w-7xl mx-auto px-6">
        <div className="max-w-4xl mx-auto text-center animate-fade-in">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-primary/10 border border-primary/20 text-xs font-medium text-primary mb-6">
            <Sparkles className="w-3.5 h-3.5" />
            WhatsApp multi-atendimento com CRM integrado
          </div>

          <h1 className="font-display text-4xl sm:text-5xl md:text-6xl lg:text-7xl font-bold tracking-tight leading-[1.02]">
            A solução{' '}
            <span className="bg-gradient-to-r from-primary via-primary to-primary bg-clip-text text-transparent">
              definitiva
            </span>
            <br className="hidden md:block" /> pra atender no WhatsApp.
          </h1>

          <p className="mt-6 text-base md:text-xl text-muted-foreground max-w-2xl mx-auto leading-relaxed">
            Vários atendentes num mesmo número, conversas centralizadas e pipeline visual.
            Pra empresa de qualquer tamanho — sem perder cliente, sem planilha, sem caos.
          </p>

          <div className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-3">
            <Button
              size="lg"
              variant="glow"
              onClick={() => navigate('/auth')}
              className="h-12 px-7 gap-2 text-base"
            >
              Começar grátis <ArrowRight className="w-4 h-4" />
            </Button>
            <Button
              size="lg"
              variant="outline"
              onClick={() =>
                document.getElementById('pillars')?.scrollIntoView({ behavior: 'smooth' })
              }
              className="h-12 px-7 text-base"
            >
              Ver CRM em ação
            </Button>
          </div>

          <div className="mt-8 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-xs text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <CheckCircle2 className="w-4 h-4 text-emerald-500" />
              Sem cartão
            </span>
            <span className="flex items-center gap-1.5">
              <CheckCircle2 className="w-4 h-4 text-emerald-500" />
              Setup em 5 min
            </span>
          </div>

        </div>

        {/* Mockup duplo */}
        <div className="mt-16 md:mt-20 max-w-6xl mx-auto animate-fade-in">
          <div className="relative">
            {/* Floating badges */}
            <div className="hidden lg:flex absolute -top-4 left-[-2%] items-center gap-2 px-3 py-2 rounded-xl bg-card/90 backdrop-blur-md border border-emerald-500/30 text-xs font-medium shadow-xl animate-float-y z-20">
              <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              Lead novo no pipeline
            </div>
            <div
              className="hidden lg:flex absolute top-[35%] right-[-3%] items-center gap-2 px-3 py-2 rounded-xl bg-card/90 backdrop-blur-md border border-primary/30 text-xs font-medium shadow-xl animate-float-y z-20"
              style={{ animationDelay: '1.5s' }}
            >
              <Zap className="w-3.5 h-3.5 text-primary fill-primary" />
              Mensagem centralizada
            </div>
            <div
              className="hidden lg:flex absolute bottom-[8%] left-[-3%] items-center gap-2 px-3 py-2 rounded-xl bg-card/90 backdrop-blur-md border border-primary/40 text-xs font-medium shadow-xl animate-float-y z-20"
              style={{ animationDelay: '0.7s' }}
            >
              <TrendingUp className="w-3.5 h-3.5 text-primary" />
              Venda fechada
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-5 gap-5 items-center">
              {/* Chat IA mockup */}
              <div className="lg:col-span-2 relative">
                <div className="rounded-2xl border border-border/60 bg-card/70 backdrop-blur-sm p-2 shadow-[0_0_80px_-20px_hsl(var(--primary)/0.5)] lg:rotate-[-2deg] lg:hover:rotate-0 transition-transform duration-500">
                  <div className="rounded-xl bg-white border border-zinc-200 overflow-hidden text-zinc-900">
                    <div className="flex items-center gap-2 px-3 py-2.5 border-b border-zinc-200 bg-zinc-50">
                      <div className="w-7 h-7 rounded-full bg-emerald-100 flex items-center justify-center">
                        <MessageCircle className="w-3.5 h-3.5 text-emerald-600" />
                      </div>
                      <div className="text-xs">
                        <div className="font-semibold text-zinc-900">Atendimento — Equipe</div>
                        <div className="text-[10px] text-emerald-600 flex items-center gap-1">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                          Lucas digitando
                        </div>
                      </div>
                    </div>
                    <div className="p-3 space-y-2 min-h-[280px] bg-white">
                      <ChatBubble fromMe={false} text="Oi, quanto custa o plano?" delay="0s" />
                      <ChatBubble
                        fromMe
                        text="Olá! 👋 Temos planos a partir de R$ 197/mês. Posso entender melhor o seu cenário?"
                        delay="0.3s"
                      />
                      <ChatBubble fromMe={false} text="Tenho 8 vendedores" delay="0.6s" />
                      <ChatBubble
                        fromMe
                        text="Perfeito! O plano Professional cabe direitinho. Te mando proposta no e-mail?"
                        delay="0.9s"
                      />
                      <div className="flex items-center gap-1.5 px-3 py-2 rounded-2xl bg-emerald-100 border border-emerald-200 w-fit">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-typing-dot" />
                        <span
                          className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-typing-dot"
                          style={{ animationDelay: '0.2s' }}
                        />
                        <span
                          className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-typing-dot"
                          style={{ animationDelay: '0.4s' }}
                        />
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Dashboard mockup */}
              <div className="lg:col-span-3">
                <div className="rounded-2xl border border-border/60 bg-card/70 backdrop-blur-sm p-2 shadow-[0_0_120px_-20px_hsl(var(--primary)/0.4)] lg:rotate-[1.5deg] lg:hover:rotate-0 transition-transform duration-500">
                  <div className="rounded-xl bg-white border border-zinc-200 overflow-hidden text-zinc-900">
                    <div className="flex items-center gap-1.5 px-4 py-3 border-b border-zinc-200 bg-zinc-50">
                      <div className="w-2.5 h-2.5 rounded-full bg-red-500" />
                      <div className="w-2.5 h-2.5 rounded-full bg-amber-500" />
                      <div className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
                      <div className="ml-3 text-xs text-zinc-500">app.zapfy.com.br</div>
                    </div>

                    <div className="p-4 space-y-3 bg-white">
                      <div className="grid grid-cols-4 gap-2">
                        {[
                          { label: 'Leads', value: '1.284', icon: Users, c: 'text-primary' },
                          { label: 'Conv.', value: '24%', icon: TrendingUp, c: 'text-emerald-600' },
                          { label: 'Msgs', value: '8.7k', icon: MessageCircle, c: 'text-amber-600' },
                          { label: 'Receita', value: 'R$92k', icon: Sparkles, c: 'text-primary' },
                        ].map((s) => {
                          const Icon = s.icon;
                          return (
                            <div
                              key={s.label}
                              className="rounded-lg border border-zinc-200 bg-zinc-50 p-2.5"
                            >
                              <Icon className={`w-3.5 h-3.5 ${s.c}`} />
                              <div className="mt-1.5 text-base font-bold text-zinc-900">{s.value}</div>
                              <div className="text-[10px] text-zinc-500">{s.label}</div>
                            </div>
                          );
                        })}
                      </div>

                      <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-3">
                        <div className="flex items-center justify-between mb-2.5">
                          <div className="text-xs font-semibold text-zinc-900">Pipeline</div>
                          <div className="text-[10px] text-zinc-500">Tempo real</div>
                        </div>
                        <div className="grid grid-cols-4 gap-1.5">
                          {[
                            { name: 'Novo', n: 32, c: 'bg-primary/10 border-primary/30' },
                            { name: 'Contato', n: 18, c: 'bg-amber-100 border-amber-300' },
                            { name: 'Proposta', n: 9, c: 'bg-primary/10 border-primary/30' },
                            { name: 'Ganho', n: 5, c: 'bg-emerald-100 border-emerald-300' },
                          ].map((col) => (
                            <div key={col.name} className="space-y-1">
                              <div className="text-[10px] text-zinc-700 font-medium flex items-center justify-between">
                                <span>{col.name}</span>
                                <span className="text-zinc-500">{col.n}</span>
                              </div>
                              <div className={`h-9 rounded border ${col.c}`} />
                              <div className={`h-7 rounded border ${col.c} opacity-70`} />
                              <div className={`h-8 rounded border ${col.c} opacity-50`} />
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* Mini chart */}
                      <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-3">
                        <div className="flex items-center justify-between mb-2">
                          <div className="text-xs font-semibold text-zinc-900">Vendas (7 dias)</div>
                          <div className="text-[10px] text-emerald-600 font-semibold">+38%</div>
                        </div>
                        <div className="flex items-end gap-1.5 h-16">
                          {[35, 50, 42, 65, 58, 78, 95].map((h, i) => (
                            <div
                              key={i}
                              className="flex-1 rounded-t bg-gradient-to-t from-primary/60 to-primary"
                              style={{ height: `${h}%` }}
                            />
                          ))}
                        </div>
                      </div>
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

function ChatBubble({
  text,
  fromMe,
  delay,
}: {
  text: string;
  fromMe?: boolean;
  delay?: string;
}) {
  return (
    <div
      className={`flex ${fromMe ? 'justify-end' : 'justify-start'} animate-fade-in`}
      style={{ animationDelay: delay, opacity: 0 }}
    >
      <div
        className={`max-w-[85%] px-3 py-2 rounded-2xl text-xs leading-relaxed ${
          fromMe
            ? 'bg-primary text-primary-foreground rounded-br-sm'
            : 'bg-zinc-100 border border-zinc-200 text-zinc-900 rounded-bl-sm'
        }`}
      >
        {text}
      </div>
    </div>
  );
}
