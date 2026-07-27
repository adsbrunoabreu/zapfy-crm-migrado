import { useCallback, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { evolutionApi } from '@/services/evolutionApi';
import { logChatEvent } from '@/lib/chat-telemetry';
import { uploadFileWithProgress } from '@/lib/uploadFileWithProgress';
import { extractFunctionErrorAsync } from '@/lib/edgeError';
import type { ChatMessage } from '@/hooks/useChatMessages';
import type { ChatActionsBase } from './types';

interface Args extends ChatActionsBase {
  setSending: (v: boolean) => void;
}

const ENQUEUE_TIMEOUT_MS = 15_000;
const WAVE_BUFFER_SIZE = 60;

export function useAudioRecording(args: Args) {
  const {
    conversation, companyId, isEvolutionConversation,
    ensureTicketReopened, addOptimisticMessage, replaceCachedMessage,
    patchConversationLocally, setSending,
  } = args;
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [isRecording, setIsRecording] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [audioLevels, setAudioLevels] = useState<number[]>([]);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const rafRef = useRef<number | null>(null);
  const recordingTimerRef = useRef<ReturnType<typeof setInterval>>();
  const recordingCanceledRef = useRef(false);
  const sendOnStopRef = useRef(false);
  const levelsRef = useRef<number[]>([]);
  const lastSampleAtRef = useRef(0);

  const stopTimers = useCallback(() => {
    if (recordingTimerRef.current) {
      clearInterval(recordingTimerRef.current);
      recordingTimerRef.current = undefined;
    }
    if (rafRef.current != null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
  }, []);

  const teardownAudio = useCallback(() => {
    stopTimers();
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    }
    if (audioCtxRef.current) {
      audioCtxRef.current.close().catch(() => undefined);
      audioCtxRef.current = null;
    }
    analyserRef.current = null;
  }, [stopTimers]);

  const resetRecordingState = useCallback(() => {
    setIsRecording(false);
    setIsPaused(false);
    setRecordingTime(0);
    setAudioLevels([]);
    levelsRef.current = [];
    mediaRecorderRef.current = null;
  }, []);

  const startSampling = useCallback(() => {
    const tick = () => {
      const analyser = analyserRef.current;
      if (!analyser) return;
      const now = performance.now();
      // Amostra a ~30fps.
      if (now - lastSampleAtRef.current >= 33) {
        lastSampleAtRef.current = now;
        const buf = new Uint8Array(analyser.fftSize);
        analyser.getByteTimeDomainData(buf);
        let sum = 0;
        for (let i = 0; i < buf.length; i++) {
          const v = (buf[i] - 128) / 128;
          sum += v * v;
        }
        const rms = Math.sqrt(sum / buf.length);
        // Normaliza/amplifica para a UI (clamp 0-1).
        const level = Math.min(1, rms * 2.2);
        const next = levelsRef.current.concat(level);
        if (next.length > WAVE_BUFFER_SIZE) next.splice(0, next.length - WAVE_BUFFER_SIZE);
        levelsRef.current = next;
        setAudioLevels(next);
      }
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
  }, []);

  const cancelRecording = useCallback(() => {
    const recorder = mediaRecorderRef.current;
    if (!recorder) return;
    recordingCanceledRef.current = true;
    sendOnStopRef.current = false;
    try { recorder.stop(); } catch { /* ignore */ }
    teardownAudio();
    resetRecordingState();
    toast({ title: 'Gravação cancelada' });
  }, [teardownAudio, resetRecordingState, toast]);

  const pauseRecording = useCallback(() => {
    const recorder = mediaRecorderRef.current;
    if (!recorder || recorder.state !== 'recording') return;
    try { recorder.pause(); } catch { /* ignore */ }
    stopTimers();
    setIsPaused(true);
  }, [stopTimers]);

  const resumeRecording = useCallback(() => {
    const recorder = mediaRecorderRef.current;
    if (!recorder || recorder.state !== 'paused') return;
    try { recorder.resume(); } catch { /* ignore */ }
    setIsPaused(false);
    recordingTimerRef.current = setInterval(() => setRecordingTime(t => t + 1), 1000);
    startSampling();
  }, [startSampling]);

  const stopAndSendRecording = useCallback(() => {
    const recorder = mediaRecorderRef.current;
    if (!recorder) return;
    sendOnStopRef.current = true;
    recordingCanceledRef.current = false;
    try { recorder.stop(); } catch { /* ignore */ }
    // O onstop cuida do upload e do teardown. UI volta para idle imediatamente.
    stopTimers();
    setIsRecording(false);
    setIsPaused(false);
  }, [stopTimers]);

  const toggleRecording = useCallback(async () => {
    if (!isEvolutionConversation) {
      toast({ title: 'Áudio indisponível', description: 'Gravação de áudio ainda não está disponível na Cloud API.', variant: 'destructive' });
      return;
    }
    if (mediaRecorderRef.current) {
      // Se já está gravando, o clique no microfone passa a ser um no-op
      // (UI controla envio/pausa/cancel). Mantemos como segurança.
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = MediaRecorder.isTypeSupported('audio/ogg; codecs=opus')
        ? 'audio/ogg; codecs=opus'
        : MediaRecorder.isTypeSupported('audio/webm; codecs=opus')
          ? 'audio/webm; codecs=opus'
          : 'audio/webm';

      const recorder = new MediaRecorder(stream, { mimeType });
      const chunks: Blob[] = [];
      recordingCanceledRef.current = false;
      sendOnStopRef.current = false;
      streamRef.current = stream;
      mediaRecorderRef.current = recorder;

      // Setup do analisador para o waveform.
      try {
        const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        const ctx = new Ctx();
        audioCtxRef.current = ctx;
        const source = ctx.createMediaStreamSource(stream);
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 256;
        source.connect(analyser);
        analyserRef.current = analyser;
      } catch {
        // Sem waveform se falhar; gravação segue funcionando.
      }

      recorder.ondataavailable = (e) => { if (e.data && e.data.size > 0) chunks.push(e.data); };
      recorder.onstop = async () => {
        const shouldSend = sendOnStopRef.current;
        const wasCanceled = recordingCanceledRef.current;
        sendOnStopRef.current = false;
        recordingCanceledRef.current = false;
        teardownAudio();
        resetRecordingState();

        if (wasCanceled || !shouldSend) return;
        if (!(await ensureTicketReopened())) return;

        const audioBlob = new Blob(chunks, { type: mimeType });
        if (audioBlob.size === 0) return;
        const normalizedMime = mimeType.split(';')[0].trim() || 'audio/ogg';
        const audioFile = new File([audioBlob], `audio-${Date.now()}.${normalizedMime.includes('ogg') ? 'ogg' : 'webm'}`, { type: normalizedMime });

        const clientId = crypto.randomUUID();
        const optimisticId = `optimistic-${clientId}`;
        const now = new Date().toISOString();
        const localUrl = URL.createObjectURL(audioBlob);
        const optimistic: ChatMessage = {
          id: optimisticId,
          company_id: companyId || '',
          conversation_id: conversation.id,
          remote_jid: conversation.remote_jid,
          message_id: optimisticId,
          client_id: clientId,
          from_me: true,
          message_type: 'audio',
          content: '',
          media_url: localUrl,
          media_mimetype: normalizedMime,
          file_name: null,
          duration: null,
          latitude: null,
          longitude: null,
          quoted_message_id: null,
          reaction_emoji: null,
          status: 'sending',
          sender_name: null,
          timestamp: now,
          created_at: now,
        };
        addOptimisticMessage(optimistic);
        patchConversationLocally(conversation.id, { last_message_text: '[Áudio]', last_message_at: now, closed_at: null, unread_count: 0 });
        setSending(true);
        try {
          const safeName = audioFile.name;
          const storagePath = `${companyId}/outgoing/${Date.now()}-${crypto.randomUUID()}-${safeName}`;
          const { signedUrl } = await uploadFileWithProgress({ bucket: 'chat-media', path: storagePath, file: audioFile });

          let timer: ReturnType<typeof setTimeout> | undefined;
          const timeoutPromise = new Promise<never>((_, reject) => {
            timer = setTimeout(() => reject(new Error('enqueue_timeout')), ENQUEUE_TIMEOUT_MS);
          });
          const invokePromise = supabase.functions.invoke('enqueue-outbound-message', {
            body: {
              client_id: clientId,
              conversation_id: conversation.id,
              provider: 'evolution',
              payload: {
                kind: 'audio',
                media: { url: signedUrl, mimeType: normalizedMime, fileName: audioFile.name },
              },
            },
          });
          try {
            const { error } = await Promise.race([invokePromise, timeoutPromise]) as { error: { message?: string } | null };
            if (error) {
              const detail = await extractFunctionErrorAsync(error);
              throw new Error(detail);
            }
            replaceCachedMessage(optimisticId, { ...optimistic, media_url: signedUrl, status: 'queued' });
            void (supabase as any).rpc('mark_conversation_read', { _conversation_id: conversation.id });
          } finally {
            if (timer) clearTimeout(timer);
          }
        } catch (err) {
          const error = err as { context?: { error?: string }; message?: string };
          replaceCachedMessage(optimisticId, { ...optimistic, status: 'failed' });
          queryClient.invalidateQueries({ queryKey: ['conversations', companyId, 'active'] });
          const detail = error?.context?.error || error?.message || 'Não foi possível enviar o áudio.';
          toast({ title: 'Erro ao enviar áudio', description: String(detail).slice(0, 200), variant: 'destructive' });
          void logChatEvent({
            companyId, event: 'send_audio_failed', message: String(detail).slice(0, 300),
            metadata: { conversation_id: conversation.id, mime_type: mimeType, client_id: clientId },
          });
        } finally {
          setSending(false);
          setTimeout(() => URL.revokeObjectURL(localUrl), 5000);
        }
      };

      recorder.start();
      setIsRecording(true);
      setIsPaused(false);
      setRecordingTime(0);
      setAudioLevels([]);
      levelsRef.current = [];
      lastSampleAtRef.current = 0;
      recordingTimerRef.current = setInterval(() => setRecordingTime(t => t + 1), 1000);
      startSampling();
      if (isEvolutionConversation) evolutionApi.sendPresence(conversation.phone, 'recording').catch(console.error);
    } catch {
      teardownAudio();
      resetRecordingState();
      toast({ title: 'Erro no microfone', description: 'Não foi possível acessar o microfone.', variant: 'destructive' });
    }
  }, [
    isEvolutionConversation, ensureTicketReopened, companyId,
    conversation.id, conversation.remote_jid, conversation.phone,
    addOptimisticMessage, patchConversationLocally, replaceCachedMessage,
    queryClient, toast, setSending, teardownAudio, resetRecordingState, startSampling,
  ]);

  return {
    isRecording,
    isPaused,
    recordingTime,
    audioLevels,
    toggleRecording,
    cancelRecording,
    pauseRecording,
    resumeRecording,
    stopAndSendRecording,
  };
}
