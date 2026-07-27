import { Mail, User } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { PasswordInput } from './PasswordInput';

interface AuthFormFieldsProps {
  isLogin: boolean;
  email: string;
  setEmail: (v: string) => void;
  password: string;
  setPassword: (v: string) => void;
  fullName: string;
  setFullName: (v: string) => void;
  rememberMe: boolean;
  setRememberMe: (v: boolean) => void;
  acceptedTerms: boolean;
  setAcceptedTerms: (v: boolean) => void;
  errors: { email?: string; password?: string; fullName?: string; terms?: string };
  onForgotPassword: () => void;
}

export function AuthFormFields({
  isLogin,
  email,
  setEmail,
  password,
  setPassword,
  fullName,
  setFullName,
  rememberMe,
  setRememberMe,
  acceptedTerms,
  setAcceptedTerms,
  errors,
  onForgotPassword,
}: AuthFormFieldsProps) {
  return (
    <>
      {!isLogin && (
        <div className="space-y-2">
          <Label htmlFor="fullName" className="text-sm font-medium">
            Nome completo
          </Label>
          <div className="relative">
            <User className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
            <Input
              id="fullName"
              type="text"
              placeholder="Seu nome"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              className="pl-10 h-12 bg-secondary/50 border-border/50 focus:border-primary"
            />
          </div>
          {errors.fullName && (
            <p className="text-destructive text-sm">{errors.fullName}</p>
          )}
        </div>
      )}

      <div className="space-y-2">
        <Label htmlFor="email" className="text-sm font-medium">
          Email
        </Label>
        <div className="relative">
          <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
          <Input
            id="email"
            type="email"
            placeholder="seu@email.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="pl-10 h-12 bg-secondary/50 border-border/50 focus:border-primary"
          />
        </div>
        {errors.email && (
          <p className="text-destructive text-sm">{errors.email}</p>
        )}
      </div>

      <PasswordInput
        value={password}
        onChange={setPassword}
        error={errors.password}
      />

      {isLogin && (
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <Checkbox
              id="rememberMe"
              checked={rememberMe}
              onCheckedChange={(checked) => setRememberMe(checked === true)}
            />
            <Label htmlFor="rememberMe" className="text-sm font-normal text-muted-foreground cursor-pointer">
              Lembrar meu email
            </Label>
          </div>
          <button
            type="button"
            onClick={onForgotPassword}
            className="text-sm text-primary hover:text-primary/80 transition-colors"
          >
            Esqueceu sua senha?
          </button>
        </div>
      )}

      <div className="pt-1">
        <p className="text-xs text-muted-foreground leading-snug">
          Ao continuar, você concorda com os{' '}
          <Link to="/termos" target="_blank" className="text-primary underline-offset-2 hover:underline">
            Termos de Uso
          </Link>{' '}
          e a{' '}
          <Link to="/privacidade" target="_blank" className="text-primary underline-offset-2 hover:underline">
            Política de Privacidade
          </Link>
          .
        </p>
      </div>
    </>
  );
}
