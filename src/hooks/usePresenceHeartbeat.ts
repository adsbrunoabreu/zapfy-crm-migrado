/**
 * usePresenceHeartbeat
 * --------------------
 * Mantém `profiles.is_online`/`last_seen` atualizado para o usuário logado.
 *
 * - Heartbeat a cada 45s (sweep do banco roda em 2min, margem confortável).
 * - Pausa quando a aba está oculta; re-dispara imediatamente ao voltar.
 * - Marca offline em `pagehide` / `beforeunload` (fire-and-forget) e no
 *   `SIGNED_OUT` do Supabase Auth.
 */
import { useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

const HEARTBEAT_MS = 45_000;

export function usePresenceHeartbeat() {
  const { profile } = useAuth();
  const userId = profile?.id ?? null;

  useEffect(() => {
    if (!userId) return;

    let cancelled = false;
    let interval: number | null = null;

    const beat = async () => {
      if (cancelled) return;
      try {
        await supabase.rpc('presence_heartbeat');
      } catch (e) {
        // silencioso — próximo tick tenta de novo
        console.warn('[presence] heartbeat failed', e);
      }
    };

    const setOffline = () => {
      // fire-and-forget; não esperamos a promise
      try { supabase.rpc('presence_set_offline'); } catch { /* noop */ }
    };

    const startInterval = () => {
      if (interval !== null) return;
      interval = window.setInterval(beat, HEARTBEAT_MS);
    };
    const stopInterval = () => {
      if (interval !== null) {
        window.clearInterval(interval);
        interval = null;
      }
    };

    // Boot: bate uma vez e começa o ciclo se a aba está visível.
    beat();
    if (typeof document === 'undefined' || document.visibilityState === 'visible') {
      startInterval();
    }

    const onVisibility = () => {
      if (document.visibilityState === 'visible') {
        beat();
        startInterval();
      } else {
        stopInterval();
      }
    };
    const onPageHide = () => { setOffline(); };
    const onBeforeUnload = () => { setOffline(); };

    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('pagehide', onPageHide);
    window.addEventListener('beforeunload', onBeforeUnload);

    // Reage ao logout/refresh para manter o servidor coerente.
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_OUT') {
        setOffline();
        stopInterval();
      } else if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
        beat();
        startInterval();
      }
    });

    return () => {
      cancelled = true;
      stopInterval();
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('pagehide', onPageHide);
      window.removeEventListener('beforeunload', onBeforeUnload);
      subscription.unsubscribe();
      // Ao desmontar (ex.: troca de usuário), marca offline.
      setOffline();
    };
  }, [userId]);
}
