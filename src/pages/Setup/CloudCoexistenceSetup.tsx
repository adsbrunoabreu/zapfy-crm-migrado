/**
 * CloudCoexistenceSetup
 * ---------------------
 * Configuração da Cloud API em modo Coexistência (Embedded Signup +
 * sincronização de contatos e histórico do WhatsApp Business app).
 *
 * Fluxo:
 *  1. Carrega configuração do app Meta via edge `cloud-coexistence-config`
 *     (retorna appId, configId, graphVersion — são públicos por design).
 *  2. Carrega o SDK do Facebook e inicializa.
 *  3. Usuário informa o nome da conexão e clica em "Conectar".
 *  4. Abre Embedded Signup com `featureType=whatsapp_business_app_onboarding`.
 *  5. Captura `code`, `waba_id`, `phone_number_id` do session event.
 *  6. Envia para `cloud-coexistence-onboard` que finaliza onboarding +
 *     dispara sincronização de contatos e histórico (smb_app_data API).
 *  7. Acompanha progresso via realtime no `whatsapp_instances.coexistence_state`.
 */
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { z } from 'zod';
import { AlertTriangle, CheckCircle2, ExternalLink, Loader2, ShieldCheck, Smartphone } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

// Tipos do SDK do Facebook (subset).
declare global {
  interface Window {
    FB?: {
      init: (opts: { appId: string; cookie?: boolean; xfbml?: boolean; version: string }) => void;
      login: (
        cb: (response: {
          authResponse?: { code?: string };
          status?: string;
        }) => void,
        opts: Record<string, unknown>,
      ) => void;
    };
    fbAsyncInit?: () => void;
  }
}

interface SignupSession {
  code: string;
  wabaId: string;
  phoneNumberId: string;
}

const NameSchema = z.string().trim().min(2, 'Nome muito curto').max(80);

type Phase =
  | 'idle'
  | 'loading_sdk'
  | 'ready'
  | 'awaiting_user'
  | 'onboarding'
  | 'syncing_contacts'
  | 'syncing_history'
  | 'done'
  | 'error';

interface CoexistState {
  contacts_status?: 'pending' | 'completed' | 'failed';
  history_status?: 'pending' | 'completed' | 'failed' | 'declined';
  contacts_imported?: number;
  history_chunks_received?: number;
  history_chunks_processed?: number;
  last_sync_request_id?: string | null;
}

const FB_SDK_SRC_ID = 'cloud-coexistence-fb-sdk';

export default function CloudCoexistenceSetup() {
  const navigate = useNavigate();
  const { profile } = useAuth();

  const [phase, setPhase] = useState<Phase>('idle');
  const [config, setConfig] = useState<{ appId: string; configId: string; graphVersion: string } | null>(null);
  const [configError, setConfigError] = useState<string | null>(null);
  const [displayName, setDisplayName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [instanceId, setInstanceId] = useState<string | null>(null);
  const [state, setState] = useState<CoexistState>({});

  // 1) Carrega configuração do edge function (appId, configId, graphVersion)
  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const { data, error } = await supabase.functions.invoke('cloud-coexistence-config', {});
        if (!active) return;
        if (error) throw error;
        if (!data?.appId || !data?.configId) {
          setConfigError(
            'Coexistência não está configurada no servidor. Defina META_APP_ID e META_COEXISTENCE_CONFIG_ID em Cloud → Secrets.',
          );
          return;
        }
        setConfig({
          appId: String(data.appId),
          configId: String(data.configId),
          graphVersion: String(data.graphVersion ?? 'v22.0'),
        });
      } catch (e) {
        if (!active) return;
        const msg = (e as Error)?.message ?? 'Falha ao carregar configuração';
        setConfigError(msg);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  // 2) Carrega SDK do Facebook
  useEffect(() => {
    if (!config) return;
    setPhase('loading_sdk');

    if (window.FB) {
      window.FB.init({ appId: config.appId, xfbml: false, version: config.graphVersion });
      setPhase('ready');
      return;
    }

    window.fbAsyncInit = () => {
      window.FB?.init({ appId: config.appId, xfbml: false, version: config.graphVersion });
      setPhase('ready');
    };

    if (!document.getElementById(FB_SDK_SRC_ID)) {
      const s = document.createElement('script');
      s.id = FB_SDK_SRC_ID;
      s.async = true;
      s.defer = true;
      s.src = 'https://connect.facebook.net/en_US/sdk.js';
      s.onerror = () => {
        setPhase('error');
        setError('Falha ao carregar o SDK do Facebook. Cheque sua conexão e bloqueadores de anúncios.');
      };
      document.body.appendChild(s);
    }
  }, [config]);

  // 3) Listener para o session event do Embedded Signup
  useEffect(() => {
    function listener(event: MessageEvent) {
      if (typeof event.data !== 'string') return;
      let parsed: Record<string, unknown> | null = null;
      try {
        parsed = JSON.parse(event.data);
      } catch {
        return;
      }
      if (!parsed || parsed.type !== 'WA_EMBEDDED_SIGNUP') return;
      const data = (parsed.data ?? {}) as Record<string, unknown>;
      const evt = String(parsed.event ?? '');
      if (evt === 'CANCEL') {
        setPhase('ready');
        toast.info('Onboarding cancelado.');
      } else if (evt && evt !== 'FINISH_WHATSAPP_BUSINESS_APP_ONBOARDING' && evt !== 'FINISH') {
        // Eventos intermediários — apenas mantém estado.
      }
      // Guardamos waba_id (para conferência); o code real vem no callback do FB.login.
      if (data.waba_id) {
        (window as unknown as { __waba?: string }).__waba = String(data.waba_id);
      }
      if (data.phone_number_id) {
        (window as unknown as { __pnid?: string }).__pnid = String(data.phone_number_id);
      }
    }
    window.addEventListener('message', listener);
    return () => window.removeEventListener('message', listener);
  }, []);

  // 4) Realtime subscription para acompanhar o coexistence_state
  useEffect(() => {
    if (!instanceId) return;
    const channel = supabase
      .channel(`coex-${instanceId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'whatsapp_instances',
          filter: `id=eq.${instanceId}`,
        },
        (payload) => {
          const next = (payload.new as { coexistence_state?: CoexistState }).coexistence_state ?? {};
          setState(next);
          if (next.history_status === 'completed' || next.history_status === 'declined') {
            setPhase('done');
          } else if (next.contacts_status === 'completed') {
            setPhase('syncing_history');
          }
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [instanceId]);

  function handleConnect() {
    setError(null);
    const parsed = NameSchema.safeParse(displayName);
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Nome inválido');
      return;
    }
    if (!config || !window.FB) {
      setError('SDK do Facebook não está pronto.');
      return;
    }
    setPhase('awaiting_user');

    window.FB.login(
      (response) => {
        const code = response?.authResponse?.code;
        if (!code) {
          setPhase('ready');
          if (response?.status !== 'unknown') {
            toast.info('Login não concluído.');
          }
          return;
        }
        const wabaId = (window as unknown as { __waba?: string }).__waba ?? '';
        const phoneNumberId = (window as unknown as { __pnid?: string }).__pnid ?? '';
        if (!wabaId || !phoneNumberId) {
          setPhase('error');
          setError('Faltou waba_id ou phone_number_id no retorno do Embedded Signup.');
          return;
        }
        finishOnboarding({ code, wabaId, phoneNumberId });
      },
      {
        config_id: config.configId,
        response_type: 'code',
        override_default_response_type: true,
        extras: {
          setup: {},
          featureType: 'whatsapp_business_app_onboarding',
          sessionInfoVersion: '3',
        },
      },
    );
  }

  async function finishOnboarding(session: SignupSession) {
    if (!profile?.company_id) {
      setError('Empresa não identificada na sessão.');
      setPhase('error');
      return;
    }
    setPhase('onboarding');
    try {
      const { data, error } = await supabase.functions.invoke('cloud-coexistence-onboard', {
        body: {
          code: session.code,
          waba_id: session.wabaId,
          phone_number_id: session.phoneNumberId,
          display_name: displayName.trim(),
        },
      });
      if (error) throw error;
      if (!data?.instance_id) throw new Error('Resposta sem instance_id.');
      setInstanceId(String(data.instance_id));
      setPhase('syncing_contacts');
      toast.success('Conexão criada — sincronização iniciada.');
    } catch (e) {
      const msg = (e as Error)?.message ?? 'Falha ao concluir onboarding';
      setError(msg);
      setPhase('error');
      toast.error('Falha no onboarding', { description: msg });
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────

  if (configError) {
    return (
      <Alert variant="destructive">
        <AlertTriangle className="h-4 w-4" />
        <AlertTitle>Coexistência indisponível</AlertTitle>
        <AlertDescription>{configError}</AlertDescription>
      </Alert>
    );
  }

  if (phase === 'done') {
    return (
      <div className="space-y-4">
        <Alert>
          <CheckCircle2 className="h-4 w-4" />
          <AlertTitle>Pronto!</AlertTitle>
          <AlertDescription>
            Conexão em modo Coexistência ativa.{' '}
            {state.history_status === 'declined'
              ? 'O cliente optou por NÃO compartilhar o histórico, mas novas mensagens já são sincronizadas.'
              : `Importamos ${state.contacts_imported ?? 0} contatos e ${state.history_chunks_processed ?? 0} blocos de histórico.`}
          </AlertDescription>
        </Alert>
        <Button onClick={() => navigate('/settings?tab=connections')}>Ir para conexões</Button>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <Alert>
        <Smartphone className="h-4 w-4" />
        <AlertTitle>Como funciona a Coexistência</AlertTitle>
        <AlertDescription className="text-xs leading-relaxed">
          Você continua usando o app WhatsApp Business no celular normalmente. Conectamos o
          mesmo número à API oficial da Meta para que o CRM possa enviar e receber em escala,
          mantendo as duas pontas sincronizadas. Após o onboarding você terá <b>24 horas</b>{' '}
          para sincronizar contatos e histórico — o processo é automático.
        </AlertDescription>
      </Alert>

      <div className="space-y-1.5">
        <Label htmlFor="cx-name">Nome da conexão</Label>
        <Input
          id="cx-name"
          autoComplete="off"
          placeholder="Ex.: Atendimento principal"
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          disabled={phase === 'onboarding' || phase === 'syncing_contacts' || phase === 'syncing_history'}
        />
      </div>

      <div className="rounded-md border border-border bg-muted/40 p-3 text-xs text-muted-foreground space-y-1">
        <div className="font-medium text-foreground">Pré-requisitos no app WhatsApp Business</div>
        <ul className="list-disc pl-4 space-y-0.5">
          <li>App WhatsApp Business <b>versão 2.24.17</b> ou superior.</li>
          <li>Disponha do número de telefone do app por perto para concluir a verificação.</li>
          <li>Mantenha o app aberto durante a sincronização (pode levar minutos).</li>
        </ul>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {phase === 'syncing_contacts' || phase === 'syncing_history' || phase === 'onboarding' ? (
        <div className="rounded-md border border-border p-3 space-y-2">
          <div className="flex items-center gap-2 text-sm">
            <Loader2 className="h-4 w-4 animate-spin text-primary" />
            <span>
              {phase === 'onboarding' && 'Validando credenciais…'}
              {phase === 'syncing_contacts' && 'Importando contatos…'}
              {phase === 'syncing_history' && 'Importando histórico (até 6 meses)…'}
            </span>
          </div>
          <div className="text-xs text-muted-foreground">
            Contatos: <Badge variant="secondary">{state.contacts_status ?? 'pending'}</Badge>{' '}
            ({state.contacts_imported ?? 0} importados) ·{' '}
            Histórico: <Badge variant="secondary">{state.history_status ?? 'pending'}</Badge>{' '}
            ({state.history_chunks_processed ?? 0}/{state.history_chunks_received ?? 0})
          </div>
        </div>
      ) : null}

      <div className="flex items-center justify-between gap-2 pt-1">
        <a
          href="https://developers.facebook.com/docs/whatsapp/embedded-signup/onboarding-business-app-users"
          target="_blank"
          rel="noreferrer noopener"
          className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
        >
          Documentação Meta — Coexistência <ExternalLink className="h-3 w-3" />
        </a>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={() => navigate(-1)}>
            Cancelar
          </Button>
          <Button
            onClick={handleConnect}
            disabled={phase !== 'ready' || !displayName.trim()}
          >
            {phase === 'loading_sdk' && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            <ShieldCheck className="mr-2 h-4 w-4" />
            Conectar com WhatsApp Business
          </Button>
        </div>
      </div>
    </div>
  );
}
