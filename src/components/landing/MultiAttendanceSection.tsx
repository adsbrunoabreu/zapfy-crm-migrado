import { Users, Inbox, Ticket, ArrowRight, MessageCircle, CheckCircle2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

const team = [
  { name: 'Lucas', role: 'Vendas', online: true, active: 4, color: 'from-emerald-400 to-emerald-600', initials: 'LU' },
  { name: 'Júlia', role: 'Vendas', online: true, active: 3, color: 'from-primary to-primary', initials: 'JU' },
  { name: 'Pedro', role: 'Suporte', online: true, active: 6, color: 'from-primary to-primary', initials: 'PE' },
  { name: 'Ana', role: 'Suporte', online: false, active: 0, color: 'from-amber-400 to-amber-600', initials: 'AN' },
];

const conversations = [
  {
    name: 'Mariana A.',
    last: 'Posso fechar essa proposta hoje?',
    agent: 'Lucas',
    agentColor: 'from-emerald-400 to-emerald-600',
    queue: 'Vendas',
    queueColor: 'bg-emerald-100 text-emerald-700 border-emerald-200',
    unread: 2,
    time: 'agora',
  },
  {
    name: 'Rafael M.',
    last: 'Tô com erro no app, pode ajudar?',
    agent: 'Pedro',
    agentColor: 'from-primary to-primary',
    queue: 'Suporte',
    queueColor: 'bg-primary/10 text-primary border-primary/30',
    unread: 1,
    time: '2min',
  },
  {
    name: 'Camila R.',
    last: 'Quero saber mais sobre o plano Pro',
    agent: 'Júlia',
    agentColor: 'from-primary to-primary',
    queue: 'Vendas',
    queueColor: 'bg-emerald-100 text-emerald-700 border-emerald-200',
    unread: 0,
    time: '5min',
  },
  {
    name: 'Bruno T.',
    last: 'Obrigado, resolveu! 🙌',
    agent: '—',
    agentColor: 'from-zinc-300 to-zinc-400',
    queue: 'Aguardando',
    queueColor: 'bg-amber-100 text-amber-700 border-amber-200',
    unread: 0,
    time: '8min',
  },
];

const benefits = [
  {
    icon: Users,
    title: 'Várias equipes, um número só',
    desc: 'Vendas, suporte, financeiro — cada fila com seus atendentes, sem trocar de WhatsApp.',
  },
  {
    icon: Inbox,
    title: 'Distribuição automática',
    desc: 'Round-robin entre quem está online. Lead novo cai pra quem pode atender agora.',
  },
  {
    icon: Ticket,
    title: 'Tickets com SLA e histórico',
    desc: 'Cada conversa vira ticket, com responsável, prioridade e tudo registrado no CRM.',
  },
  {
    icon: ArrowRight,
    title: 'Transferência sem fricção',
    desc: 'Passa de atendente ou de fila com 1 clique e o histórico vai junto.',
  },
];

export function MultiAttendanceSection() {
  return (
    <section
      id="multiatendimento"
      className="py-20 md:py-28 relative overflow-hidden border-y border-border/40 bg-secondary/20"
    >
      <div className="absolute inset-0 -z-10">
        <div className="absolute top-1/4 left-1/3 w-[500px] h-[500px] bg-emerald-500/5 blur-[140px] rounded-full" />
        <div className="absolute bottom-1/4 right-1/4 w-[400px] h-[400px] bg-primary/10 blur-[120px] rounded-full" />
      </div>

      <div className="max-w-7xl mx-auto px-6">
        <div className="text-center max-w-2xl mx-auto mb-14">
          <Badge variant="brand" size="md" className="mb-4">
            <Users className="w-3.5 h-3.5" />
            Multiatendimento de verdade
          </Badge>
          <h2 className="font-display text-3xl md:text-5xl font-bold tracking-tight">
            Várias pessoas atendendo,{' '}
            <span className="bg-gradient-to-r from-blue-400 to-blue-600 bg-clip-text text-transparent">
              zero confusão.
            </span>
          </h2>
          <p className="text-muted-foreground text-lg mt-4">
            Sua equipe inteira no mesmo número de WhatsApp, com fila, ticket e histórico organizados pelo CRM.
            Ninguém pisa no pé de ninguém.
          </p>
        </div>

        <div className="grid lg:grid-cols-12 gap-5 max-w-6xl mx-auto">
          {/* Coluna: Equipe online */}
          <div className="lg:col-span-3">
            <div className="rounded-2xl border border-border/60 bg-card/60 backdrop-blur-sm p-2 shadow-[0_0_60px_-20px_hsl(var(--primary)/0.3)] h-full">
              <div className="rounded-xl bg-white border border-zinc-200 overflow-hidden h-full text-zinc-900">
                <div className="px-4 py-3 border-b border-zinc-200 flex items-center justify-between bg-zinc-50">
                  <div className="text-xs font-semibold flex items-center gap-2 text-zinc-900">
                    <Users className="w-3.5 h-3.5 text-primary" />
                    Equipe
                  </div>
                  <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-emerald-100 text-emerald-700 border border-emerald-200 font-medium">
                    3 online
                  </span>
                </div>
                <div className="p-3 space-y-2">
                  {team.map((m) => (
                    <div
                      key={m.name}
                      className="flex items-center gap-2.5 p-2 rounded-lg hover:bg-zinc-50 transition-colors"
                    >
                      <div className="relative shrink-0">
                        <div
                          className={`w-9 h-9 rounded-full bg-gradient-to-br ${m.color} flex items-center justify-center text-[11px] font-bold text-white`}
                        >
                          {m.initials}
                        </div>
                        <div
                          className={`absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2 border-white ${
                            m.online ? 'bg-emerald-500' : 'bg-zinc-400'
                          }`}
                        />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-xs font-semibold truncate text-zinc-900">{m.name}</div>
                        <div className="text-[10px] text-zinc-500 truncate">{m.role}</div>
                      </div>
                      <div className="text-[10px] text-zinc-500 shrink-0">
                        {m.online ? `${m.active} ativos` : 'off'}
                      </div>
                    </div>
                  ))}
                </div>
                <div className="border-t border-zinc-200 p-3 bg-zinc-50">
                  <div className="text-[10px] text-zinc-500 uppercase tracking-wider mb-1.5 font-semibold">
                    Filas
                  </div>
                  <div className="space-y-1.5">
                    {[
                      { l: 'Vendas', n: 7, c: 'text-emerald-600' },
                      { l: 'Suporte', n: 6, c: 'text-primary' },
                      { l: 'Aguardando', n: 2, c: 'text-amber-600' },
                    ].map((q) => (
                      <div key={q.l} className="flex items-center justify-between text-xs">
                        <span className={`${q.c} font-medium`}>{q.l}</span>
                        <span className="text-zinc-500">{q.n}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Coluna: Inbox compartilhada */}
          <div className="lg:col-span-6">
            <div className="rounded-2xl border border-border/60 bg-card/60 backdrop-blur-sm p-2 shadow-[0_0_80px_-20px_hsl(var(--primary)/0.4)] h-full">
              <div className="rounded-xl bg-white border border-zinc-200 overflow-hidden h-full text-zinc-900">
                <div className="px-4 py-3 border-b border-zinc-200 flex items-center justify-between bg-zinc-50">
                  <div className="text-xs font-semibold flex items-center gap-2 text-zinc-900">
                    <MessageCircle className="w-3.5 h-3.5 text-emerald-600" />
                    Inbox compartilhada · +55 11 4002-8922
                  </div>
                  <span className="text-[10px] text-zinc-500">4 conversas</span>
                </div>
                <div className="divide-y divide-zinc-200">
                  {conversations.map((c, i) => (
                    <div
                      key={i}
                      className="flex items-center gap-3 px-4 py-3 hover:bg-zinc-50 transition-colors"
                    >
                      <div className="w-9 h-9 rounded-full bg-gradient-to-br from-zinc-200 to-zinc-300 flex items-center justify-center text-[11px] font-bold text-zinc-700 shrink-0">
                        {c.name.split(' ').map((p) => p[0]).join('')}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-semibold truncate text-zinc-900">{c.name}</span>
                          <span
                            className={`text-[9px] px-1.5 py-0.5 rounded-full border font-medium ${c.queueColor}`}
                          >
                            {c.queue}
                          </span>
                        </div>
                        <div className="text-xs text-zinc-600 truncate mt-0.5">{c.last}</div>
                      </div>
                      <div className="flex flex-col items-end gap-1 shrink-0">
                        <div className="text-[10px] text-zinc-500">{c.time}</div>
                        <div className="flex items-center gap-1.5">
                          {c.agent !== '—' ? (
                            <div
                              className={`w-5 h-5 rounded-full bg-gradient-to-br ${c.agentColor} flex items-center justify-center text-[8px] font-bold text-white border-2 border-white`}
                              title={c.agent}
                            >
                              {c.agent[0]}
                            </div>
                          ) : (
                            <span className="text-[9px] text-zinc-500 italic">não atribuído</span>
                          )}
                          {c.unread > 0 && (
                            <span className="min-w-[16px] h-[16px] rounded-full bg-emerald-500 text-[9px] font-bold text-white flex items-center justify-center px-1">
                              {c.unread}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Coluna: Ticket aberto */}
          <div className="lg:col-span-3">
            <div className="rounded-2xl border border-border/60 bg-card/60 backdrop-blur-sm p-2 shadow-[0_0_60px_-20px_hsl(var(--primary)/0.3)] h-full">
              <div className="rounded-xl bg-white border border-zinc-200 overflow-hidden h-full text-zinc-900">
                <div className="px-4 py-3 border-b border-zinc-200 flex items-center justify-between bg-zinc-50">
                  <div className="text-xs font-semibold flex items-center gap-2 text-zinc-900">
                    <Ticket className="w-3.5 h-3.5 text-primary" />
                    Ticket #4287
                  </div>
                  <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-emerald-100 text-emerald-700 border border-emerald-200 font-medium">
                    Aberto
                  </span>
                </div>
                <div className="p-3 space-y-2.5 text-xs">
                  <div>
                    <div className="text-[10px] text-zinc-500 uppercase tracking-wider font-semibold">
                      Cliente
                    </div>
                    <div className="font-semibold mt-0.5 text-zinc-900">Mariana Albuquerque</div>
                  </div>
                  <div>
                    <div className="text-[10px] text-zinc-500 uppercase tracking-wider font-semibold">
                      Responsável
                    </div>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      <div className="w-5 h-5 rounded-full bg-gradient-to-br from-emerald-400 to-emerald-600 flex items-center justify-center text-[9px] font-bold text-white">
                        LU
                      </div>
                      <span className="font-semibold text-zinc-900">Lucas — Vendas</span>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <div className="text-[10px] text-zinc-500 uppercase tracking-wider font-semibold">
                        Pipeline
                      </div>
                      <div className="font-medium mt-0.5 text-zinc-900">Proposta</div>
                    </div>
                    <div>
                      <div className="text-[10px] text-zinc-500 uppercase tracking-wider font-semibold">
                        SLA
                      </div>
                      <div className="font-medium mt-0.5 text-emerald-600">No prazo</div>
                    </div>
                  </div>
                  <div>
                    <div className="text-[10px] text-zinc-500 uppercase tracking-wider mb-1 font-semibold">
                      Tags
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {['Quente', 'Indicação', 'Plano Pro'].map((t) => (
                        <span
                          key={t}
                          className="text-[9px] px-1.5 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/30 font-medium"
                        >
                          {t}
                        </span>
                      ))}
                    </div>
                  </div>
                  <div className="pt-2 border-t border-zinc-200">
                    <div className="text-[10px] text-zinc-500 uppercase tracking-wider mb-1.5 font-semibold">
                      Histórico
                    </div>
                    <div className="space-y-1.5">
                      {[
                        { t: 'Lead criado via site', d: 'há 18min' },
                        { t: 'Atribuído a Lucas (round-robin)', d: 'há 18min' },
                        { t: 'Movido pra Proposta', d: 'há 4min' },
                      ].map((h, i) => (
                        <div key={i} className="flex items-start gap-1.5 text-[11px]">
                          <CheckCircle2 className="w-3 h-3 text-emerald-600 mt-0.5 shrink-0" />
                          <div className="flex-1 min-w-0">
                            <div className="text-zinc-800 truncate">{h.t}</div>
                            <div className="text-[9px] text-zinc-500">{h.d}</div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Benefits */}
        <div className="mt-12 grid sm:grid-cols-2 lg:grid-cols-4 gap-3 max-w-6xl mx-auto">
          {benefits.map((b) => {
            const Icon = b.icon;
            return (
              <div
                key={b.title}
                className="rounded-xl border border-border/60 bg-card/40 p-5 hover:border-emerald-500/40 hover:bg-card/70 transition-all"
              >
                <div className="w-10 h-10 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center mb-3">
                  <Icon className="w-5 h-5 text-emerald-400" />
                </div>
                <div className="font-semibold text-sm">{b.title}</div>
                <div className="text-xs text-muted-foreground mt-1.5 leading-relaxed">{b.desc}</div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
