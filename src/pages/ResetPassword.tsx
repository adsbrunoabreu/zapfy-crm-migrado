import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { ArrowRight, Loader2, CheckCircle, AlertCircle } from 'lucide-react';
import { BrandMark } from '@/components/auth/BrandMark';
import { PasswordInput } from '@/components/auth/PasswordInput';
import { Skeleton } from '@/components/ui/skeleton';
import { strongPasswordSchema, scorePassword } from '@/lib/auth/schemas';

type RecoveryStatus = 'checking' | 'valid' | 'invalid';

function parseHashParams(hash: string): Record<string, string> {
  const cleaned = hash.startsWith('#') ? hash.slice(1) : hash;
  const params: Record<string, string> = {};
  for (const part of cleaned.split('&')) {
    const [k, v] = part.split('=');
    if (k) params[decodeURIComponent(k)] = decodeURIComponent(v ?? '');
  }
  return params;
}

export default function ResetPassword() {
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [pwError, setPwError] = useState<string | null>(null);
  const [confirmError, setConfirmError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [status, setStatus] = useState<RecoveryStatus>('checking');
  const [invalidReason, setInvalidReason] = useState<string>(
    'Este link de recuperação é inválido ou expirou.',
  );
  const [done, setDone] = useState(false);
  const navigate = useNavigate();
  const { toast } = useToast();

  useEffect(() => {
    let cancelled = false;

    async function init() {
      // 1) Check hash for explicit error from Supabase redirect
      const hashParams = parseHashParams(window.location.hash);
      if (hashParams.error_code || hashParams.error) {
        const code = hashParams.error_code || hashParams.error;
        const desc = hashParams.error_description || '';
        const friendly =
          code === 'otp_expired'
            ? 'Este link de recuperação expirou. Solicite um novo abaixo.'
            : desc || 'Link de recuperação inválido. Solicite um novo abaixo.';
        if (!cancelled) {
          setInvalidReason(friendly);
          setStatus('invalid');
        }
        return;
      }

      // 2) Hash-based recovery (legacy implicit flow)
      if (window.location.hash.includes('type=recovery')) {
        if (!cancelled) setStatus('valid');
        return;
      }

      // 3) PKCE recovery: ?code=...
      const url = new URL(window.location.href);
      const code = url.searchParams.get('code');
      if (code) {
        const { data, error } = await supabase.auth.exchangeCodeForSession(code);
        if (cancelled) return;
        if (!error && data.session) {
          url.searchParams.delete('code');
          window.history.replaceState({}, '', url.pathname + url.search);
          setStatus('valid');
        } else {
          setInvalidReason(
            error?.message === 'Token has expired or is invalid'
              ? 'Este link de recuperação expirou. Solicite um novo abaixo.'
              : 'Link de recuperação inválido. Solicite um novo abaixo.',
          );
          setStatus('invalid');
        }
        return;
      }

      // 4) Already-active recovery session
      const { data: sessionData } = await supabase.auth.getSession();
      if (cancelled) return;
      if (sessionData.session) {
        setStatus('valid');
      } else {
        setStatus('invalid');
      }
    }

    void init();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY' && !cancelled) {
        setStatus('valid');
      }
    });

    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
  }, []);

  // Cleanup redirect timer
  useEffect(() => {
    if (!done) return;
    const t = window.setTimeout(() => navigate('/dashboard'), 2000);
    return () => window.clearTimeout(t);
  }, [done, navigate]);

  const strength = password ? scorePassword(password) : null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const parsed = strongPasswordSchema.safeParse(password);
    if (!parsed.success) {
      setPwError(parsed.error.errors[0]?.message || 'Senha inválida');
      return;
    }
    setPwError(null);

    if (password !== confirmPassword) {
      setConfirmError('As senhas não coincidem');
      return;
    }
    setConfirmError(null);

    setIsLoading(true);
    const { error } = await supabase.auth.updateUser({ password });

    if (error) {
      setIsLoading(false);
      // HIBP-pwned password returns specific message; surface as field error
      const msg = error.message || '';
      if (/pwned|leaked|compromised/i.test(msg)) {
        setPwError('Esta senha apareceu em vazamentos públicos. Escolha outra.');
      } else if (msg.includes('should be different')) {
        setPwError('A nova senha deve ser diferente da atual.');
      } else {
        toast({ title: 'Erro', description: msg, variant: 'destructive' });
      }
      return;
    }

    // Best-effort: revoke other sessions for security
    await supabase.auth.signOut({ scope: 'others' }).catch(() => undefined);

    setDone(true);
  };

  return (
    <div className="min-h-dvh flex items-center justify-center p-8 bg-background">
      <div className="w-full max-w-md space-y-8 animate-fade-in">
        <BrandMark className="mb-8" />

        {status === 'checking' ? (
          <div className="space-y-4">
            <Skeleton className="h-7 w-1/2 mx-auto" />
            <Skeleton className="h-4 w-3/4 mx-auto" />
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
          </div>
        ) : done ? (
          <div className="text-center space-y-4">
            <CheckCircle className="w-16 h-16 text-primary mx-auto" />
            <h2 className="text-xl font-semibold text-foreground">Senha alterada!</h2>
            <p className="text-muted-foreground">Redirecionando para o painel...</p>
            <Button variant="ghost" onClick={() => navigate('/dashboard')}>
              Ir agora →
            </Button>
          </div>
        ) : status === 'invalid' ? (
          <div className="text-center space-y-4">
            <AlertCircle className="w-16 h-16 text-destructive mx-auto" />
            <h2 className="text-xl font-semibold text-foreground">Link inválido</h2>
            <p className="text-muted-foreground">{invalidReason}</p>
            <div className="flex flex-col sm:flex-row gap-2 justify-center">
              <Button variant="glow" asChild>
                <Link to="/forgot-password">Solicitar novo link</Link>
              </Button>
              <Button variant="outline" asChild>
                <Link to="/auth">Voltar ao login</Link>
              </Button>
            </div>
          </div>
        ) : (
          <>
            <div className="text-center">
              <h2 className="text-xl font-semibold text-foreground">Nova senha</h2>
              <p className="text-muted-foreground mt-2">
                Use no mínimo 8 caracteres com letras maiúsculas, minúsculas e números.
              </p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-5" noValidate>
              <div className="space-y-2">
                <PasswordInput
                  id="password"
                  label="Nova senha"
                  value={password}
                  onChange={(v) => {
                    setPassword(v);
                    if (pwError) setPwError(null);
                  }}
                  error={pwError ?? undefined}
                />
                {strength && (
                  <div className="space-y-1">
                    <div className="h-1.5 w-full rounded-full bg-secondary/50 overflow-hidden">
                      <div
                        className={`h-full transition-all ${
                          strength.score <= 1
                            ? 'bg-destructive w-1/4'
                            : strength.score === 2
                              ? 'bg-amber-500 w-2/4'
                              : strength.score === 3
                                ? 'bg-primary w-3/4'
                                : 'bg-emerald-500 w-full'
                        }`}
                      />
                    </div>
                    <p className="text-xs text-muted-foreground">Força: {strength.label}</p>
                  </div>
                )}
              </div>

              <PasswordInput
                id="confirmPassword"
                label="Confirmar senha"
                value={confirmPassword}
                onChange={(v) => {
                  setConfirmPassword(v);
                  if (confirmError) setConfirmError(null);
                }}
                error={confirmError ?? undefined}
              />

              <Button type="submit" className="w-full h-12" variant="glow" disabled={isLoading}>
                {isLoading ? (
                  <Loader2 className="w-5 h-5 animate-spin" />
                ) : (
                  <>
                    Redefinir senha
                    <ArrowRight className="w-5 h-5" />
                  </>
                )}
              </Button>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
