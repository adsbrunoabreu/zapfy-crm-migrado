import { LegalLayout } from '@/components/legal/LegalLayout';

export default function TermsOfUse() {
  return (
    <LegalLayout
      title="Termos de Uso e Política Antifraude"
      description="Termos de uso e política antifraude da plataforma Zapfy — CRM no WhatsApp."
      otherLink={{ to: '/privacidade', label: 'Ler Política de Privacidade' }}
    >
      <h2>I. Atividades e Conteúdos Proibidos</h2>
      <p>
        O Zapfy é uma ferramenta de produtividade e gestão. É terminantemente proibido o uso da plataforma para:
      </p>
      <ul>
        <li>
          Envio de SPAM (mensagens não solicitadas) ou qualquer conteúdo que viole as políticas de comércio e
          mensagens da Meta (WhatsApp).
        </li>
        <li>Divulgação de conteúdos ilegais, fraudulentos, odiosos ou que infrinjam direitos autorais.</li>
        <li>O uso de listas de contatos compradas ou obtidas sem o consentimento explícito dos destinatários.</li>
      </ul>

      <h2>II. Monitoramento e Bloqueio Imediato</h2>
      <p>
        Reservamo-nos o direito de monitorar padrões de envio para garantir a estabilidade dos nossos servidores.
        Caso seja detectado uso abusivo que coloque em risco a reputação de nossos IPs ou a integridade do sistema,
        a conta será suspensa imediatamente, <strong>sem direito a reembolso</strong> dos valores pagos.
      </p>

      <h2>III. Responsabilidade e Banimentos</h2>
      <p>
        O usuário declara estar ciente de que o WhatsApp é uma plataforma de terceiros (Meta). O Zapfy não possui
        influência sobre as decisões de banimento da Meta.
      </p>
      <ul>
        <li>A responsabilidade pelo aquecimento de chips e pelo comportamento de envio é exclusiva do usuário.</li>
        <li>
          O Zapfy não se responsabiliza por perdas financeiras, perda de números ou interrupção de negócios
          decorrentes de banimentos aplicados pelo WhatsApp.
        </li>
      </ul>

      <h2>IV. Estabilidade e Dependências de Terceiros</h2>
      <p>
        Por se tratar de uma solução que depende de APIs e serviços de terceiros (WhatsApp/Meta, Cloud Providers),
        o Zapfy não garante disponibilidade de 100% em caso de atualizações globais ou mudanças nas diretrizes
        das plataformas externas.
      </p>

      <h2>V. Foro</h2>
      <p>
        Para dirimir quaisquer questões decorrentes deste termo, fica eleito o Foro da Comarca de Contagem/MG.
      </p>
    </LegalLayout>
  );
}
