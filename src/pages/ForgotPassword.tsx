import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { Mail, ArrowLeft, ArrowRight, Loader2, CheckCircle } from 'lucide-react';
import { BrandMark } from '@/components/auth/BrandMark';
import { emailSchema } from '@/lib/auth/schemas';

const COOLDOWN_SECONDS = 30;

export default function ForgotPassword() {
  const [email, setEmail] = useState('');
  const [emailError, setEmailError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const navigate = useNavigate();
  const { toast } = useToast();
  const intervalRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (intervalRef.current) window.clearInterval(intervalRef.current);
    };
  }, []);

  const startCooldown = () => {
    setCooldown(COOLDOWN_SECONDS);
    if (intervalRef.current) window.clearInterval(intervalRef.current);
    intervalRef.current = window.setInterval(() => {
      setCooldown((c) => {
        if (c <= 1) {
          if (intervalRef.current) window.clearInterval(intervalRef.current);
          return 0;
        }
        return c - 1;
      });
    }, 1000);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (cooldown > 0 || isLoading) return;

    const parsed = emailSchema.safeParse(email);
    if (!parsed.success) {
      setEmailError(parsed.error.errors[0]?.message || 'Email inválido');
      return;
    }
    setEmailError(null);

    setIsLoading(true);
    const { error } = await supabase.auth.resetPasswordForEmail(parsed.data, {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    setIsLoading(false);

    // Always show success to prevent account enumeration
    if (error) {
      // eslint-disable-next-line no-console
      console.warn('[forgot-password] suppressed error:', error.message);
    }
    setSent(true);
    startCooldown();
  };

  const handleResend = () => {
    setSent(false);
  };

  return (
    <div className="min-h-dvh flex items-center justify-center p-8 bg-background">
      <div className="w-full max-w-md space-y-8 animate-fade-in">
        <BrandMark className="mb-8" />

        {sent ? (
          <div className="text-center space-y-4">
            <CheckCircle className="w-16 h-16 text-primary mx-auto" />
            <h2 className="text-xl font-semibold text-foreground">Verifique seu email</h2>
            <p className="text-muted-foreground">
              Se existir uma conta para{' '}
              <span className="font-medium text-foreground">{email}</span>, você receberá um link
              para redefinir sua senha em instantes.
            </p>
            <div className="flex flex-col sm:flex-row gap-2 justify-center">
              <Button variant="outline" asChild className="gap-2">
                <Link to="/auth">
                  <ArrowLeft className="w-4 h-4" />
                  Voltar ao login
                </Link>
              </Button>
              <Button
                variant="ghost"
                onClick={handleResend}
                disabled={cooldown > 0}
                className="gap-2"
              >
                {cooldown > 0 ? `Reenviar em ${cooldown}s` : 'Reenviar email'}
              </Button>
            </div>
          </div>
        ) : (
          <>
            <div className="text-center">
              <h2 className="text-xl font-semibold text-foreground">Esqueceu sua senha?</h2>
              <p className="text-muted-foreground mt-2">
                Informe seu email e enviaremos um link para redefinir sua senha.
              </p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-5" noValidate>
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                  <Input
                    id="email"
                    type="email"
                    inputMode="email"
                    autoComplete="email"
                    required
                    maxLength={255}
                    placeholder="seu@email.com"
                    value={email}
                    onChange={(e) => {
                      setEmail(e.target.value);
                      if (emailError) setEmailError(null);
                    }}
                    aria-invalid={!!emailError}
                    aria-describedby={emailError ? 'email-error' : undefined}
                    className="pl-10 h-12 bg-secondary/50 border-border/50 focus:border-primary"
                  />
                </div>
                {emailError && (
                  <p id="email-error" className="text-sm text-destructive">
                    {emailError}
                  </p>
                )}
              </div>

              <Button
                type="submit"
                className="w-full h-12"
                variant="glow"
                disabled={isLoading || cooldown > 0}
              >
                {isLoading ? (
                  <Loader2 className="w-5 h-5 animate-spin" />
                ) : cooldown > 0 ? (
                  `Aguarde ${cooldown}s`
                ) : (
                  <>
                    Enviar link
                    <ArrowRight className="w-5 h-5" />
                  </>
                )}
              </Button>
            </form>

            <div className="text-center">
              <Link
                to="/auth"
                className="text-muted-foreground hover:text-foreground transition-colors gap-2 inline-flex items-center"
              >
                <ArrowLeft className="w-4 h-4" />
                Voltar ao login
              </Link>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
