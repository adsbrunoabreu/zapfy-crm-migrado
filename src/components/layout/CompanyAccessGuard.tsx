import { ReactNode, useState } from 'react';
import { Pause, AlertCircle, LogOut, Mail, Send, Eye } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { useAuth } from '@/contexts/AuthContext';
import { useUserCompany } from '@/hooks/useCompanies';
import { ReactivationRequestDialog } from './ReactivationRequestDialog';

interface Props {
  children: ReactNode;
}

const blocked: Record<
  string,
  { title: string; label: string; tone: 'rose' | 'muted'; icon: typeof Pause }
> = {
  suspended: { title: 'Acesso suspenso', label: 'suspenso', tone: 'rose', icon: Pause },
  cancelled: { title: 'Plano cancelado', label: 'cancelado', tone: 'muted', icon: AlertCircle },
};

export function CompanyAccessGuard({ children }: Props) {
  const { isMaster, isCompanyAdmin, signOut, user } = useAuth();
  const { data: company, isLoading } = useUserCompany();
  const [contactOpen, setContactOpen] = useState(false);

  if (isMaster || isLoading || !company) {
    return <>{children}</>;
  }

  const status = company.plan_status as string;
  const config = blocked[status];

  if (!config) {
    return <>{children}</>;
  }

  // Admin da Empresa: acesso somente leitura com banner persistente
  if (isCompanyAdmin) {
    const bannerTone =
      config.tone === 'rose'
        ? 'border-rose/40 bg-rose/10 text-rose'
        : 'border-[hsl(var(--amber)/0.40)] bg-[hsl(var(--amber)/0.10)] text-[hsl(var(--amber))]';

    return (
      <>
        <div
          className={`sticky top-0 z-50 w-full border-b ${bannerTone} px-4 py-2.5 backdrop-blur`}
        >
          <div className="flex items-center justify-between gap-3 max-w-screen-2xl mx-auto">
            <div className="flex items-center gap-2.5 min-w-0">
              <config.icon className="w-4 h-4 shrink-0" />
              <div className="text-sm flex flex-wrap items-center gap-x-2 min-w-0">
                <span className="font-semibold">{config.title}</span>
                <span className="text-foreground/80 truncate">
                  Plano {config.label} • Modo somente leitura ativo
                </span>
                <span className="hidden md:inline-flex items-center gap-1 text-xs text-foreground/70">
                  <Eye className="w-3 h-3" />
                  Edições e novos registros estão bloqueados
                </span>
              </div>
            </div>
            <Button
              size="sm"
              variant="outline"
              className="shrink-0 h-8"
              onClick={() => setContactOpen(true)}
            >
              <Send className="w-3.5 h-3.5 mr-1.5" />
              Solicitar reativação
            </Button>
          </div>
        </div>

        {children}

        <ReactivationRequestDialog
          open={contactOpen}
          onOpenChange={setContactOpen}
          defaultCompanyName={company.name}
          defaultEmail={user?.email ?? ''}
          companyId={company.id}
        />
      </>
    );
  }

  // Usuários comuns: bloqueio total
  const Icon = config.icon;
  const accent = config.tone === 'rose' ? 'text-rose' : 'text-muted-foreground';
  const ring = config.tone === 'rose' ? 'bg-rose/15' : 'bg-muted';

  return (
    <div className="min-h-dvh w-full flex items-center justify-center bg-background p-6">
      <Card className="max-w-md w-full p-8 space-y-6 text-center">
        <div className={`w-16 h-16 mx-auto rounded-2xl flex items-center justify-center ${ring}`}>
          <Icon className={`w-8 h-8 ${accent}`} />
        </div>

        <div className="space-y-2">
          <h1 className="text-2xl font-semibold">{config.title}</h1>
          <p className="text-sm text-muted-foreground">
            O acesso da empresa <span className="font-medium text-foreground">{company.name}</span>{' '}
            foi {config.label}.
          </p>
        </div>

        <div className="rounded-lg border border-border bg-secondary/30 p-4 text-sm text-left space-y-2">
          <div className="flex items-start gap-2">
            <Mail className="w-4 h-4 mt-0.5 text-primary shrink-0" />
            <p className="text-muted-foreground">
              Para reativar o acesso, entre em contato com o{' '}
              <span className="text-foreground font-medium">administrador do sistema</span>.
            </p>
          </div>
        </div>

        <div className="space-y-2">
          <Button className="w-full" onClick={() => setContactOpen(true)}>
            <Send className="w-4 h-4 mr-2" />
            Solicitar reativação
          </Button>
          <Button variant="outline" className="w-full" onClick={signOut}>
            <LogOut className="w-4 h-4 mr-2" />
            Sair da conta
          </Button>
        </div>
      </Card>

      <ReactivationRequestDialog
        open={contactOpen}
        onOpenChange={setContactOpen}
        defaultCompanyName={company.name}
        defaultEmail={user?.email ?? ''}
        companyId={company.id}
      />
    </div>
  );
}
