import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, ReactNode } from 'react';

/**
 * Contexto que coordena a reprodução em fila dos áudios visíveis no chat.
 *
 * Cada AudioPlayer se registra ao montar (informando seu messageId, ordem cronológica
 * e um `play()` callback). Quando um áudio termina, o contexto encontra o próximo
 * registrado (mais recente em ordem cronológica do que o que acabou) e chama seu `play()`.
 *
 * Apenas um áudio pode tocar por vez — quando um começa a tocar, todos os outros são pausados.
 */

type Entry = {
  id: string;
  /** Timestamp/ordinal usado para ordenar a fila (ex.: ms da mensagem) */
  order: number;
  play: () => void;
  pause: () => void;
};

interface AudioQueueContextValue {
  register: (entry: Entry) => () => void;
  /** Marca este id como tocando agora — pausa os outros */
  notifyPlay: (id: string) => void;
  /** Chamado quando o áudio termina — toca o próximo da fila, se houver */
  notifyEnded: (id: string) => void;
  /** id atualmente tocando, se houver */
  currentId: string | null;
}

const AudioQueueContext = createContext<AudioQueueContextValue | null>(null);

export function AudioQueueProvider({ children }: { children: ReactNode }) {
  const entriesRef = useRef<Map<string, Entry>>(new Map());
  const [currentId, setCurrentId] = useState<string | null>(null);

  const register = useCallback((entry: Entry) => {
    entriesRef.current.set(entry.id, entry);
    return () => {
      entriesRef.current.delete(entry.id);
    };
  }, []);

  const notifyPlay = useCallback((id: string) => {
    setCurrentId(id);
    // pausa todos os outros
    entriesRef.current.forEach((e, key) => {
      if (key !== id) e.pause();
    });
  }, []);

  const notifyEnded = useCallback((id: string) => {
    const ended = entriesRef.current.get(id);
    if (!ended) {
      setCurrentId((prev) => (prev === id ? null : prev));
      return;
    }
    // próximo = menor `order` que seja maior que o atual
    let next: Entry | null = null;
    entriesRef.current.forEach((e) => {
      if (e.id === id) return;
      if (e.order > ended.order && (!next || e.order < next.order)) {
        next = e;
      }
    });
    setCurrentId(null);
    if (next) {
      // pequeno delay para o estado do player anterior assentar
      setTimeout(() => (next as Entry).play(), 50);
    }
  }, []);

  const value = useMemo<AudioQueueContextValue>(
    () => ({ register, notifyPlay, notifyEnded, currentId }),
    [register, notifyPlay, notifyEnded, currentId]
  );

  return <AudioQueueContext.Provider value={value}>{children}</AudioQueueContext.Provider>;
}

export function useAudioQueue() {
  return useContext(AudioQueueContext);
}

/** Hook helper para registrar um player na fila */
export function useAudioQueueRegistration(
  id: string | undefined,
  order: number,
  handlers: { play: () => void; pause: () => void }
) {
  const ctx = useAudioQueue();
  // mantemos handlers atuais sem re-registrar a cada render
  const handlersRef = useRef(handlers);
  useEffect(() => {
    handlersRef.current = handlers;
  });

  useEffect(() => {
    if (!ctx || !id) return;
    return ctx.register({
      id,
      order,
      play: () => handlersRef.current.play(),
      pause: () => handlersRef.current.pause(),
    });
  }, [ctx, id, order]);

  return ctx;
}
