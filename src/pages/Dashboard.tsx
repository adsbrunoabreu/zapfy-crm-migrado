import { useAuth } from '@/contexts/AuthContext';
import { DashboardSkeleton } from '@/components/skeletons/PageSkeletons';
import MasterDashboard from './dashboards/MasterDashboard';
import CompanyDashboard from './dashboards/CompanyDashboard';
import UserDashboard from './dashboards/UserDashboard';

export default function Dashboard() {
  const { loading, user, profile, roles, isMaster, isAdmin, isManager, isFinance } = useAuth();

  // Evita "rebaixar" silenciosamente o usuário para o UserDashboard enquanto
  // profile/roles ainda não foram (re)hidratados — comum logo após login,
  // TOKEN_REFRESHED ou retorno de offline.
  if (loading || (user && (!profile || roles.length === 0))) {
    return <DashboardSkeleton />;
  }

  if (isMaster) return <MasterDashboard />;
  if (isAdmin || isManager || isFinance) return <CompanyDashboard />;
  return <UserDashboard />;
}
