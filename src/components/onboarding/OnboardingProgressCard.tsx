import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useOnboarding } from '@/hooks/useOnboarding';
import { useAuth } from '@/contexts/AuthContext';
import { OnboardingWizard } from './OnboardingWizard';
import { Button } from '@/components/ui/button';
import { ArrowRight, Sparkles, X } from 'lucide-react';

const ALL_STEPS = ['company', 'whatsapp', 'pipeline', 'team'] as const;

export function OnboardingProgressCard() {
  const { isCompanyAdmin, isMaster } = useAuth();
  const { data } = useOnboarding();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);

  if (isMaster || !isCompanyAdmin) return null;
  if (!data || data.completed_at) return null;

  const done = (data.completed_steps || []).length;
  const total = ALL_STEPS.length;
  const pct = Math.round((done / total) * 100);

  return (
    <>
      <div className="rounded-xl border border-primary/30 bg-gradient-to-br from-primary/10 via-primary/5 to-transparent p-5 mb-4 relative overflow-hidden">
        <div className="absolute -top-12 -right-12 w-32 h-32 bg-primary/15 rounded-full blur-3xl" />
        <div className="relative flex flex-col sm:flex-row sm:items-center gap-4">
          <div className="w-11 h-11 rounded-lg bg-primary/15 border border-primary/30 flex items-center justify-center flex-shrink-0">
            <Sparkles className="w-5 h-5 text-primary" />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="font-display text-lg font-bold">Continue configurando sua conta</h3>
            <p className="text-sm text-muted-foreground">
              {done} de {total} passos concluídos · faltam {total - done} para destravar tudo.
            </p>
            <div className="mt-2 h-1.5 bg-border rounded-full overflow-hidden">
              <div
                className="h-full bg-primary rounded-full transition-all"
                style={{ width: `${pct}%` }}
              />
            </div>
          </div>
          <Button onClick={() => setOpen(true)} className="flex-shrink-0">
            Continuar <ArrowRight className="w-4 h-4 ml-2" />
          </Button>
        </div>
      </div>
      <OnboardingWizard open={open} onOpenChange={setOpen} />
    </>
  );
}
