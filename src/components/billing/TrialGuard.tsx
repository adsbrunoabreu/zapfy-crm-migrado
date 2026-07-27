import { useLocation } from 'react-router-dom';
import { useTrialStatus } from '@/hooks/useTrialStatus';
import { useAuth } from '@/contexts/AuthContext';
import { TrialExpiredScreen } from './TrialExpiredScreen';

const ALLOWED_WHEN_EXPIRED = ['/subscription', '/profile'];

export function TrialGuard({ children }: { children: React.ReactNode }) {
  const { data } = useTrialStatus();
  const { isMaster } = useAuth();
  const location = useLocation();

  if (isMaster) return <>{children}</>;
  if (!data) return <>{children}</>;

  const blocked =
    (data.plan_status === 'trial' && data.expired) ||
    data.plan_status === 'suspended' ||
    data.plan_status === 'cancelled';

  if (!blocked) return <>{children}</>;

  const allowed = ALLOWED_WHEN_EXPIRED.some((p) => location.pathname.startsWith(p));
  if (allowed) return <>{children}</>;

  return <TrialExpiredScreen />;
}
