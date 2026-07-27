import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { z } from 'zod';
import { checkPendingInvite, acceptInvite } from '@/hooks/useTeamInvites';
import { supabase } from '@/integrations/supabase/client';
import {
  EMPTY_COMPANY_PROFILE,
  profileValuesToUpdate,
  type CompanyProfileValues,
} from '@/components/admin/CompanyProfileForm';
import { isValidCNPJ } from '@/lib/cnpj';
import { safeStorage } from '@/lib/safeStorage';
import { CURRENT_TERMS_VERSION, recordTermsConsent } from '@/lib/consents';

const REMEMBER_EMAIL_KEY = 'zapfy_remember_email';
const LEGACY_REMEMBER_EMAIL_KEY = 'credflow_remember_email';

// One-time migration of legacy storage key
function readRememberedEmail(): string {
  const current = safeStorage.get(REMEMBER_EMAIL_KEY);
  if (current) return current;
  const legacy = safeStorage.get(LEGACY_REMEMBER_EMAIL_KEY);
  if (legacy) {
    safeStorage.set(REMEMBER_EMAIL_KEY, legacy);
    safeStorage.remove(LEGACY_REMEMBER_EMAIL_KEY);
    return legacy;
  }
  return '';
}

const authSchema = z.object({
  email: z.string().trim().toLowerCase().email('Email inválido').max(255),
  password: z.string().min(6, 'Senha deve ter no mínimo 6 caracteres').max(128),
  fullName: z.string().trim().min(2, 'Nome deve ter no mínimo 2 caracteres').max(120).optional(),
});

const companySchema = z.object({
  name: z.string().trim().min(2, 'Nome da empresa é obrigatório').max(160),
  cnpj: z
    .string()
    .optional()
    .refine((v) => !v || isValidCNPJ(v), { message: 'CNPJ inválido' }),
});

type FormErrors = { email?: string; password?: string; fullName?: string; company?: string; terms?: string };

export function useAuthForm() {
  const [isLogin, setIsLogin] = useState(true);
  const [step, setStep] = useState<1 | 2>(1);
  const initialEmail = readRememberedEmail();
  const [email, setEmail] = useState(initialEmail);
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [companyProfile, setCompanyProfile] = useState<CompanyProfileValues>(EMPTY_COMPANY_PROFILE);
  const [isLoading, setIsLoading] = useState(false);
  const [rememberMe, setRememberMe] = useState(!!initialEmail);
  const [acceptedTerms, setAcceptedTerms] = useState(true);
  const [errors, setErrors] = useState<FormErrors>({});

  const { signIn, signUp } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const selectedPlanId = searchParams.get('plan');
  const selectedBillingCycle = searchParams.get('cycle');
  const { toast } = useToast();

  const normalizedEmail = () => email.trim().toLowerCase();

  const validateStep1 = () => {
    try {
      const payload = { email: normalizedEmail(), password, fullName: fullName.trim() };
      if (isLogin) {
        authSchema.pick({ email: true, password: true }).parse(payload);
      } else {
        authSchema.parse(payload);
      }
      setErrors({});
      return true;
    } catch (error) {
      if (error instanceof z.ZodError) {
        const newErrors: FormErrors = {};
        error.errors.forEach((err) => {
          const path = err.path[0] as keyof FormErrors;
          newErrors[path] = err.message;
        });
        setErrors(newErrors);
      }
      return false;
    }
  };

  const validateCompany = () => {
    try {
      companySchema.parse({
        name: companyProfile.name,
        cnpj: companyProfile.cnpj || undefined,
      });
      setErrors({});
      return true;
    } catch (error) {
      if (error instanceof z.ZodError) {
        setErrors({ company: error.errors[0]?.message || 'Dados da empresa inválidos' });
      }
      return false;
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateStep1()) return;

    // Aceite obrigatório dos Termos + Política de Privacidade.
    // No signup vale para os passos 1 e 2; no login só passa quando marcado.
    if (!acceptedTerms) {
      setErrors((prev) => ({
        ...prev,
        terms: 'Você precisa aceitar os Termos de Uso e a Política de Privacidade.',
      }));
      toast({
        title: 'Aceite obrigatório',
        description: 'Marque a caixa de aceite para continuar.',
        variant: 'destructive',
      });
      return;
    }

    const cleanEmail = normalizedEmail();

    if (isLogin) {
      setIsLoading(true);
      try {
        if (rememberMe) safeStorage.set(REMEMBER_EMAIL_KEY, cleanEmail);
        else safeStorage.remove(REMEMBER_EMAIL_KEY);
        const { error } = await signIn(cleanEmail, password);
        if (error) {
          toast({
            title: 'Erro ao entrar',
            description: error.message === 'Invalid login credentials'
              ? 'Email ou senha incorretos'
              : error.message,
            variant: 'destructive',
          });
        } else {
          // Consent é fire-and-forget: pega o user da sessão atual sem bloquear o redirect.
          void (async () => {
            const { data: sess } = await supabase.auth.getSession();
            if (sess?.session?.user?.id) {
              await recordTermsConsent(sess.session.user.id, 'login');
            }
          })();
          toast({ title: 'Bem-vindo!', description: 'Login realizado com sucesso.' });
          navigate('/dashboard', { replace: true });
        }
      } finally {
        setIsLoading(false);
      }
      return;
    }

    // Signup flow
    if (step === 1) {
      setIsLoading(true);
      try {
        const invite = await checkPendingInvite(cleanEmail);
        if (invite) {
          const { error, data } = await signUp(cleanEmail, password, fullName.trim());
          if (error) {
            // Race: account already exists — redirect to login
            if (error.message.includes('already registered') || error.message.toLowerCase().includes('already')) {
              toast({
                title: 'Conta já existe',
                description: 'Faça login para aceitar o convite automaticamente.',
              });
              setIsLogin(true);
              setStep(1);
              return;
            }
            toast({
              title: 'Erro ao cadastrar',
              description: error.message,
              variant: 'destructive',
            });
            return;
          }
          if (data?.user) {
            try {
              await acceptInvite(invite.id, data.user.id);
              toast({ title: 'Conta criada!', description: 'Você foi adicionado à equipe automaticamente.' });
            } catch {
              toast({ title: 'Conta criada!' });
            }
            navigate('/dashboard', { replace: true });
          } else {
            // No user returned — email confirmation pending
            toast({
              title: 'Verifique seu email',
              description: 'Enviamos um link de confirmação para concluir o cadastro.',
            });
          }
          return;
        }
        // No invite → go to company step
        setStep(2);
      } finally {
        setIsLoading(false);
      }
      return;
    }

    // Step 2: create company + admin
    if (!validateCompany()) return;

    setIsLoading(true);
    try {
      const payload = profileValuesToUpdate(companyProfile);
      const { data, error } = await supabase.functions.invoke('public-signup-with-company', {
        body: {
          full_name: fullName.trim(),
          email: cleanEmail,
          password,
          company: payload,
          selected_plan_id: selectedPlanId || null,
          selected_billing_cycle: selectedBillingCycle === 'yearly' ? 'yearly' : 'monthly',
          consent: {
            accepted: true,
            version: CURRENT_TERMS_VERSION,
            user_agent: typeof navigator !== 'undefined' ? navigator.userAgent.slice(0, 500) : null,
          },
        },
      });
      if (error || (data as any)?.error) {
        const msg = (data as any)?.error || error?.message || 'Erro ao criar conta';
        toast({ title: 'Erro ao cadastrar', description: msg, variant: 'destructive' });
        return;
      }
      const { error: signInErr } = await signIn(cleanEmail, password);
      if (signInErr) {
        toast({ title: 'Conta criada!', description: 'Faça login para continuar.' });
        setIsLogin(true);
        setStep(1);
      } else {
        toast({ title: 'Conta criada!', description: 'Vamos configurar tudo em poucos passos.' });
        navigate('/dashboard?onboarding=1', { replace: true });
      }
    } finally {
      setIsLoading(false);
    }
  };

  const toggleMode = () => {
    setIsLogin(!isLogin);
    setStep(1);
    setErrors({});
  };

  const goBackToStep1 = () => {
    setStep(1);
    setErrors({});
  };

  return {
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
  };
}
