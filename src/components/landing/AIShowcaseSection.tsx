import { Bot, Brain, Hand, Pause, Sparkles, Clock } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

const capabilities = [
  {
    icon: Brain,
    title: 'Treinamento próprio',
    desc: 'Base de conhecimento com FAQs e tom de voz da empresa.',
  },
  {
    icon: Sparkles,
    title: 'Qualificação inteligente',
    desc: 'Detecta intenção, marca tags e notifica o atendente humano.',
  },
  {
    icon: Hand,
    title: 'Handoff humano',
    desc: 'Passa pra atendente real quando precisar — sem fricção.',
  },
  {
    icon: Pause,
    title: 'Pausa global',
    desc: 'Desligue a IA com 1 clique em qualquer conversa.',
  },
];

export function AIShowcaseSection() {
  return (
    <section id="ai-showcase" className="py-20 md:py-28 relative overflow-hidden">
      <div className="absolute inset-0 -z-10">
        <div className="absolute top-1/3 left-1/4 w-[500px] h-[500px] bg-blue-600/15 blur-[140px] rounded-full" />
        <div className="absolute bottom-1/4 right-1/4 w-[400px] h-[400px] bg-blue-500/10 blur-[120px] rounded-full" />
      </div>

      <div className="max-w-7xl mx-auto px-6">
        <div className="grid lg:grid-cols-2 gap-12 items-center">
          {/* Mockup do chat com IA */}
          <div className="relative order-2 lg:order-1">
            <div className="relative rounded-2xl border border-blue-600/30 bg-card/60 backdrop-blur-sm p-2 shadow-[0_0_100px_-20px_hsl(220_90%_55%/0.4)]">
              {/* Banner em desenvolvimento — sobre mockup branco */}
              <Badge variant="brand-on-light" size="xs" className="absolute top-4 right-4 z-10 font-semibold">
                <Clock className="w-3 h-3" />
                Em desenvolvimento
              </Badge>
              <div className="rounded-xl bg-white border border-zinc-200 overflow-hidden text-zinc-900">
                <div className="flex items-center gap-2.5 px-4 py-3 border-b border-zinc-200 bg-zinc-50">
                  <div className="relative">
                    <div className="w-9 h-9 rounded-full bg-gradient-to-br from-emerald-400 to-emerald-600 flex items-center justify-center">
                      <Bot className="w-5 h-5 text-white" />
                    </div>
                    <div className="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full bg-emerald-500 border-2 border-white animate-pulse" />
                  </div>
                  <div className="flex-1">
                    <div className="text-sm font-semibold text-zinc-900">Agente IA Zapfy</div>
                    <div className="text-[11px] text-emerald-600">prévia da experiência</div>
                  </div>
                  <Badge variant="brand-on-light" size="xs">Add-on</Badge>
                </div>

                <div className="p-4 space-y-3 min-h-[400px] bg-white">
                  {[
                    { me: false, t: 'Oi, vocês atendem em SP?', d: '0s' },
                    { me: true, t: 'Olá! 👋 Sim, atendemos toda região SP. Em que posso ajudar?', d: '0.4s' },
                    { me: false, t: 'Quero saber sobre o plano pra minha equipe', d: '0.8s' },
                    { me: true, t: 'Claro! Quantos atendentes vão usar o WhatsApp?', d: '1.2s' },
                    { me: false, t: 'Somos 8 pessoas', d: '1.6s' },
                    { me: true, t: 'Perfeito ✅ Vou conectar você com um especialista agora.', d: '2s' },
                  ].map((m, i) => (
                    <div
                      key={i}
                      className={`flex ${m.me ? 'justify-end' : 'justify-start'} animate-fade-in`}
                      style={{ animationDelay: m.d, opacity: 0 }}
                    >
                      <div
                        className={`max-w-[80%] px-3.5 py-2 rounded-2xl text-sm ${
                          m.me
                            ? 'bg-primary text-primary-foreground rounded-br-sm'
                            : 'bg-zinc-100 border border-zinc-200 text-zinc-900 rounded-bl-sm'
                        }`}
                      >
                        {m.t}
                      </div>
                    </div>
                  ))}
                </div>

                <div className="border-t border-zinc-200 p-3 bg-blue-50 flex items-start gap-2.5">
                  <div className="w-7 h-7 rounded-lg bg-blue-100 border border-blue-200 flex items-center justify-center shrink-0">
                    <Sparkles className="w-3.5 h-3.5 text-blue-600" />
                  </div>
                  <div className="text-[11px]">
                    <div className="font-semibold text-blue-700">Lead qualificado e transferido</div>
                    <div className="text-zinc-600">
                      Atendente humano notificado · histórico no CRM
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Texto + capabilities */}
          <div className="order-1 lg:order-2">
            <Badge variant="brand" size="md" className="mb-4">
              <Clock className="w-3.5 h-3.5" />
              Add-on em desenvolvimento · contratado à parte
            </Badge>
            <h2 className="font-display text-3xl md:text-5xl font-bold tracking-tight">
              Agente de IA{' '}
              <span className="bg-gradient-to-r from-blue-400 to-blue-600 bg-clip-text text-transparent">
                em breve.
              </span>
            </h2>
            <p className="text-muted-foreground text-lg mt-4 leading-relaxed">
              O Agente IA é um <strong className="text-foreground">módulo opcional</strong> que está em
              desenvolvimento. Quando lançado, será contratado separadamente do plano principal e poderá
              qualificar leads e fazer triagem antes de passar pro atendente humano.
            </p>
            <p className="text-sm text-muted-foreground mt-3">
              Por enquanto, o foco do Zapfy é <strong className="text-foreground">WhatsApp multi-atendimento
              + CRM integrado</strong>. Quem entrar agora terá prioridade no acesso ao Agente IA quando
              estiver disponível.
            </p>

            <div className="mt-8 grid sm:grid-cols-2 gap-3">
              {capabilities.map((c) => {
                const Icon = c.icon;
                return (
                  <div
                    key={c.title}
                    className="rounded-xl border border-border/60 bg-card/40 p-4 hover:border-blue-500/40 hover:bg-card/70 transition-all relative"
                  >
                    <Icon className="w-5 h-5 text-blue-400 mb-2.5" />
                    <div className="font-semibold text-sm flex items-center gap-2">
                      {c.title}
                      <Badge variant="brand" size="xs">Em breve</Badge>
                    </div>
                    <div className="text-xs text-muted-foreground mt-1 leading-relaxed">{c.desc}</div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
