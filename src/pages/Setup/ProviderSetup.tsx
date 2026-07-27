/**
 * ProviderSetup — layout/wrapper compartilhado das telas de conexão de
 * provider de WhatsApp. Lê o parâmetro `:provider` da rota e renderiza
 * o formulário específico (Evolution, Cloud API ou Cloud API+Coexistência).
 *
 * Roteamento esperado:
 *   /setup/evolution               → EvolutionSetup
 *   /setup/cloud_api               → CloudAPISetup
 *   /setup/cloud_api_coexistence   → CloudCoexistenceSetup
 */
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Cloud, Server, Smartphone } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import EvolutionSetup from './EvolutionSetup';
import CloudAPISetup from './CloudAPISetup';
import CloudCoexistenceSetup from './CloudCoexistenceSetup';

type SetupKey = 'evolution' | 'cloud_api' | 'cloud_api_coexistence';

const META: Record<SetupKey, { title: string; description: string; icon: typeof Cloud }> = {
  evolution: {
    title: 'Conectar Evolution API',
    description: 'Conexão via QR Code, ideal para começar rápido.',
    icon: Server,
  },
  cloud_api: {
    title: 'Conectar WhatsApp Cloud API',
    description: 'Integração oficial com a Meta — alta confiabilidade.',
    icon: Cloud,
  },
  cloud_api_coexistence: {
    title: 'Coexistência — Cloud API + WhatsApp Business',
    description: 'Conecte o número que já está no app WhatsApp Business e sincronize contatos + histórico.',
    icon: Smartphone,
  },
};

export default function ProviderSetup() {
  const navigate = useNavigate();
  const { provider } = useParams<{ provider: string }>();
  const key = (provider ?? '') as SetupKey;

  const meta = META[key];

  if (!meta) {
    return (
      <div className="container mx-auto max-w-2xl space-y-4 py-10">
        <Button variant="ghost" size="sm" onClick={() => navigate('/chat')}>
          <ArrowLeft className="mr-2 h-4 w-4" /> Voltar
        </Button>
        <Card>
          <CardHeader>
            <CardTitle>Provider desconhecido</CardTitle>
            <CardDescription>
              Use <code>/setup/evolution</code>, <code>/setup/cloud_api</code> ou{' '}
              <code>/setup/cloud_api_coexistence</code>.
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  const Icon = meta.icon;

  return (
    <div className="container mx-auto max-w-2xl space-y-4 py-8">
      <Button variant="ghost" size="sm" onClick={() => navigate(-1)}>
        <ArrowLeft className="mr-2 h-4 w-4" /> Voltar
      </Button>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-md bg-muted">
              <Icon className="h-5 w-5 text-foreground" />
            </div>
            <div>
              <CardTitle>{meta.title}</CardTitle>
              <CardDescription>{meta.description}</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {key === 'evolution' && <EvolutionSetup />}
          {key === 'cloud_api' && <CloudAPISetup />}
          {key === 'cloud_api_coexistence' && <CloudCoexistenceSetup />}
        </CardContent>
      </Card>
    </div>
  );
}
