import { MessageCircle, CreditCard, Mail, Facebook, Chrome, Webhook, Cloud, Smartphone } from 'lucide-react';

const integrations = [
  { name: 'WhatsApp', icon: MessageCircle, color: 'text-emerald-400' },
  { name: 'Evolution API', icon: Smartphone, color: 'text-emerald-300' },
  { name: 'WhatsApp Cloud API', icon: Cloud, color: 'text-primary' },
  { name: 'Asaas (Pix)', icon: CreditCard, color: 'text-primary' },
  { name: 'Resend', icon: Mail, color: 'text-foreground' },
  { name: 'Meta Ads', icon: Facebook, color: 'text-blue-400' },
  { name: 'Google Ads', icon: Chrome, color: 'text-amber-400' },
  { name: 'Webhooks', icon: Webhook, color: 'text-primary' },
];

export function IntegrationsGrid() {
  return (
    <section className="py-16 md:py-20">
      <div className="max-w-7xl mx-auto px-6">
        <div className="text-center max-w-2xl mx-auto mb-10">
          <span className="text-sm font-semibold text-primary uppercase tracking-wider">
            Integrações
          </span>
          <h2 className="font-display text-2xl md:text-4xl font-bold mt-3 tracking-tight">
            Conecta no que você já usa.
          </h2>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 max-w-4xl mx-auto">
          {integrations.map((int) => {
            const Icon = int.icon;
            return (
              <div
                key={int.name}
                className="group relative rounded-xl border border-border/60 bg-card/40 p-5 flex flex-col items-center gap-3 hover:border-primary/40 hover:bg-card/70 transition-all hover:-translate-y-1"
              >
                <div className="absolute inset-0 rounded-xl bg-gradient-to-br from-primary/0 to-primary/0 group-hover:from-primary/5 group-hover:to-primary/5 transition-all" />
                <Icon className={`w-7 h-7 ${int.color} relative z-10`} />
                <div className="text-xs font-medium relative z-10">{int.name}</div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
