import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/contexts/AuthContext';
import { Zap, Check, LogOut } from 'lucide-react';

export function TrialExpiredScreen() {
  const navigate = useNavigate();
  const { signOut } = useAuth();

  return (
    <div className="min-h-dvh flex items-center justify-center bg-background p-6">
      <div className="max-w-xl w-full rounded-2xl border border-border bg-card p-8 sm:p-10 space-y-6 shadow-[0_0_80px_-20px_hsl(var(--primary)/0.25)]">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-xl bg-primary/15 border border-primary/20 flex items-center justify-center">
            <Zap className="w-6 h-6 text-primary fill-primary" />
          </div>
          <div>
            <p className="text-xs uppercase tracking-wider text-muted-foreground">zapfy</p>
            <h1 className="font-display text-2xl font-bold">Acesso pausado · trial encerrado</h1>
          </div>
        </div>

        <p className="text-muted-foreground">
          Seu teste grátis de 24 horas terminou e o acesso ao CRM foi pausado.
          Para reativar suas conversas, leads e equipe, escolha um plano agora —
          em menos de 2 minutos sua conta volta a funcionar.
        </p>

        <ul className="space-y-2 text-sm">
          {[
            'Conversas ilimitadas no WhatsApp',
            'Pipelines, leads e equipe sem limites',
            'Automação e mensagens em massa',
            'Cancele quando quiser',
          ].map((b) => (
            <li key={b} className="flex items-center gap-2">
              <Check className="w-4 h-4 text-primary" />
              <span>{b}</span>
            </li>
          ))}
        </ul>

        <div className="flex flex-col sm:flex-row gap-3 pt-2">
          <Button size="lg" className="flex-1" onClick={() => navigate('/subscription')}>
            Assinar agora
          </Button>
          <Button size="lg" variant="ghost" onClick={() => signOut()}>
            <LogOut className="w-4 h-4 mr-2" />
            Sair
          </Button>
        </div>
      </div>
    </div>
  );
}
