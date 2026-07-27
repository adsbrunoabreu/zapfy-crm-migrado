import { useEffect, useState, Suspense } from 'react';
import { useNavigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { AppSidebar } from './AppSidebar';
import { CompanyAccessGuard } from './CompanyAccessGuard';
import { Loader2 } from 'lucide-react';
import { RouteSuspenseFallback } from './RouteSuspenseFallback';
import { useUnreadConversations } from '@/hooks/useUnreadConversations';
import { useTabUnreadIndicator } from '@/hooks/useTabUnreadIndicator';
import { RouteErrorBoundary } from '@/components/common/RouteErrorBoundary';
import { TrialBanner } from '@/components/billing/TrialBanner';
import { TrialGuard } from '@/components/billing/TrialGuard';
import { OnboardingAutoLauncher } from '@/components/onboarding/OnboardingAutoLauncher';
import { ConnectionStatusBanner } from '@/components/system/ConnectionStatusBanner';
import { useIncomingMessageSound } from '@/hooks/useIncomingMessageSound';
import { useBillingRealtime } from '@/hooks/useBillingRealtime';

/**
 * Hooks globais de baixa prioridade são montados DEPOIS do primeiro paint:
 *  - som de mensagem nova
 *  - realtime de billing (asaas → assinatura)
 *  - contador de não-lidas no título da tab + favicon (badge)
 *
 * Mantê-los fora do caminho crítico reduz em ~4 subscriptions WebSocket o
 * tempo até a primeira pintura do dashboard. A funcionalidade aparece
 * ~600ms depois sem prejuízo perceptível para o usuário.
 *
 * Obs.: o badge de não-lidas dentro do sidebar (AppSidebar) continua
 * chamando o mesmo hook — esse caso é o que importa visualmente.
 */
function DeferredGlobals() {
  useIncomingMessageSound();
  useBillingRealtime();
  const unread = useUnreadConversations();
  useTabUnreadIndicator(unread);
  return null;
}

function useDeferredMount(delayMs = 600) {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const ric: any = (window as any).requestIdleCallback;
    if (ric) {
      const id = ric(() => setReady(true), { timeout: delayMs });
      return () => (window as any).cancelIdleCallback?.(id);
    }
    const t = setTimeout(() => setReady(true), delayMs);
    return () => clearTimeout(t);
  }, [delayMs]);
  return ready;
}

export function DashboardLayout() {
  const { user, loading, isMaster } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const mountDeferred = useDeferredMount(600);

  useEffect(() => {
    if (!loading && !user) {
      navigate('/auth');
    }
  }, [user, loading, navigate]);

  if (loading) {
    return (
      <div className="min-h-dvh flex items-center justify-center bg-background">
        <Loader2 className="w-8 h-8 text-primary animate-spin" />
      </div>
    );
  }

  if (!user) {
    return null;
  }

  return (
    <CompanyAccessGuard>
      <div className={`h-dvh flex w-full bg-background overflow-hidden${isMaster ? ' theme-master' : ''}`}>
        <AppSidebar />
        <main className="flex-1 overflow-hidden flex flex-col min-w-0">
          <TrialBanner />
          <TrialGuard>
            <RouteErrorBoundary routeKey={location.pathname}>
              <Suspense fallback={<RouteSuspenseFallback />}>
                <Outlet />
              </Suspense>
            </RouteErrorBoundary>
          </TrialGuard>
        </main>
        {mountDeferred && <DeferredGlobals />}
        <OnboardingAutoLauncher />
        <ConnectionStatusBanner />
      </div>
    </CompanyAccessGuard>
  );
}
