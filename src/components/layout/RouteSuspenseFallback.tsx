import { useLocation } from 'react-router-dom';
import {
  DashboardSkeleton,
  LeadsSkeleton,
  PipelineSkeleton,
  TeamSkeleton,
  SettingsSkeleton,
  GenericPageSkeleton,
} from '@/components/skeletons/PageSkeletons';
import { ChatSkeleton, FinancialSkeleton } from '@/components/skeletons/ChatSkeleton';

/**
 * Suspense fallback adaptativo — escolhe o skeleton que mais se parece com a
 * estrutura da rota destino, evitando a sensação de "tela inteira presa" ao
 * trocar de página enquanto o chunk lazy ainda baixa.
 */
export function RouteSuspenseFallback() {
  const { pathname } = useLocation();

  if (pathname === '/chat' || pathname.startsWith('/chat/')) return <ChatSkeleton />;
  if (pathname.startsWith('/pipelines') || pathname.startsWith('/oportunidades')) return <PipelineSkeleton />;
  if (pathname === '/leads') return <LeadsSkeleton />;
  if (pathname === '/contatos' || pathname.startsWith('/contatos/')) return <LeadsSkeleton />;
  if (pathname === '/dashboard' || pathname.startsWith('/dashboards/')) return <DashboardSkeleton />;
  if (pathname.startsWith('/medical/dashboard')) return <DashboardSkeleton />;
  if (pathname === '/financeiro' || pathname.startsWith('/financeiro/')) return <FinancialSkeleton />;
  if (pathname.startsWith('/reports')) return <FinancialSkeleton />;
  if (pathname === '/team') return <TeamSkeleton />;
  if (pathname === '/settings' || pathname.startsWith('/settings/')) return <SettingsSkeleton />;

  return <GenericPageSkeleton />;
}
