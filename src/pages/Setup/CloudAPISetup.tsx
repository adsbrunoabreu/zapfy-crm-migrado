/**
 * CloudAPISetup
 * -------------
 * Formulário simplificado de cadastro do WhatsApp Cloud API (Meta).
 *
 * Fluxo:
 *  1. Usuário informa apenas: nome da conexão, Phone Number ID, WABA ID e Access Token.
 *  2. Sistema gera automaticamente um `webhookVerifyToken` e a Callback URL.
 *  3. Após salvar, exibe `CloudWebhookInstructions` para o usuário copiar
 *     URL + Token e colar no painel do Meta.
 *
 * App Secret é opcional (seção avançada). Quando vazio, o webhook router
 * processa eventos sem validar HMAC e auditoria registra um warning.
 */
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { z } from 'zod';
import { ChevronDown, ChevronUp, ExternalLink, Loader2, ShieldCheck } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { ProviderService } from '@/services/providerService';
import { ProviderRegistry } from '@/services/providers';
import { useAuth } from '@/contexts/AuthContext';
import CloudWebhookInstructions from '@/components/setup/CloudWebhookInstructions';
import type { CloudApiCredentials } from '@/types/providers';

const Schema = z.object({
  displayName: z.string().trim().min(2, 'Informe um nome para a conexão').max(80),
  phoneNumberId: z.string().trim().regex(/^\d{6,20}$/, 'Phone Number ID deve ser numérico'),
  businessAccountId: z.string().trim().regex(/^\d{6,20}$/, 'WABA ID deve ser numérico'),
  accessToken: z.string().trim().min(20, 'Access Token muito curto').max(4096),
  appSecret: z.string().trim().max(255).optional().or(z.literal('')),
});

type FormValues = z.infer<typeof Schema>;
type Errors = Partial<Record<keyof FormValues, string>>;

const DEFAULTS: FormValues = {
  displayName: '',
  phoneNumberId: '',
  businessAccountId: '',
  accessToken: '',
  appSecret: '',
};

/** Gera token aleatório (32 bytes hex = 64 chars) — seguro para uso como verify token. */
function generateVerifyToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

export default function CloudAPISetup() {
  const navigate = useNavigate();
  const { profile } = useAuth();
  const [values, setValues] = useState<FormValues>(DEFAULTS);
  const [errors, setErrors] = useState<Errors>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [saving, setSaving] = useState(false);
  // Após salvar com sucesso, guardamos o verify token para mostrar instruções.
  const [savedToken, setSavedToken] = useState<string | null>(null);
  const [savedDisplayName, setSavedDisplayName] = useState<string | null>(null);

  const update = (field: keyof FormValues) => (e: React.ChangeEvent<HTMLInputElement>) => {
    setValues((p) => ({ ...p, [field]: e.target.value }));
    setErrors((p) => ({ ...p, [field]: undefined }));
  };

  const validate = (): FormValues | null => {
    const parsed = Schema.safeParse(values);
    if (!parsed.success) {
      const next: Errors = {};
      for (const issue of parsed.error.issues) {
        const k = issue.path[0] as keyof FormValues;
        if (k && !next[k]) next[k] = issue.message;
      }
      setErrors(next);
      return null;
    }
    return parsed.data;
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const data = validate();
    if (!data) return;
    if (!profile?.company_id) {
      toast.error('Empresa não identificada na sessão.');
      return;
    }
    setSaving(true);
    setSubmitError(null);

    const verifyToken = generateVerifyToken();
    const credentials: CloudApiCredentials = {
      type: 'cloud_api',
      phoneNumberId: data.phoneNumberId,
      businessAccountId: data.businessAccountId,
      accessToken: data.accessToken,
      webhookVerifyToken: verifyToken,
      appSecret: data.appSecret?.trim() || undefined,
    };

    try {
      // Valida credenciais de chamada à Graph API antes de persistir
      const provider = ProviderRegistry.create('cloud_api');
      await provider.connect(credentials);

      await ProviderService.registerProvider(
        profile.company_id,
        'cloud_api',
        credentials,
        { displayName: data.displayName, preferred: false },
      );
      toast.success('Conexão criada — copie a URL e o token abaixo');
      setSavedToken(verifyToken);
      setSavedDisplayName(data.displayName);
    } catch (err) {
      const msg = (err as Error)?.message ?? 'Falha ao salvar';
      setSubmitError(msg);
      toast.error('Falha ao conectar', { description: msg });
    } finally {
      setSaving(false);
    }
  };

  // ── Tela pós-cadastro ───────────────────────────────────────────────────
  if (savedToken) {
    return (
      <CloudWebhookInstructions
        verifyToken={savedToken}
        displayName={savedDisplayName ?? undefined}
        onClose={() => navigate('/settings?tab=connections')}
      />
    );
  }

  return (
    <form className="space-y-3" onSubmit={submit} noValidate>
      <div className="space-y-1.5">
        <Label htmlFor="cl-name">Nome da conexão</Label>
        <Input
          id="cl-name"
          autoComplete="off"
          placeholder="Ex.: Atendimento principal"
          value={values.displayName}
          onChange={update('displayName')}
          aria-invalid={!!errors.displayName}
          disabled={saving}
          required
        />
        {errors.displayName && (
          <p className="text-xs text-destructive">{errors.displayName}</p>
        )}
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="cl-phoneId">Phone Number ID</Label>
          <Input
            id="cl-phoneId"
            inputMode="numeric"
            autoComplete="off"
            placeholder="Ex.: 123456789012345"
            value={values.phoneNumberId}
            onChange={update('phoneNumberId')}
            aria-invalid={!!errors.phoneNumberId}
            disabled={saving}
            required
          />
          {errors.phoneNumberId && (
            <p className="text-xs text-destructive">{errors.phoneNumberId}</p>
          )}
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="cl-waba">WABA ID</Label>
          <Input
            id="cl-waba"
            inputMode="numeric"
            autoComplete="off"
            placeholder="Ex.: 987654321098765"
            value={values.businessAccountId}
            onChange={update('businessAccountId')}
            aria-invalid={!!errors.businessAccountId}
            disabled={saving}
            required
          />
          {errors.businessAccountId && (
            <p className="text-xs text-destructive">{errors.businessAccountId}</p>
          )}
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="cl-token">Token de acesso</Label>
        <Input
          id="cl-token"
          type="password"
          autoComplete="new-password"
          placeholder="Token permanente da Cloud API"
          value={values.accessToken}
          onChange={update('accessToken')}
          aria-invalid={!!errors.accessToken}
          disabled={saving}
          required
        />
        {errors.accessToken ? (
          <p className="text-xs text-destructive">{errors.accessToken}</p>
        ) : (
          <p className="inline-flex items-center gap-1 text-xs text-muted-foreground">
            <ShieldCheck className="h-3 w-3" /> Criptografado em repouso. Callback URL e Verify Token serão gerados ao salvar.
          </p>
        )}
      </div>

      {/* Avançado — App Secret opcional */}
      <div className="rounded-md border border-border">
        <button
          type="button"
          className="flex w-full items-center justify-between px-3 py-2 text-sm"
          onClick={() => setShowAdvanced((v) => !v)}
          aria-expanded={showAdvanced}
        >
          <span className="text-muted-foreground">Avançado (opcional)</span>
          {showAdvanced ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </button>
        {showAdvanced && (
          <div className="space-y-1.5 border-t border-border p-3">
            <Label htmlFor="cl-secret">App Secret</Label>
            <Input
              id="cl-secret"
              type="password"
              autoComplete="new-password"
              placeholder="Opcional — habilita validação HMAC do webhook"
              value={values.appSecret}
              onChange={update('appSecret')}
              disabled={saving}
            />
            <p className="text-xs text-muted-foreground">
              Quando preenchido, todas as requisições recebidas no webhook serão validadas
              via X-Hub-Signature-256.
            </p>
          </div>
        )}
      </div>

      {submitError && (
        <Alert variant="destructive">
          <AlertDescription>{submitError}</AlertDescription>
        </Alert>
      )}

      <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
        <a
          href="https://developers.facebook.com/docs/whatsapp/cloud-api"
          target="_blank"
          rel="noreferrer noopener"
          className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
        >
          Documentação Meta Cloud API <ExternalLink className="h-3 w-3" />
        </a>
        <div className="flex gap-2">
          <Button type="button" variant="outline" onClick={() => navigate(-1)} disabled={saving}>
            Cancelar
          </Button>
          <Button type="submit" disabled={saving}>
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Salvar e gerar webhook
          </Button>
        </div>
      </div>
    </form>
  );
}
