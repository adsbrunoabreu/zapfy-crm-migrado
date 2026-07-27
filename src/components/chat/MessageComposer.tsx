import { memo, useCallback, useRef, useState, useEffect, useLayoutEffect, type RefObject, type MutableRefObject } from 'react';
import { Send, Paperclip, Mic, X, Trash2, Pause, Play } from 'lucide-react';
import { RecordingWaveform } from '@/components/chat/RecordingWaveform';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { EmojiPickerPopover } from '@/components/chat/EmojiPickerPopover';
import HsmTemplatePopover from '@/components/chat/HsmTemplatePopover';
import { QuickReplyPopover } from '@/components/chat/QuickReplyPopover';
import { evolutionApi } from '@/services/evolutionApi';
import { cn } from '@/lib/utils';
import { safeStorage } from '@/lib/safeStorage';
import type { ChatMessage } from '@/hooks/useChatMessages';
import type { Conversation } from '@/hooks/useConversations';
import type { InstanceMeta } from '@/hooks/useInstances';
import type { QuickReply } from '@/hooks/useAttendanceSettings';

interface Props {
  conversation: Conversation;
  currentInstance: InstanceMeta | null | undefined;
  isEvolutionConversation: boolean;
  sending: boolean;
  isRecording: boolean;
  isPaused: boolean;
  recordingTime: number;
  audioLevels: number[];
  quotedMessage: ChatMessage | null;
  setQuotedMessage: (m: ChatMessage | null) => void;
  quickReplies: QuickReply[];
  inputRef: RefObject<HTMLTextAreaElement>;
  fileInputRef: RefObject<HTMLInputElement>;
  ensureTicketReopened: () => Promise<boolean>;
  onSend: (text: string) => void | Promise<void>;
  onIncomingFile: (file: File) => void;
  onIncomingFiles?: (files: File[]) => void;
  onToggleRecording: () => void;
  onCancelRecording: () => void;
  onPauseRecording: () => void;
  onResumeRecording: () => void;
  onStopAndSendRecording: () => void;
  onComposerFocus?: () => void;
  restoreTextRef?: MutableRefObject<((text: string) => void) | null>;
  insertTextRef?: MutableRefObject<((text: string) => void) | null>;
}

const SINGLE_LINE_HEIGHT = 40;
const MAX_HEIGHT = 160;

const isDebugChat = () => safeStorage.get('debugChat') === '1';

function MessageComposerImpl(props: Props) {
  const {
    conversation, currentInstance, isEvolutionConversation,
    sending, isRecording, isPaused, recordingTime, audioLevels,
    quotedMessage, setQuotedMessage, quickReplies,
    inputRef, fileInputRef,
    ensureTicketReopened, onSend, onIncomingFile, onIncomingFiles,
    onToggleRecording, onCancelRecording,
    onPauseRecording, onResumeRecording, onStopAndSendRecording,
    onComposerFocus, restoreTextRef, insertTextRef,
  } = props;

  // Controlled state — cursor/foco gerenciados pelo React.
  const [text, setText] = useState('');
  const [isMultiline, setIsMultiline] = useState(false);
  const [quickOpen, setQuickOpen] = useState(false);
  const [quickQuery, setQuickQuery] = useState('');
  const cursorTargetRef = useRef<number | null>(null);

  // Instrumentação opcional para debug do input.
  const setTextWithDebug = useCallback((value: string) => {
    if (value === '' && isDebugChat()) {
      // eslint-disable-next-line no-console
      console.trace('[MessageComposer] setText(\"\") trace:');
    }
    setText(value);
  }, []);

  // Permite ao pai restaurar o texto após falha de envio.
  useEffect(() => {
    if (!restoreTextRef) return;
    restoreTextRef.current = (value: string) => {
      cursorTargetRef.current = value.length;
      setTextWithDebug(value);
      requestAnimationFrame(() => inputRef.current?.focus());
    };
    return () => {
      if (restoreTextRef) restoreTextRef.current = null;
    };
  }, [restoreTextRef, inputRef]);

  const hasText = text.trim().length > 0;

  // Auto-resize via rAF — evita reflow síncrono por tecla.
  const rafRef = useRef<number | null>(null);
  const autoResize = useCallback(() => {
    if (rafRef.current !== null) return;
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = null;
      const el = inputRef.current;
      if (!el) return;
      el.style.height = 'auto';
      const next = Math.min(el.scrollHeight, MAX_HEIGHT);
      el.style.height = next + 'px';
      setIsMultiline((prev) => {
        const multi = next > SINGLE_LINE_HEIGHT + 4;
        return prev === multi ? prev : multi;
      });
    });
  }, [inputRef]);

  useLayoutEffect(() => {
    autoResize();
    if (cursorTargetRef.current !== null && inputRef.current) {
      const pos = cursorTargetRef.current;
      cursorTargetRef.current = null;
      try {
        inputRef.current.setSelectionRange(pos, pos);
      } catch {
        // textarea pode não estar pronto
      }
    }
  }, [text, autoResize, inputRef]);

  useEffect(() => () => {
    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
  }, []);

  // Quick replies "/comando".
  const detectQuickQuery = (value: string): string | null => {
    const trimmed = value.trimStart();
    if (!trimmed.startsWith('/')) return null;
    if (/\s/.test(trimmed)) return null;
    return trimmed;
  };

  useEffect(() => {
    const q = detectQuickQuery(text);
    if (q !== null && quickReplies.length > 0) {
      setQuickOpen(true);
      setQuickQuery(q);
    } else if (quickOpen) {
      setQuickOpen(false);
      setQuickQuery('');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text, quickReplies.length]);

  // Presence (composing/paused) com throttle — evita rajada de POSTs ao evolution-proxy
  // a cada tecla. 'composing' no máximo 1x a cada 8s; 'paused' 3s após última tecla.
  const lastComposingAtRef = useRef(0);
  const pausedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wasTypingRef = useRef(false);
  const phoneRef = useRef(conversation.phone);
  useEffect(() => { phoneRef.current = conversation.phone; }, [conversation.phone]);

  useEffect(() => {
    if (!isEvolutionConversation) return;
    const phone = phoneRef.current;

    if (text.length === 0) {
      if (wasTypingRef.current) {
        wasTypingRef.current = false;
        lastComposingAtRef.current = 0;
        if (pausedTimerRef.current) {
          clearTimeout(pausedTimerRef.current);
          pausedTimerRef.current = null;
        }
        evolutionApi.sendPresence(phone, 'paused').catch(() => {});
      }
      return;
    }

    const now = Date.now();
    if (now - lastComposingAtRef.current > 8000) {
      lastComposingAtRef.current = now;
      wasTypingRef.current = true;
      evolutionApi.sendPresence(phone, 'composing').catch(() => {});
    }

    if (pausedTimerRef.current) clearTimeout(pausedTimerRef.current);
    pausedTimerRef.current = setTimeout(() => {
      pausedTimerRef.current = null;
      wasTypingRef.current = false;
      lastComposingAtRef.current = 0;
      evolutionApi.sendPresence(phoneRef.current, 'paused').catch(() => {});
    }, 3000);
  }, [text, isEvolutionConversation]);

  // Cleanup ao desmontar / trocar conversa
  useEffect(() => {
    return () => {
      if (pausedTimerRef.current) {
        clearTimeout(pausedTimerRef.current);
        pausedTimerRef.current = null;
      }
      if (wasTypingRef.current) {
        wasTypingRef.current = false;
        evolutionApi.sendPresence(phoneRef.current, 'paused').catch(() => {});
      }
    };
  }, [conversation.id]);

  const sendingRef = useRef(false);
  const handleSend = async () => {
    if (sendingRef.current) return;
    const value = text;
    if (!value.trim()) return;
    sendingRef.current = true;
    if (isDebugChat()) {
      // eslint-disable-next-line no-console
      console.log('[MessageComposer] handleSend → clearing input. value:', value.slice(0, 30));
    }
    setTextWithDebug('');
    inputRef.current?.focus();
    try {
      await onSend(value);
    } finally {
      setTimeout(() => { sendingRef.current = false; }, 400);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (quickOpen && ['Enter', 'Tab', 'ArrowUp', 'ArrowDown', 'Escape'].includes(e.key)) return;
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (isDebugChat()) {
        // eslint-disable-next-line no-console
        console.log('[MessageComposer] Enter pressed → handleSend. currentText:', text.slice(0, 30));
      }
      void handleSend();
    }
  };

  const insertAtCursor = useCallback((insertion: string) => {
    const el = inputRef.current;
    const start = el?.selectionStart ?? text.length;
    const end = el?.selectionEnd ?? text.length;
    const next = text.slice(0, start) + insertion + text.slice(end);
    cursorTargetRef.current = start + insertion.length;
    setTextWithDebug(next);
    requestAnimationFrame(() => inputRef.current?.focus());
  }, [text, inputRef]);

  const handlePaste = useCallback((e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const cd = e.clipboardData;
    if (!cd) return;

    // 1) Texto cru disponível no clipboard (texto puro ou URL primária).
    const rawText = cd.getData('text/plain') || cd.getData('text/uri-list') || '';
    const URL_REGEX = /\bhttps?:\/\/[^\s<>()"']+/i;
    const hasUrl = URL_REGEX.test(rawText);

    // 2) Coleta arquivos eventuais (imagens, screenshots, etc.).
    const items = cd.items;
    const collected: File[] = [];
    if (items && items.length > 0) {
      const ts = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14);
      for (let i = 0; i < items.length; i++) {
        const it = items[i];
        if (it.kind !== 'file') continue;
        const blob = it.getAsFile();
        if (!blob) continue;

        let fileName = blob.name && blob.name !== 'image.png' ? blob.name : '';
        if (!fileName) {
          const mime = blob.type || 'application/octet-stream';
          const ext = (mime.split('/')[1] || 'bin').split(';')[0];
          const prefix = mime.startsWith('image/')
            ? 'imagem-colada'
            : mime.startsWith('video/')
              ? 'video-colado'
              : mime.startsWith('audio/')
                ? 'audio-colado'
                : 'arquivo-colado';
          fileName = `${prefix}-${ts}-${i}.${ext}`;
        }
        const file = new File([blob], fileName, { type: blob.type || 'application/octet-stream' });
        collected.push(file);
      }
    }

    // 3) Regra de prioridade:
    // - Se o clipboard contém texto com URL, sempre tratamos como TEXTO
    //   (mesmo que o navegador também tenha posto uma "screenshot" do link).
    //   Isso evita que copiar um link do navegador vire um anexo de imagem.
    // - Se o clipboard só tem texto (sem arquivos), o textarea processa
    //   normalmente — não interceptamos.
    // - Se o clipboard só tem arquivos (sem texto), tratamos como anexos.
    if (hasUrl && rawText.trim()) {
      e.preventDefault();
      insertAtCursor(rawText);
      return;
    }

    if (collected.length > 0 && !rawText.trim()) {
      e.preventDefault();
      if (onIncomingFiles) onIncomingFiles(collected);
      else collected.forEach((f) => onIncomingFile(f));
      return;
    }

    // Caso restante: somente texto (sem URL e sem arquivos) — deixa o
    // textarea inserir nativamente preservando seleção/formatação.
  }, [onIncomingFile, onIncomingFiles, insertAtCursor]);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const list = e.target.files ? Array.from(e.target.files) : [];
    if (fileInputRef.current) fileInputRef.current.value = '';
    if (list.length === 0) return;
    if (onIncomingFiles) onIncomingFiles(list);
    else list.forEach((f) => onIncomingFile(f));
  };

  // (insertAtCursor declarado acima, antes de handlePaste)

  // Permite ao pai inserir texto no cursor (ex.: drop de link).
  useEffect(() => {
    if (!insertTextRef) return;
    insertTextRef.current = (value: string) => insertAtCursor(value);
    return () => {
      if (insertTextRef) insertTextRef.current = null;
    };
  }, [insertTextRef, insertAtCursor]);

  const handleSelectQuickReply = (reply: QuickReply) => {
    cursorTargetRef.current = reply.text.length;
    setTextWithDebug(reply.text);
    setQuickOpen(false);
    setQuickQuery('');
    requestAnimationFrame(() => inputRef.current?.focus());
  };

  const formatRecordingTime = (s: number) => `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, '0')}`;

  const recordingActive = isRecording || isPaused;

  // Botão direito unificado para o modo normal (sem gravação).
  const rightButton = (() => {
    if (hasText) {
      return (
        <Button
          size="icon"
          aria-label="Enviar mensagem"
          className="shrink-0 h-10 w-10 rounded-full"
          onClick={() => void handleSend()}
          disabled={sending}
        >
          <Send className="w-4 h-4" />
        </Button>
      );
    }
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            aria-label="Gravar áudio"
            className="shrink-0 h-10 w-10 rounded-full"
            onClick={onToggleRecording}
            disabled={sending}
          >
            <Mic className="w-5 h-5" />
          </Button>
        </TooltipTrigger>
        <TooltipContent>Gravar áudio</TooltipContent>
      </Tooltip>
    );
  })();

  return (
    <div className="px-4 py-3 border-t border-border/50 bg-card/50">
      {quotedMessage && !recordingActive && (
        <div className="flex items-center gap-2 mb-2 p-2 rounded-lg bg-muted/50 border-l-4 border-primary">
          <div className="flex-1 min-w-0">
            <p className="text-xs font-medium text-primary">
              {quotedMessage.from_me ? 'Você' : (quotedMessage.sender_name || 'Contato')}
            </p>
            <p className="text-xs text-muted-foreground truncate">
              {quotedMessage.content || (quotedMessage.message_type === 'image' ? '📷 Imagem' : quotedMessage.message_type === 'audio' ? '🎵 Áudio' : quotedMessage.message_type === 'video' ? '🎥 Vídeo' : quotedMessage.message_type === 'document' ? '📄 Documento' : 'Mensagem')}
            </p>
          </div>
          <Button variant="ghost" size="icon" className="w-6 h-6 shrink-0" onClick={() => setQuotedMessage(null)}>
            <X className="w-3.5 h-3.5" />
          </Button>
        </div>
      )}

      {recordingActive ? (
        // ===== Barra estilo WhatsApp Web: lixeira | timer | waveform | pausa | enviar =====
        <div className="flex items-center gap-2">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                aria-label="Cancelar gravação"
                className="shrink-0 h-10 w-10 rounded-full text-muted-foreground hover:text-destructive"
                onClick={onCancelRecording}
              >
                <Trash2 className="w-5 h-5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Cancelar</TooltipContent>
          </Tooltip>

          <div className="flex-1 flex items-center gap-3 h-12 px-4 rounded-full bg-muted/40 border border-border min-w-0">
            <span
              className={cn(
                'w-2.5 h-2.5 rounded-full bg-destructive shrink-0',
                !isPaused && 'animate-pulse',
              )}
              aria-hidden
            />
            <span className="text-sm font-medium tabular-nums text-foreground/90 shrink-0 w-12">
              {formatRecordingTime(recordingTime)}
            </span>
            <RecordingWaveform levels={audioLevels} paused={isPaused} />
            {isPaused && (
              <span className="text-xs text-muted-foreground shrink-0">Pausado</span>
            )}
          </div>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                aria-label={isPaused ? 'Retomar gravação' : 'Pausar gravação'}
                className="shrink-0 h-10 w-10 rounded-full text-destructive"
                onClick={isPaused ? onResumeRecording : onPauseRecording}
              >
                {isPaused ? <Play className="w-5 h-5" /> : <Pause className="w-5 h-5" />}
              </Button>
            </TooltipTrigger>
            <TooltipContent>{isPaused ? 'Retomar' : 'Pausar'}</TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                size="icon"
                aria-label="Enviar áudio"
                className="shrink-0 h-10 w-10 rounded-full"
                onClick={onStopAndSendRecording}
                disabled={sending}
              >
                <Send className="w-4 h-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Enviar</TooltipContent>
          </Tooltip>
        </div>
      ) : (
        // ===== Composer normal =====
        <div className={cn('flex gap-1.5', isMultiline ? 'items-end' : 'items-center')}>
          <input
            ref={fileInputRef}
            type="file"
            multiple
            className="hidden"
            accept="*/*"
            onChange={handleFileUpload}
          />
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="shrink-0 h-10 w-10 rounded-full"
                onClick={() => fileInputRef.current?.click()}
                disabled={sending}
                aria-label="Anexar arquivo"
              >
                <Paperclip className="w-5 h-5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Anexar arquivo</TooltipContent>
          </Tooltip>

          <div className="flex-1 relative">
            <QuickReplyPopover
              open={quickOpen}
              query={quickQuery}
              replies={quickReplies}
              onSelect={handleSelectQuickReply}
              onClose={() => setQuickOpen(false)}
            />
            <div className="rounded-xl bg-muted/40 border border-border transition-colors focus-within:border-primary/60 focus-within:bg-muted/60">
              <Textarea
                ref={inputRef}
                rows={1}
                placeholder="Digite uma mensagem... (Shift+Enter para quebrar linha)"
                value={text}
                onChange={(e) => setTextWithDebug(e.target.value)}
                onKeyDown={handleKeyDown}
                onPaste={handlePaste}
                onFocus={() => onComposerFocus?.()}
                className="border-0 bg-transparent shadow-none px-3 py-2.5 leading-snug text-sm min-h-[40px] max-h-40 resize-none focus-visible:ring-0 focus-visible:ring-offset-0 hover:border-transparent placeholder:text-muted-foreground/70"
              />
            </div>
          </div>

          <EmojiPickerPopover
            disabled={sending}
            onSelect={(emoji) => insertAtCursor(emoji)}
          />

          {currentInstance?.provider === 'cloud_api' && (
            <HsmTemplatePopover
              instanceId={currentInstance.id}
              conversationId={conversation.id}
              disabled={sending}
              onBeforeSend={ensureTicketReopened}
            />
          )}
          {rightButton}
        </div>
      )}
    </div>
  );
}

function arePropsEqual(prev: Props, next: Props) {
  // Re-render sempre que o estado de gravação muda, ou enquanto gravando
  // (para acompanhar timer, pausa e waveform).
  if (prev.isRecording !== next.isRecording) return false;
  if (prev.isPaused !== next.isPaused) return false;
  if (next.isRecording || next.isPaused) {
    if (prev.recordingTime !== next.recordingTime) return false;
    if (prev.audioLevels !== next.audioLevels) return false;
  }
  return (
    prev.conversation === next.conversation &&
    prev.currentInstance === next.currentInstance &&
    prev.isEvolutionConversation === next.isEvolutionConversation &&
    prev.sending === next.sending &&
    prev.quotedMessage === next.quotedMessage &&
    prev.setQuotedMessage === next.setQuotedMessage &&
    prev.quickReplies === next.quickReplies &&
    prev.inputRef === next.inputRef &&
    prev.fileInputRef === next.fileInputRef &&
    prev.ensureTicketReopened === next.ensureTicketReopened &&
    prev.onSend === next.onSend &&
    prev.onIncomingFile === next.onIncomingFile &&
    prev.onToggleRecording === next.onToggleRecording &&
    prev.onCancelRecording === next.onCancelRecording &&
    prev.onPauseRecording === next.onPauseRecording &&
    prev.onResumeRecording === next.onResumeRecording &&
    prev.onStopAndSendRecording === next.onStopAndSendRecording &&
    prev.onComposerFocus === next.onComposerFocus
  );
}

export const MessageComposer = memo(MessageComposerImpl, arePropsEqual);
