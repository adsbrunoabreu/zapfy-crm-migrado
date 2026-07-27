import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

/**
 * Força refresh agressivo das queries do chat sempre que:
 *  - a aba volta a ficar visível
 *  - a conexão de internet volta (online)
 *  - o usuário faz login (SIGNED_IN) ou o token é renovado (TOKEN_REFRESHED)
 */
export function useChatAutoRefresh() {
  const qc = useQueryClient();

  useEffect(() => {
    const refreshAll = () => {
      qc.invalidateQueries({ queryKey: ['conversations'] });
      qc.invalidateQueries({ queryKey: ['chat-messages'] });
      qc.invalidateQueries({ queryKey: ['unread-conversations-count'] });
      qc.invalidateQueries({ queryKey: ['archived-conversations-count'] });
      qc.invalidateQueries({ queryKey: ['attendance-tickets'] });
      qc.invalidateQueries({ queryKey: ['conversation-ai-state'] });
    };

    const onOnline = () => refreshAll();
    const onVisible = () => {
      if (document.visibilityState === 'visible') refreshAll();
    };

    window.addEventListener('online', onOnline);
    document.addEventListener('visibilitychange', onVisible);

    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
        refreshAll();
      }
    });

    return () => {
      window.removeEventListener('online', onOnline);
      document.removeEventListener('visibilitychange', onVisible);
      sub.subscription.unsubscribe();
    };
  }, [qc]);
}
