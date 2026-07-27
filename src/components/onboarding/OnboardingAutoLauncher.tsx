import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useOnboarding } from '@/hooks/useOnboarding';
import { OnboardingWizard } from './OnboardingWizard';

/**
 * Auto-opens the onboarding wizard when:
 * - user is company_admin
 * - onboarding is not completed
 * - either first load OR ?onboarding=1 in URL
 */
export function OnboardingAutoLauncher() {
  const { isCompanyAdmin, isMaster } = useAuth();
  const { data } = useOnboarding();
  const [params, setParams] = useSearchParams();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (isMaster) return;
    if (!isCompanyAdmin) return;
    if (!data) return;
    if (data.completed_at) return;

    const force = params.get('onboarding') === '1';
    const sessionShown = sessionStorage.getItem('zapfy_onboarding_shown');

    if (force || !sessionShown) {
      setOpen(true);
      sessionStorage.setItem('zapfy_onboarding_shown', '1');
      if (force) {
        params.delete('onboarding');
        setParams(params, { replace: true });
      }
    }
  }, [data, isCompanyAdmin, isMaster, params, setParams]);

  if (!isCompanyAdmin || isMaster) return null;
  if (!data || data.completed_at) return null;

  return <OnboardingWizard open={open} onOpenChange={setOpen} />;
}
