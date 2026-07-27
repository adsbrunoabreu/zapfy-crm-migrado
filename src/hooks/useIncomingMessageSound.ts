import { useEffect, useRef } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useRealtime } from '@/contexts/RealtimeContext';
import { getSoundPreferences } from '@/hooks/useSoundPreferences';
import { getActiveConversationId } from '@/hooks/useActiveConversation';

/**
 * Toca um sinal sonoro curto (estilo WhatsApp) sempre que uma nova
 * mensagem recebida (from_me=false) chega via realtime.
 *
 * - O AudioContext é criado no mount; só o resume() exige gesto do usuário.
 * - playWhatsappPing aguarda ctx.resume() (assíncrono) antes de agendar tons.
 */
export function useIncomingMessageSound() {
  const { profile, user } = useAuth();
  const companyId = profile?.company_id;
  const audioCtxRef = useRef<AudioContext | null>(null);
  const lastPlayedRef = useRef<number>(0);
  const startTimeRef = useRef<number>(Date.now());

  useEffect(() => {
    try {
      const Ctx =
        (window as any).AudioContext || (window as any).webkitAudioContext;
      if (Ctx && !audioCtxRef.current) {
        audioCtxRef.current = new Ctx();
      }
    } catch {
      // ignore
    }

    const tryResume = () => {
      const ctx = audioCtxRef.current;
      if (ctx && ctx.state === 'suspended') {
        ctx.resume().catch(() => {});
      }
    };

    const events: (keyof WindowEventMap)[] = [
      'click',
      'keydown',
      'touchstart',
      'pointerdown',
      'mousedown',
    ];
    events.forEach((e) =>
      window.addEventListener(e, tryResume, { passive: true })
    );
    return () => {
      events.forEach((e) => window.removeEventListener(e, tryResume));
    };
  }, []);

  const playWhatsappPing = async () => {
    const prefs = getSoundPreferences();
    if (!prefs.enabled) return;

    const now = Date.now();
    if (now - lastPlayedRef.current < 1500) return;
    lastPlayedRef.current = now;

    let ctx = audioCtxRef.current;
    if (!ctx) {
      try {
        const Ctx =
          (window as any).AudioContext || (window as any).webkitAudioContext;
        if (Ctx) {
          ctx = new Ctx();
          audioCtxRef.current = ctx;
        }
      } catch {
        // ignore
      }
    }
    if (!ctx) return;

    const v = Math.max(0, Math.min(1, prefs.volume));

    try {
      if (ctx.state === 'suspended') {
        try {
          await ctx.resume();
        } catch {
          return;
        }
      }
      if (ctx.state !== 'running') return;

      const t0 = ctx.currentTime + 0.01;

      const playTone = (
        startAt: number,
        freq: number,
        duration: number,
        gain: number
      ) => {
        const osc = ctx!.createOscillator();
        const g = ctx!.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, startAt);
        g.gain.setValueAtTime(0, startAt);
        g.gain.linearRampToValueAtTime(gain, startAt + 0.012);
        g.gain.exponentialRampToValueAtTime(0.0001, startAt + duration);
        osc.connect(g);
        g.connect(ctx!.destination);
        osc.start(startAt);
        osc.stop(startAt + duration + 0.02);
      };

      playTone(t0, 1320, 0.13, 0.18 * v);
      playTone(t0 + 0.11, 990, 0.16, 0.16 * v);
    } catch {
      // ignore
    }
  };

  const realtime = useRealtime();

  useEffect(() => {
    if (!companyId) return;

    const unsubscribe = realtime.subscribeAllChatMessages({
      onInsert: (row) => {
        const m = row as {
          from_me?: boolean;
          timestamp?: string;
          created_at?: string;
          conversation_id?: string;
        };
        if (!m || m.from_me) return;

        const ts = new Date(m.timestamp || m.created_at || Date.now()).getTime();
        if (ts < startTimeRef.current - 5_000) return;

        const prefs = getSoundPreferences();
        if (prefs.playWhen === 'unfocused') {
          const tabFocused =
            typeof document !== 'undefined' &&
            document.visibilityState === 'visible' &&
            (typeof document.hasFocus !== 'function' || document.hasFocus());
          const activeId = getActiveConversationId();
          const sameConversationOpen =
            !!activeId && !!m.conversation_id && activeId === m.conversation_id;
          if (tabFocused && sameConversationOpen) return;
        }

        void playWhatsappPing();
      },
    });

    return unsubscribe;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyId, user?.id, realtime]);
}
