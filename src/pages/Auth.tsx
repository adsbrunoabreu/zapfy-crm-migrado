import { Link, Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Zap, ArrowRight, Loader2, ArrowLeft } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { useAuthForm } from '@/hooks/useAuthForm';
import { AuthBrandingPanel } from '@/components/auth/AuthBrandingPanel';
import { AuthFormFields } from '@/components/auth/AuthFormFields';
import { GoogleSignInButton } from '@/components/auth/GoogleSignInButton';
import { SignupCompanyStep } from '@/components/auth/SignupCompanyStep';

export default function Auth() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const {
    isLogin,
    step,
    email, setEmail,
    password, setPassword,
    fullName, setFullName,
    companyProfile, setCompanyProfile,
    isLoading,
    rememberMe, setRememberMe,
    acceptedTerms, setAcceptedTerms,
    errors,
    handleSubmit,
    toggleMode,
    goBackToStep1,
  } = useAuthForm();

  // Show skeleton while session resolves to avoid blank flash
  if (loading) {
    return (
      <div className="min-h-dvh flex items-center justify-center bg-background p-8">
        <div className="w-full max-w-md space-y-6">
          <div className="flex items-center justify-center gap-3">
            <Skeleton className="w-10 h-10 rounded-xl" />
            <Skeleton className="h-6 w-24" />
          </div>
          <div className="rounded-2xl border border-border/60 bg-card/60 p-8 space-y-4">
            <Skeleton className="h-8 w-3/4" />
            <Skeleton className="h-4 w-1/2" />
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
          </div>
        </div>
      </div>
    );
  }

  if (user) return <Navigate to="/dashboard" replace />;

  return (
    <div className="min-h-dvh flex bg-background text-foreground">
      <AuthBrandingPanel />

      {/* Painel direito */}
      <div className="relative w-full lg:w-1/2 flex items-center justify-center p-6 sm:p-10 overflow-y-auto max-h-dvh">
        {/* Background sutil só no mobile */}
        <div className="absolute inset-0 -z-10 lg:hidden">
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[120%] h-[500px] bg-gradient-to-b from-primary/15 via-primary/5 to-transparent blur-3xl rounded-full" />
        </div>

        <div className={`w-full ${!isLogin && step === 2 ? 'max-w-2xl' : 'max-w-md'} animate-fade-in`}>
          {/* Logo mobile */}
          <Link
            to="/"
            className="lg:hidden flex items-center justify-center gap-3 mb-8"
          >
            <div className="w-10 h-10 rounded-xl bg-primary/15 border border-primary/20 flex items-center justify-center">
              <Zap className="w-5 h-5 text-primary fill-primary" />
            </div>
            <span className="font-display text-xl font-bold lowercase">zapfy</span>
          </Link>

          <div className="rounded-2xl border border-border/60 bg-card/60 backdrop-blur-xl p-6 sm:p-8 shadow-[0_0_80px_-20px_hsl(var(--primary)/0.25)] space-y-6">
            {/* Header do card */}
            <div className="space-y-2">
              <h2 className="font-display text-2xl sm:text-3xl font-bold tracking-tight">
                {isLogin
                  ? 'Bem-vindo de volta'
                  : step === 1
                    ? 'Criar sua conta'
                    : 'Dados da sua empresa'}
              </h2>
              <p className="text-sm text-muted-foreground">
                {isLogin
                  ? 'Entre para acessar seu CRM e continuar suas vendas.'
                  : step === 1
                    ? 'Passo 1 de 2 — Crie suas credenciais de acesso.'
                    : 'Passo 2 de 2 — Preencha os dados cadastrais da empresa.'}
              </p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-5">
              {(isLogin || step === 1) ? (
                <AuthFormFields
                  isLogin={isLogin}
                  email={email}
                  setEmail={setEmail}
                  password={password}
                  setPassword={setPassword}
                  fullName={fullName}
                  setFullName={setFullName}
                  rememberMe={rememberMe}
                  setRememberMe={setRememberMe}
                  acceptedTerms={acceptedTerms}
                  setAcceptedTerms={setAcceptedTerms}
                  errors={errors}
                  onForgotPassword={() => navigate('/forgot-password')}
                />
              ) : (
                <>
                  <SignupCompanyStep value={companyProfile} onChange={setCompanyProfile} />
                  {errors.company && (
                    <p className="text-sm text-rose">{errors.company}</p>
                  )}
                </>
              )}

              <div className="flex gap-2">
                {!isLogin && step === 2 && (
                  <Button
                    type="button"
                    variant="outline"
                    className="h-12"
                    onClick={goBackToStep1}
                    disabled={isLoading}
                  >
                    <ArrowLeft className="w-4 h-4" />
                  </Button>
                )}
                <Button
                  type="submit"
                  className="w-full h-12 gap-2 text-base"
                  variant="glow"
                  disabled={isLoading}
                >
                  {isLoading ? (
                    <Loader2 className="w-5 h-5 animate-spin" />
                  ) : (
                    <>
                      {isLogin ? 'Entrar' : step === 1 ? 'Continuar' : 'Criar conta grátis'}
                      <ArrowRight className="w-4 h-4" />
                    </>
                  )}
                </Button>
              </div>
            </form>

            {(isLogin || step === 1) && <GoogleSignInButton acceptedTerms={acceptedTerms} />}

            {(isLogin || step === 1) && (
              <div className="text-center text-sm">
                <button
                  type="button"
                  onClick={toggleMode}
                  className="text-muted-foreground hover:text-foreground transition-colors"
                >
                  {isLogin ? (
                    <>Não tem conta? <span className="text-primary font-semibold">Criar agora</span></>
                  ) : (
                    <>Já tem conta? <span className="text-primary font-semibold">Faça login</span></>
                  )}
                </button>
              </div>
            )}
          </div>

          {/* Termos: o aceite formal está no checkbox dentro do formulário */}
          <p className="text-center text-[11px] text-muted-foreground mt-6 px-4 leading-relaxed">
            Precisa de ajuda? <a href="mailto:suporte@zapfy.com.br" className="underline hover:text-foreground">suporte@zapfy.com.br</a>
          </p>
        </div>
      </div>
    </div>
  );
}
