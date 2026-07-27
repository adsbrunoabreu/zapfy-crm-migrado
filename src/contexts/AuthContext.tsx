import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import { User, Session } from '@supabase/supabase-js';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { photoQueue } from '@/services/photoQueue';
import { consumePendingOAuthConsent, recordTermsConsent } from '@/lib/consents';
import { setTelemetryContext } from '@/lib/clientTelemetry';
import {
  type AppRole,
  normalizeRole,
  pickHighestRole,
  isMaster as roleIsMaster,
  isAdmin as roleIsAdmin,
  isManager as roleIsManager,
  isFinance as roleIsFinance,
  isAgent as roleIsAgent,
  canManage as roleCanManage,
  canReadAll as roleCanReadAll,
} from '@/lib/roles';

interface Profile {
  id: string;
  email: string;
  full_name: string | null;
  company_id: string | null;
  phone: string | null;
  avatar_url: string | null;
  status: string;
  role: AppRole;
}

interface AuthContextType {
  user: User | null;
  session: Session | null;
  profile: Profile | null;
  roles: AppRole[];
  /** Highest-priority effective role (merge of user_roles + profiles.role). */
  effectiveRole: AppRole | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<{ error: Error | null }>;
  signUp: (email: string, password: string, fullName: string) => Promise<{ error: Error | null; data: { user: User | null } | null }>;
  signOut: () => Promise<void>;
  isMaster: boolean;
  isAdmin: boolean;
  isManager: boolean;
  isFinance: boolean;
  isAgent: boolean;
  /** Backwards-compat: true for master or admin (covers legacy company_admin). */
  isCompanyAdmin: boolean;
  /** master + admin + gestor (operational write). */
  canManage: boolean;
  /** master + admin + gestor + financeiro (full read). */
  canReadAll: boolean;
  refreshProfile: () => Promise<void>;
  refreshRoles: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [roles, setRoles] = useState<AppRole[]>([]);
  const [loading, setLoading] = useState(true);
  const queryClient = useQueryClient();
  const rolesChannelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const roleChangeTimerRef = useRef<number | null>(null);
  const explicitSignOutRef = useRef(false);

  /** Heurística: erro de rede (offline / fetch failed) — não devemos sobrescrever state nesse caso. */
  const isNetworkError = (error: any): boolean => {
    if (!error) return false;
    if (typeof navigator !== 'undefined' && navigator.onLine === false) return true;
    const msg = String(error?.message ?? '').toLowerCase();
    return msg.includes('failed to fetch') || msg.includes('networkerror') || msg.includes('load failed');
  };

  const fetchProfile = async (userId: string): Promise<Profile | null> => {
    const { data, error } = await supabase
      .from('profiles')
      .select('id, email, full_name, company_id, phone, avatar_url, status, role')
      .eq('id', userId)
      .maybeSingle();

    if (!error && data) {
      const normalized = normalizeRole((data as any).role) ?? 'agente';
      const next = { ...(data as any), role: normalized } as Profile;
      setProfile(next);
      setTelemetryContext({ userId: next.id, companyId: next.company_id, role: normalized });
      return next;
    }
    // Em falha de rede, preservamos o profile atual para evitar UI rebaixada.
    if (isNetworkError(error)) return profile;
    return null;
  };

  const fetchRoles = async (userId: string) => {
    const { data, error } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', userId);

    if (!error && data) {
      const normalized = data
        .map((r: any) => normalizeRole(r.role))
        .filter((r): r is AppRole => r !== null);
      setRoles(normalized);
      return;
    }
    // Em falha de rede, mantém roles em memória.
  };

  const clearAuthState = () => {
    setSession(null);
    setUser(null);
    setProfile(null);
    setRoles([]);
    setTelemetryContext({ userId: null, companyId: null, role: null });
  };

  const teardownRoleChannels = () => {
    if (rolesChannelRef.current) {
      supabase.removeChannel(rolesChannelRef.current);
      rolesChannelRef.current = null;
    }
    if (roleChangeTimerRef.current) {
      window.clearTimeout(roleChangeTimerRef.current);
      roleChangeTimerRef.current = null;
    }
  };

  const setupRoleChannels = (userId: string) => {
    teardownRoleChannels();

    // Debounce + invalidação focada. Não fazemos invalidateQueries() global
    // para evitar tempestade de refetch a cada UPDATE em user_roles.
    const onRoleChange = () => {
      if (roleChangeTimerRef.current) window.clearTimeout(roleChangeTimerRef.current);
      roleChangeTimerRef.current = window.setTimeout(() => {
        void (async () => {
          await Promise.all([fetchProfile(userId), fetchRoles(userId)]);
          queryClient.invalidateQueries({ queryKey: ['user_roles'] });
        })();
      }, 400);
    };

    // Apenas user_roles. Mudanças em profiles são tratadas pelas queries
    // que dependem do profile — não invalidamos cache global aqui.
    rolesChannelRef.current = supabase
      .channel(`auth-user-roles-${userId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'user_roles', filter: `user_id=eq.${userId}` },
        onRoleChange
      )
      .subscribe();
  };

  const loadAuthenticatedUser = async (nextSession: Session | null) => {
    if (!nextSession?.user) {
      teardownRoleChannels();
      clearAuthState();
      return;
    }

    // Trust the session from Supabase SDK — avoid an extra network round-trip to /auth/v1/user.
    setSession(nextSession);
    setUser(nextSession.user);

    const userId = nextSession.user.id;
    const [prof] = await Promise.all([fetchProfile(userId), fetchRoles(userId)]);
    setupRoleChannels(userId);

    // Bootstrap company em background — não bloqueia o primeiro paint do dashboard.
    if (prof && !prof.company_id) {
      void (async () => {
        try {
          const { data: bootstrap } = await supabase.functions.invoke('bootstrap-company-for-user');
          if ((bootstrap as any)?.created) {
            await Promise.all([fetchProfile(userId), fetchRoles(userId)]);
          }
        } catch {
          // Silent — user pode tentar de novo em qualquer reload.
        }
      })();
    }
  };

  useEffect(() => {
    let cancelled = false;

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        // TOKEN_REFRESHED only rotates JWT — just update session, skip refetching profile/roles.
        if (event === 'TOKEN_REFRESHED') {
          setSession(session);
          return;
        }
        if (event === 'SIGNED_OUT') {
          // Se foi um SIGNED_OUT transiente (refresh falhando offline e não foi
          // o usuário clicando em "Sair"), preservamos profile/roles em memória
          // para evitar rebaixar a UI. A sessão real é re-hidratada ao voltar online.
          const offline = typeof navigator !== 'undefined' && navigator.onLine === false;
          if (!explicitSignOutRef.current && offline) {
            setSession(null);
            if (!cancelled) setLoading(false);
            return;
          }
          explicitSignOutRef.current = false;
          photoQueue.clear();
        }
        setTimeout(() => {
          void (async () => {
            if (cancelled) return;
            try {
              await loadAuthenticatedUser(session);
              if (event === 'SIGNED_IN' && session?.user?.id) {
                const pending = consumePendingOAuthConsent();
                if (pending) {
                  await recordTermsConsent(session.user.id, 'oauth');
                }
              }
            } finally {
              if (!cancelled) setLoading(false);
            }
          })();
        }, 0);
      }
    );

    // onAuthStateChange fires INITIAL_SESSION on subscribe — no separate getSession() needed.

    // Re-hidrata profile/roles ao voltar online: cobre o caso em que perdemos
    // a conexão e o Supabase não disparou nenhum evento.
    const handleOnline = () => {
      const uid = session?.user?.id;
      if (!uid) return;
      void Promise.all([fetchProfile(uid), fetchRoles(uid)]).catch(() => {});
    };
    window.addEventListener('online', handleOnline);

    return () => {
      cancelled = true;
      subscription.unsubscribe();
      teardownRoleChannels();
      window.removeEventListener('online', handleOnline);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const signIn = async (email: string, password: string) => {
    const { error, data } = await supabase.auth.signInWithPassword({ email, password });
    if (error) return { error };

    if (data.user) {
      const { data: profileData } = await supabase
        .from('profiles')
        .select('is_active')
        .eq('id', data.user.id)
        .maybeSingle();

      if (profileData && profileData.is_active === false) {
        await supabase.auth.signOut();
        return { error: new Error('Sua conta foi desativada. Entre em contato com o administrador.') };
      }
    }
    return { error: null };
  };

  const signUp = async (email: string, password: string, fullName: string) => {
    const redirectUrl = `${window.location.origin}/`;
    const { error, data } = await supabase.auth.signUp({
      email,
      password,
      options: { emailRedirectTo: redirectUrl, data: { full_name: fullName } },
    });
    return { error, data: data ? { user: data.user } : null };
  };

  const signOut = async () => {
    explicitSignOutRef.current = true;
    teardownRoleChannels();
    photoQueue.clear();
    await supabase.auth.signOut();
    setProfile(null);
    setRoles([]);
  };

  const refreshProfile = async () => {
    if (user?.id) await fetchProfile(user.id);
  };

  const refreshRoles = async () => {
    if (user?.id) await Promise.all([fetchProfile(user.id), fetchRoles(user.id)]);
  };

  const effectiveRole = pickHighestRole([...roles, profile?.role]);

  const isMaster = roleIsMaster(effectiveRole);
  const isAdmin = roleIsAdmin(effectiveRole);
  const isManager = roleIsManager(effectiveRole);
  const isFinance = roleIsFinance(effectiveRole);
  const isAgent = roleIsAgent(effectiveRole);
  const isCompanyAdmin = isMaster || isAdmin;
  const canManage = roleCanManage(effectiveRole);
  const canReadAll = roleCanReadAll(effectiveRole);

  return (
    <AuthContext.Provider
      value={{
        user,
        session,
        profile,
        roles,
        effectiveRole,
        loading,
        signIn,
        signUp,
        signOut,
        isMaster,
        isAdmin,
        isManager,
        isFinance,
        isAgent,
        isCompanyAdmin,
        canManage,
        canReadAll,
        refreshProfile,
        refreshRoles,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
