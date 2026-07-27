import { useState } from 'react';
import { Bot, Zap, LayoutGrid, Check, Clock } from 'lucide-react';

type Pillar = 'crm' | 'automation' | 'ai';

const pillars = {
  crm: {
    label: 'CRM',
    icon: LayoutGrid,
    title: 'Pipeline visual, decisão clara',
    description:
      'Kanban arrastável, ficha completa do lead, tickets, tags e relatórios. Sua operação inteira numa tela.',
    bullets: [
      'Pipelines ilimitados e personalizáveis',
      'Distribuição round-robin automática',
      'Histórico completo de conversas e tickets',
      'Dashboards por vendedor, equipe e empresa',
    ],
    badge: null,
  },
  automation: {
    label: 'Automações',
    icon: Zap,
    title: 'Fluxos que trabalham 24/7',
    description:
      'Sequências, templates e gatilhos que disparam mensagem certa, na hora certa, pro lead certo. Sem ninguém apertar play.',
    bullets: [
      'Templates HSM aprovados pela Meta',
      'Sequências de follow-up com cancelamento automático',
      'Gatilhos por tag, status, tempo ou comportamento',
      'Mensagem fora do expediente, boas-vindas, NPS',
    ],
    badge: null,
  },
  ai: {
    label: 'IA',
    icon: Bot,
    title: 'Agente de IA — em desenvolvimento',
    description:
      'Add-on opcional contratado à parte. Quando lançado, fará qualificação automática de leads e handoff humano sem fricção. Quem entrar agora terá prioridade no acesso.',
    bullets: [
      'Qualificação automática e marcação de tags',
      'Handoff humano em 1 clique',
      'Pausa global por conversa ou empresa',
      'Treinamento próprio com FAQs e tom de voz',
    ],
    badge: 'Em breve',
  },
} as const;

export function PillarsSection() {
  const [active, setActive] = useState<Pillar>('crm');
  const data = pillars[active];
  const Icon = data.icon;

  return (
    <section id="pillars" className="py-20 md:py-28 bg-secondary/20 border-y border-border/40">
      <div className="max-w-7xl mx-auto px-6">
        <div className="text-center max-w-2xl mx-auto mb-12">
          <span className="text-sm font-semibold text-primary uppercase tracking-wider">
            Os 3 pilares
          </span>
          <h2 className="font-display text-3xl md:text-5xl font-bold mt-3 tracking-tight">
            Tudo que sua operação precisa.{' '}
            <span className="bg-gradient-to-r from-primary to-primary bg-clip-text text-transparent">
              Num único lugar.
            </span>
          </h2>
        </div>

        {/* Tabs */}
        <div className="flex justify-center mb-10">
          <div className="inline-flex p-1 rounded-full bg-card border border-border/60">
            {(Object.keys(pillars) as Pillar[]).map((key) => {
              const P = pillars[key];
              const Pi = P.icon;
              const isActive = active === key;
              return (
                <button
                  key={key}
                  onClick={() => setActive(key)}
                  className={`px-5 py-2 rounded-full text-sm font-medium transition-all flex items-center gap-2 ${
                    isActive
                      ? 'bg-primary text-primary-foreground shadow-[0_0_30px_-5px_hsl(var(--primary)/0.7)]'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  <Pi className="w-4 h-4" />
                  {P.label}
                  {P.badge && (
                    <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-semibold ${
                      isActive
                        ? 'bg-primary-foreground/20 text-primary-foreground'
                        : 'bg-amber-500/15 text-amber-400 border border-amber-500/20'
                    }`}>
                      {P.badge}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        <div className="grid lg:grid-cols-2 gap-8 items-center max-w-6xl mx-auto">
          {/* Texto */}
          <div key={active} className="animate-fade-in">
            <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-primary/10 border border-primary/20 mb-5">
              <Icon className="w-7 h-7 text-primary" />
            </div>
            <h3 className="font-display text-2xl md:text-4xl font-bold tracking-tight">
              {data.title}
            </h3>
            <p className="text-muted-foreground text-base md:text-lg mt-4 leading-relaxed">
              {data.description}
            </p>
            <ul className="mt-6 space-y-3">
              {data.bullets.map((b) => (
                <li key={b} className="flex items-start gap-3 text-sm md:text-base">
                  <Check className="w-5 h-5 text-primary mt-0.5 shrink-0" />
                  <span className="text-foreground/95">{b}</span>
                </li>
              ))}
            </ul>
          </div>

          {/* Mockup por pilar */}
          <div key={`mock-${active}`} className="animate-fade-in">
            <div className="relative rounded-2xl border border-border/60 bg-card/60 backdrop-blur-sm p-2 shadow-[0_0_80px_-20px_hsl(var(--primary)/0.4)]">
              <div className="rounded-xl bg-white border border-zinc-200 overflow-hidden min-h-[380px] text-zinc-900">
                {active === 'ai' && <AIMockup />}
                {active === 'automation' && <AutomationMockup />}
                {active === 'crm' && <CRMMockup />}
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function AIMockup() {
  return (
    <div className="p-4 space-y-2.5">
      <div className="flex items-center gap-2 pb-2 border-b border-zinc-200">
        <div className="w-8 h-8 rounded-full bg-emerald-100 flex items-center justify-center">
          <Bot className="w-4 h-4 text-emerald-600" />
        </div>
        <div className="text-xs">
          <div className="font-semibold text-zinc-900">Maria — Lead novo</div>
          <div className="text-[10px] text-zinc-500">Origem: Site · Pipeline Vendas</div>
        </div>
        <div className="ml-auto text-[10px] px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 border border-emerald-200 font-medium">
          Qualificado
        </div>
      </div>
      <div className="flex justify-start">
        <div className="max-w-[80%] px-3 py-2 rounded-2xl rounded-bl-sm text-xs bg-zinc-100 border border-zinc-200 text-zinc-900">
          Oi, vocês atendem na minha região?
        </div>
      </div>
      <div className="flex justify-end">
        <div className="max-w-[80%] px-3 py-2 rounded-2xl rounded-br-sm text-xs bg-primary text-primary-foreground">
          Olá! 👋 Atendemos sim. Pode me passar o seu CEP?
        </div>
      </div>
      <div className="flex justify-start">
        <div className="max-w-[80%] px-3 py-2 rounded-2xl rounded-bl-sm text-xs bg-zinc-100 border border-zinc-200 text-zinc-900">
          04578-000
        </div>
      </div>
      <div className="flex justify-end">
        <div className="max-w-[80%] px-3 py-2 rounded-2xl rounded-br-sm text-xs bg-primary text-primary-foreground">
          Perfeito ✅ Vou conectar você com um especialista agora.
        </div>
      </div>
      <div className="mt-3 p-2.5 rounded-lg bg-primary/10 border border-primary/30 text-[11px] flex items-start gap-2">
        <Bot className="w-3.5 h-3.5 text-primary mt-0.5" />
        <div>
          <div className="font-semibold text-primary">IA detectou intenção de compra</div>
          <div className="text-zinc-600">Tag "quente" aplicada · vendedor notificado</div>
        </div>
      </div>
    </div>
  );
}

function AutomationMockup() {
  return (
    <div className="p-5 space-y-4">
      <div className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">
        Sequência: Boas-vindas VIP
      </div>
      {[
        { t: 'Gatilho', d: 'Lead com tag "VIP" criado', c: 'border-primary/40 bg-primary/5', dot: 'bg-primary' },
        { t: 'Espera', d: '30 segundos', c: 'border-amber-300 bg-amber-50', dot: 'bg-amber-500' },
        { t: 'Mensagem', d: 'Olá, {{nome}}! Bem-vindo 👋', c: 'border-primary/40 bg-primary/5', dot: 'bg-primary' },
        { t: 'Espera', d: '1 dia', c: 'border-amber-300 bg-amber-50', dot: 'bg-amber-500' },
        { t: 'Mensagem', d: 'Posso agendar uma call rápida?', c: 'border-primary/40 bg-primary/5', dot: 'bg-primary' },
        { t: 'Resultado', d: 'Reunião marcada · auto-cancelar', c: 'border-emerald-300 bg-emerald-50', dot: 'bg-emerald-500' },
      ].map((step, i, arr) => (
        <div key={i} className="relative flex items-start gap-3">
          <div className="flex flex-col items-center">
            <div className={`w-3 h-3 rounded-full ${step.dot}`} />
            {i < arr.length - 1 && (
              <div className="w-px flex-1 min-h-[20px] bg-zinc-200" />
            )}
          </div>
          <div className={`flex-1 px-3 py-2 rounded-lg border ${step.c}`}>
            <div className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
              {step.t}
            </div>
            <div className="text-xs mt-0.5 text-zinc-900 font-medium">{step.d}</div>
          </div>
        </div>
      ))}
    </div>
  );
}

function CRMMockup() {
  const cols = [
    { name: 'Novo', n: 12, c: 'border-primary/30 bg-primary/5' },
    { name: 'Contato', n: 8, c: 'border-amber-300 bg-amber-50' },
    { name: 'Proposta', n: 5, c: 'border-primary/30 bg-primary/5' },
    { name: 'Ganho', n: 3, c: 'border-emerald-300 bg-emerald-50' },
  ];
  return (
    <div className="p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="text-xs font-semibold text-zinc-900">Pipeline · Vendas Outbound</div>
        <div className="text-[10px] text-zinc-500">28 leads</div>
      </div>
      <div className="grid grid-cols-4 gap-2">
        {cols.map((col) => (
          <div key={col.name} className={`rounded-lg border ${col.c} p-2`}>
            <div className="text-[10px] font-semibold mb-2 flex items-center justify-between text-zinc-700">
              <span>{col.name}</span>
              <span className="text-zinc-500">{col.n}</span>
            </div>
            <div className="space-y-1.5">
              {Array.from({ length: 3 }).map((_, i) => (
                <div
                  key={i}
                  className="rounded-md bg-white border border-zinc-200 p-2 space-y-1 shadow-sm"
                  style={{ opacity: 1 - i * 0.2 }}
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
      <div className="mt-3 grid grid-cols-3 gap-2">
        {[
          { l: 'Ticket médio', v: 'R$ 1.240' },
          { l: 'Ciclo', v: '4 dias' },
          { l: 'Win rate', v: '32%' },
        ].map((kpi) => (
          <div key={kpi.l} className="rounded-lg border border-zinc-200 bg-zinc-50 p-2.5">
            <div className="text-[10px] text-zinc-500">{kpi.l}</div>
            <div className="text-sm font-bold mt-0.5 text-zinc-900">{kpi.v}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
