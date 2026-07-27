import { useState } from 'react';
import { ChevronDown } from 'lucide-react';

const faqs = [
  {
    q: 'O Zapfy serve pra qualquer tipo de negócio?',
    a: 'Serve sim. O Zapfy é flexível e atende quem vende crédito, imóveis, serviços, infoprodutos, clínicas e qualquer empresa que use WhatsApp pra atender e fechar venda. Você customiza pipelines, tags e automações do jeito que faz sentido pra sua operação.',
  },
  {
    q: 'O Zapfy tem IA inclusa no plano?',
    a: 'Não. O foco atual do Zapfy é WhatsApp multi-atendimento com CRM integrado. O Agente de IA é um add-on que está em desenvolvimento e, quando lançado, será contratado separadamente do plano principal. Quem assina agora terá prioridade no acesso.',
  },
  {
    q: 'Preciso de um número de WhatsApp separado?',
    a: 'Sim, recomendamos um número dedicado para uso comercial. Você conecta via Evolution API e pode usar múltiplas instâncias para diferentes membros da equipe.',
  },
  {
    q: 'Como funciona a distribuição automática de leads?',
    a: 'O sistema distribui novos leads automaticamente entre os membros da equipe usando o método round-robin. Você escolhe quais usuários participam da distribuição.',
  },
  {
    q: 'Meus dados estão seguros?',
    a: 'Totalmente. Utilizamos isolamento completo entre empresas (multi-tenancy), políticas de segurança no banco de dados (RLS) e criptografia em trânsito. Nenhuma empresa acessa dados de outra.',
  },
  {
    q: 'Posso importar leads de outros sistemas?',
    a: 'Sim! Você pode importar leads em massa via arquivo CSV. Basta mapear as colunas e os leads são adicionados ao pipeline escolhido em segundos.',
  },
  {
    q: 'Qual o período de teste gratuito?',
    a: 'O plano Starter é gratuito para sempre com até 3 usuários. Para os planos pagos, oferecemos 1 dia de teste grátis sem necessidade de cartão de crédito.',
  },
  {
    q: 'Existe fidelidade ou multa por cancelamento?',
    a: 'Não. Você pode cancelar quando quiser, sem multas. Se optar pelo plano anual, o desconto é aplicado de forma proporcional.',
  },
];

export function FAQSection() {
  const [open, setOpen] = useState<number | null>(null);

  return (
    <section id="faq" className="py-20 md:py-28">
      <div className="max-w-3xl mx-auto px-6">
        <div className="text-center mb-16">
          <span className="text-sm font-semibold text-primary uppercase tracking-wider">FAQ</span>
          <h2 className="font-display text-3xl md:text-5xl font-bold mt-3">
            Perguntas frequentes
          </h2>
        </div>

        <div className="space-y-3">
          {faqs.map((faq, i) => (
            <div key={i} className="rounded-xl border border-border/50 bg-card overflow-hidden">
              <button
                onClick={() => setOpen(open === i ? null : i)}
                className="w-full flex items-center justify-between p-5 text-left"
              >
                <span className="font-medium pr-4">{faq.q}</span>
                <ChevronDown
                  className={`w-5 h-5 shrink-0 text-muted-foreground transition-transform duration-200 ${
                    open === i ? 'rotate-180' : ''
                  }`}
                />
              </button>
              <div
                className={`overflow-hidden transition-all duration-300 ${
                  open === i ? 'max-h-60 pb-5' : 'max-h-0'
                }`}
              >
                <p className="px-5 text-muted-foreground leading-relaxed">{faq.a}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
