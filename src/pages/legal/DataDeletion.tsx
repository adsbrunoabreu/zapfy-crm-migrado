import { LegalLayout } from '@/components/legal/LegalLayout';

export default function DataDeletion() {
  return (
    <LegalLayout
      title="Instruções para Exclusão de Dados"
      description="Como solicitar a exclusão dos seus dados pessoais e dados de aplicativos conectados (Meta/Facebook/Instagram/WhatsApp) na plataforma Zapfy."
      otherLink={{ to: '/privacidade', label: 'Ler Política de Privacidade' }}
    >
      <p>
        A Zapfy respeita o seu direito, garantido pela <strong>LGPD</strong> (Lei nº 13.709/2018) e pelas
        políticas da plataforma Meta, de solicitar a exclusão definitiva dos seus dados pessoais e de quaisquer
        dados obtidos através de integrações com Facebook, Instagram ou WhatsApp Business.
      </p>

      <h2>1. Quais dados podem ser excluídos</h2>
      <ul>
        <li>Dados de cadastro (nome, e-mail, telefone, CPF/CNPJ).</li>
        <li>Dados de uso (logs de acesso, métricas, preferências).</li>
        <li>Conteúdo importado via integrações Meta — contatos, conversas e mensagens do WhatsApp Business
          (modos Cloud API e Coexistência), histórico sincronizado e tokens de acesso.</li>
        <li>Dados de leads, pipelines, agendamentos e demais informações cadastradas no CRM.</li>
      </ul>

      <h2>2. Como solicitar a exclusão</h2>
      <p>Você pode solicitar a exclusão de duas formas:</p>

      <h3>Opção A — Pelo painel (recomendado para clientes ativos)</h3>
      <ul>
        <li>Acesse <strong>Configurações → Conta</strong> no painel da Zapfy.</li>
        <li>Para desconectar uma integração Meta específica, acesse{' '}
          <strong>Conexões → WhatsApp Cloud</strong> e clique em <em>Desconectar</em>. Os tokens são
          revogados imediatamente e o histórico vinculado entra na fila de exclusão.</li>
        <li>Para excluir a conta inteira, clique em <em>Excluir minha conta</em> ou solicite por e-mail
          conforme a Opção B.</li>
      </ul>

      <h3>Opção B — Por e-mail</h3>
      <p>Envie uma mensagem para{' '}
        <a href="mailto:suporte@zapfy.com.br?subject=Solicita%C3%A7%C3%A3o%20de%20exclus%C3%A3o%20de%20dados">
          suporte@zapfy.com.br
        </a>{' '}
        com o assunto <strong>“Solicitação de exclusão de dados”</strong> contendo:
      </p>
      <ul>
        <li>Nome completo e e-mail cadastrado na conta.</li>
        <li>(Opcional) Identificador da integração Meta — Business Account ID, número do WhatsApp ou
          User ID do Facebook/Instagram que originou a conexão.</li>
        <li>Se a solicitação se refere à <strong>conta inteira</strong> ou apenas a uma{' '}
          <strong>integração específica</strong>.</li>
      </ul>

      <h2>3. Prazo de processamento</h2>
      <ul>
        <li>Confirmação de recebimento: <strong>até 2 dias úteis</strong>.</li>
        <li>Exclusão efetiva dos dados: <strong>até 15 dias corridos</strong> a partir da confirmação,
          conforme art. 18 da LGPD.</li>
        <li>Backups criptografados podem reter os dados por até <strong>30 dias adicionais</strong> antes da
          rotação completa, sem qualquer acesso operacional.</li>
        <li>Tokens de acesso Meta são <strong>revogados imediatamente</strong> ao recebermos a solicitação.</li>
      </ul>

      <h2>4. Dados que podem ser retidos</h2>
      <p>
        Por obrigação legal ou regulatória, podemos reter por períodos definidos em lei:
      </p>
      <ul>
        <li>Registros fiscais e de faturamento (mínimo 5 anos — Código Tributário Nacional).</li>
        <li>Logs de acesso para fins de segurança (6 meses — Marco Civil da Internet, art. 15).</li>
        <li>Dados necessários ao cumprimento de decisão judicial.</li>
      </ul>

      <h2>5. Dados de terceiros (clientes do CRM)</h2>
      <p>
        Quando você é o <strong>Controlador</strong> dos dados (ex.: contatos importados para o CRM), a
        exclusão de registros individuais deve ser feita por você diretamente no painel. A Zapfy atua como
        <strong> Operadora</strong> e executa essas exclusões sob seu comando.
      </p>

      <h2>6. Confirmação</h2>
      <p>
        Após a conclusão, enviaremos uma confirmação por e-mail com o resumo do que foi excluído e a data
        efetiva da operação. Em caso de dúvidas, fale conosco em{' '}
        <a href="mailto:suporte@zapfy.com.br">suporte@zapfy.com.br</a>.
      </p>
    </LegalLayout>
  );
}
