import { LegalLayout } from '@/components/legal/LegalLayout';

export default function PrivacyPolicy() {
  return (
    <LegalLayout
      title="Política de Privacidade e Proteção de Dados"
      description="Política de privacidade e tratamento de dados pessoais (LGPD) da plataforma Zapfy."
      otherLink={{ to: '/termos', label: 'Ler Termos de Uso' }}
    >
      <h2>1. Papéis no Tratamento de Dados (LGPD)</h2>
      <p>Para fins da Lei Geral de Proteção de Dados:</p>
      <ul>
        <li>
          <strong>Você (Cliente):</strong> é o <strong>Controlador</strong> dos dados de seus contatos e clientes.
        </li>
        <li>
          <strong>Zapfy:</strong> é a <strong>Operadora</strong>, que fornece a infraestrutura técnica para o
          processamento dessas informações sob o seu comando.
        </li>
      </ul>

      <h2>2. Dados Coletados</h2>
      <ul>
        <li>
          <strong>Dados de Cadastro:</strong> nome, e-mail, telefone e informações de faturamento do assinante.
        </li>
        <li>
          <strong>Dados de Uso:</strong> endereço IP, logs de acesso e métricas de interação para segurança e
          melhoria do sistema.
        </li>
        <li>
          <strong>Dados de Terceiros:</strong> números de telefone e histórico de mensagens processadas através do
          CRM por comando do usuário.
        </li>
      </ul>

      <h2>3. Finalidade do Tratamento</h2>
      <p>Os dados são utilizados exclusivamente para:</p>
      <ul>
        <li>Prestação do serviço de CRM e automação de mensagens.</li>
        <li>Suporte técnico e prevenção a fraudes.</li>
        <li>Cumprimento de obrigações legais e fiscais.</li>
      </ul>

      <h2>4. Segurança e Armazenamento</h2>
      <p>O Zapfy utiliza práticas modernas de segurança, incluindo:</p>
      <ul>
        <li>Criptografia de dados em trânsito (SSL) e em repouso.</li>
        <li>
          Isolamento de banco de dados (Multi-tenancy), garantindo que seus dados nunca sejam acessados por outros
          usuários.
        </li>
        <li>Backups periódicos para garantir a resiliência das informações.</li>
      </ul>

      <h2>5. Direitos do Titular</h2>
      <p>
        A qualquer momento, o usuário pode solicitar a exportação ou a exclusão definitiva de seus dados de nossos
        servidores através do e-mail{' '}
        <a href="mailto:suporte@zapfy.com.br">suporte@zapfy.com.br</a>. A exclusão de dados de terceiros (seus
        clientes) deve ser gerida por você através das ferramentas de limpeza disponíveis no painel.
      </p>

      <h2>6. Transferência Internacional</h2>
      <p>
        Os dados podem ser armazenados em servidores de nuvem de alta disponibilidade localizados fora do Brasil
        (ex.: AWS, Google Cloud ou Supabase), seguindo padrões internacionais de proteção de dados.
      </p>
    </LegalLayout>
  );
}
