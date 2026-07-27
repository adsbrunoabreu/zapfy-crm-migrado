import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { Loader2 } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { normalizeRole, type AppRole } from '@/lib/roles';

interface RequireRoleProps {
  /** Accepts current enum roles or legacy aliases ('company_admin', 'user'). */
  roles: Array<AppRole | 'company_admin' | 'user'>;
  redirectTo?: string;
}

export function RequireRole({ roles, redirectTo = '/dashboard' }: RequireRoleProps) {
  const { roles: userRoles, loading, user, profile } = useAuth();

  // Pequena janela de tolerância: durante uma navegação que ocorre
  // logo após um TOKEN_REFRESHED, `roles` pode estar momentaneamente
  // vazio enquanto o fetch refaz. Aguardamos brevemente antes de
  // redirecionar para evitar a tela em branco / volta ao /dashboard.
  const [graceElapsed, setGraceElapsed] = useState(false);
  const timerRef = useRef<number | null>(null);
  useEffect(() => {
    if (loading) return;
    if (userRoles.length > 0) {
      setGraceElapsed(false);
      if (timerRef.current) window.clearTimeout(timerRef.current);
      return;
    }
    setGraceElapsed(false);
    timerRef.current = window.setTimeout(() => setGraceElapsed(true), 800);
    return () => {
      if (timerRef.current) window.clearTimeout(timerRef.current);
    };
  }, [loading, userRoles]);

  if (loading || (user && !profile)) {
    return (
      <div className="flex items-center justify-center h-[50vh]">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!user) return <Navigate to="/auth" replace />;

  // Se ainda não chegaram roles e estamos dentro da janela de tolerância,
  // mostre loader em vez de redirecionar imediatamente.
  if (userRoles.length === 0 && !graceElapsed) {
    return (
      <div className="flex items-center justify-center h-[50vh]">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  const required = roles
    .map((r) => normalizeRole(r))
    .filter((r): r is AppRole => r !== null);
  const hasAccess = required.some((r) => userRoles.includes(r));
  if (!hasAccess) return <Navigate to={redirectTo} replace />;

  return <Outlet />;
}
