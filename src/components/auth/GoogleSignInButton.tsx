import { Button } from '@/components/ui/button';
import { lovable } from '@/integrations/lovable/index';
import { useToast } from '@/hooks/use-toast';
import { markPendingOAuthConsent } from '@/lib/consents';

interface GoogleSignInButtonProps {
  acceptedTerms: boolean;
}

export function GoogleSignInButton({ acceptedTerms }: GoogleSignInButtonProps) {
  const { toast } = useToast();

  const handleGoogleSignIn = async () => {
    if (!acceptedTerms) {
      toast({
        title: 'Aceite obrigatório',
        description: 'Marque a caixa de aceite dos Termos e da Política de Privacidade para continuar.',
        variant: 'destructive',
      });
      return;
    }
    // Marca o aceite pendente para ser registrado no banco assim que a sessão voltar.
    markPendingOAuthConsent();
    const { error } = await lovable.auth.signInWithOAuth('google', {
      redirect_uri: window.location.origin,
    });
    if (error) {
      toast({
        title: 'Erro ao entrar com Google',
        description: error.message,
        variant: 'destructive',
      });
    }
  };

  return (
    <>
      <div className="relative my-6">
        <div className="absolute inset-0 flex items-center">
          <span className="w-full border-t border-border/50" />
        </div>
        <div className="relative flex justify-center text-xs uppercase">
          <span className="bg-background px-2 text-muted-foreground">ou continue com</span>
        </div>
      </div>

      <Button
        type="button"
        variant="outline"
        className="w-full h-12 gap-3"
        onClick={handleGoogleSignIn}
        disabled={!acceptedTerms}
        title={!acceptedTerms ? 'Aceite os termos para continuar' : undefined}
      >
        <svg className="w-5 h-5" viewBox="0 0 24 24">
          <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4" />
          <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
          <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
          <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
        </svg>
        Continuar com Google
      </Button>
    </>
  );
}
