import { useEffect, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { evolutionApi } from '@/services/evolutionApi';

interface PresencePayload {
  remote_jid?: string;
  presence?: string;
  timestamp?: string;
}

const TYPING_TTL_MS = 5000;          // composing/recording explícitos: 5s
const HEURISTIC_TTL_MS = 3000;       // fallback inferido: 3s
const RECENT_OUTGOING_WINDOW_MS = 60_000; // só inferir digitação até 60s após msg nossa

/**
 * Indica se o contato está digitando.
 *
 * Caminho ideal (Evolution emite PRESENCE_UPDATE com 'composing' / 'recording'):
 *   → mostra "digitando..." por 5s, renovado a cada evento.
 *
 * Fallback heurístico (alguns devices só emitem 'available' / 'unavailable'):
 *   → se o contato fica 'available' depois que NÓS enviamos algo recentemente
 *     (até 60s atrás) e ainda não respondeu, inferimos digitação por 3s.
 *   → qualquer mensagem recebida limpa imediatamente o estado.
 *
 * Passe `lastOutgoingAt` (ms epoch) para ativar o fallback. Sem ele só o
 * caminho explícito funciona.
 */
export function useChatPresence(
  companyId: string | undefined,
  remoteJid: string | undefined,
  opts?: { lastOutgoingAt?: number | null; lastIncomingAt?: number | null },
) {
  const [isContactTyping, setIsContactTyping] = useState(false);
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout>>();
  const lastOutgoingAtRef = useRef<number | null>(opts?.lastOutgoingAt ?? null);
  const lastIncomingAtRef = useRef<number | null>(opts?.lastIncomingAt ?? null);

  // Mantém refs sincronizadas sem reabrir canal.
  useEffect(() => {
    lastOutgoingAtRef.current = opts?.lastOutgoingAt ?? null;
  }, [opts?.lastOutgoingAt]);
  useEffect(() => {
    lastIncomingAtRef.current = opts?.lastIncomingAt ?? null;
    // Mensagem chegou → contato terminou de digitar.
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
      typingTimeoutRef.current = undefined;
    }
    setIsContactTyping(false);
  }, [opts?.lastIncomingAt]);

  useEffect(() => {
    if (!companyId || !remoteJid) return;

    // Pede ao Baileys/Evolution para começar a emitir PRESENCE_UPDATE deste contato.
    const numberOnly = remoteJid.split('@')[0];
    if (numberOnly) {
      evolutionApi.subscribePresence(numberOnly).catch(() => {});
    }

    const armTyping = (ttlMs: number) => {
      setIsContactTyping(true);
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
      typingTimeoutRef.current = setTimeout(() => setIsContactTyping(false), ttlMs);
    };

    const handlePresence = (data: PresencePayload, opts2?: { fromWildcard?: boolean }) => {
      const presence = data?.presence;
      const explicit = presence === 'composing' || presence === 'recording';

      // Canal específico + composing/recording = certeza, mostra direto.
      if (explicit && !opts2?.fromWildcard) {
        armTyping(TYPING_TTL_MS);
        return;
      }

      // Heurística: presença vinda do canal wildcard (JID @lid não mapeável)
      // ou 'available' no canal específico. Só infere "digitando" se acabamos
      // de enviar algo e o contato ainda não respondeu.
      if (presence === 'composing' || presence === 'recording' || presence === 'available') {
        const out = lastOutgoingAtRef.current;
        const inc = lastIncomingAtRef.current;
        if (!out) return;
        if (Date.now() - out > RECENT_OUTGOING_WINDOW_MS) return;
        if (inc && inc > out) return;
        armTyping(HEURISTIC_TTL_MS);
        return;
      }

      if (presence === 'unavailable' || presence === 'paused') {
        if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
        setIsContactTyping(false);
      }
    };

    const specific = supabase
      .channel(`presence-${companyId}-${remoteJid}`)
      .on('broadcast', { event: 'typing' }, (payload: { payload: PresencePayload }) => {
        if (payload.payload?.remote_jid !== remoteJid) return;
        handlePresence(payload.payload);
      })
      .subscribe();

    // Wildcard por empresa: captura presenças cujo JID vem como @lid e não
    // bate com a conversa. Aplica heurística (lastOutgoingAt recente).
    const wildcard = supabase
      .channel(`presence-${companyId}`)
      .on('broadcast', { event: 'typing' }, (payload: { payload: PresencePayload }) => {
        if (payload.payload?.remote_jid === remoteJid) return;
        handlePresence(payload.payload, { fromWildcard: true });
      })
      .subscribe();

    return () => {
      supabase.removeChannel(specific);
      supabase.removeChannel(wildcard);
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    };
  }, [companyId, remoteJid]);

  return { isContactTyping };
}
