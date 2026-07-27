import { retryWithBackoff } from '@/utils/retryWithBackoff';
import { invokeEvolutionProxy } from './evolutionProxy';
import type {
  EvolutionSendResponse,
  EvolutionProfilePicture,
  EvolutionCheckNumberResult,
  EvolutionInstance,
} from '@/types/evolution';

async function callProxy<T = unknown>(action: string, params: Record<string, unknown> = {}): Promise<T> {
  return invokeEvolutionProxy<T>(action, params);
}

/** Wrapper com retry para ações críticas de envio */
function callProxyWithRetry<T = unknown>(action: string, params: Record<string, unknown> = {}, maxAttempts = 3): Promise<T> {
  return retryWithBackoff(() => callProxy<T>(action, params), {
    maxAttempts,
    onRetry: (attempt, delay) => {
      console.warn(`[EvolutionAPI] ${action} — retry ${attempt}/${maxAttempts} em ${Math.round(delay)}ms`)
    },
  });
}

// Convert remoteJid to clean phone number
export function jidToPhone(jid: string): string {
  return jid.replace('@s.whatsapp.net', '').replace('@g.us', '');
}

// Convert phone to remoteJid
export function phoneToJid(phone: string): string {
  const clean = phone.replace(/\D/g, '');
  return `${clean}@s.whatsapp.net`;
}

// Status icon mapping
export const statusIconMap: Record<string, string> = {
  pending: 'clock',
  sent: 'check',
  delivered: 'check-check',
  read: 'check-check-blue',
  played: 'check-check-blue',
  error: 'alert-circle',
  received: 'received',
};

// Message type mapping
export const messageTypeMap: Record<string, string> = {
  conversation: 'text',
  extendedTextMessage: 'text',
  imageMessage: 'image',
  audioMessage: 'audio',
  videoMessage: 'video',
  documentMessage: 'document',
  stickerMessage: 'sticker',
  locationMessage: 'location',
  reactionMessage: 'reaction',
};

export const evolutionApi = {
  sendText: (number: string, text: string, quoted?: {
    remoteJid: string;
    fromMe: boolean;
    id: string;
    message?: string;
  }): Promise<EvolutionSendResponse> => {
    const params: Record<string, unknown> = { number, text };
    if (quoted) {
      params.quoted = {
        key: {
          remoteJid: quoted.remoteJid,
          fromMe: quoted.fromMe,
          id: quoted.id,
        },
        message: { conversation: quoted.message || '' },
      };
    }
    return callProxyWithRetry<EvolutionSendResponse>('sendText', params, 3);
  },

  sendMedia: (
    number: string,
    mediaBase64: string,
    mediatype: 'image' | 'document' | 'video',
    mimetype: string,
    fileName: string,
    caption?: string,
    storagePath?: string,
  ): Promise<EvolutionSendResponse> =>
    // Sem retry: envios de mídia não são idempotentes — uma 1ª tentativa que
    // demora pode ser aceita pelo WhatsApp mesmo após o cliente reenviar,
    // gerando duplicatas. Em caso de falha real, o usuário reenvia manualmente.
    callProxy<EvolutionSendResponse>('sendMedia', { number, media: mediaBase64, mediatype, mimetype, fileName, caption, storagePath }),

  sendAudio: (number: string, audioBase64: string): Promise<EvolutionSendResponse> =>
    callProxy<EvolutionSendResponse>('sendAudio', { number, audio: audioBase64 }),

  sendReaction: (remoteJid: string, messageId: string, emoji: string, fromMe = false): Promise<EvolutionSendResponse> =>
    callProxy<EvolutionSendResponse>('sendReaction', { remoteJid, messageId, reaction: emoji, fromMe }),

  deleteMessage: (remoteJid: string, messageId: string, fromMe = true, onlyMe = false): Promise<unknown> =>
    callProxy('deleteMessage', { remoteJid, messageId, fromMe, onlyMe }),

  editMessage: (remoteJid: string, messageId: string, text: string, fromMe = true): Promise<unknown> =>
    callProxy('editMessage', { remoteJid, messageId, text, fromMe }),

  markAsRead: (remoteJid: string, messageId: string, fromMe = false): Promise<unknown> =>
    callProxyWithRetry('markAsRead', { remoteJid, messageId, fromMe }, 3),

  getHistory: (remoteJid: string, limit = 50): Promise<unknown> =>
    callProxy('findMessages', { remoteJid, limit }),

  getChats: (): Promise<EvolutionInstance[] | unknown> =>
    callProxy('findChats'),

  getContacts: (pushName?: string): Promise<unknown> =>
    callProxy('findContacts', pushName ? { pushName } : {}),

  getProfilePicture: (number: string): Promise<EvolutionProfilePicture> =>
    callProxy<EvolutionProfilePicture>('fetchProfilePicture', { number }),

  getProfile: (number: string): Promise<unknown> =>
    callProxy('fetchProfile', { number }),

  checkNumber: (number: string): Promise<EvolutionCheckNumberResult | unknown> =>
    // Retry leve para falhas temporárias (5xx/429/network).
    // Não bloqueia o usuário: o caller já trata exceção e segue o fluxo.
    retryWithBackoff(() => callProxy('checkNumber', { number }), {
      maxAttempts: 3,
      initialDelayMs: 400,
      maxDelayMs: 2000,
      factor: 2,
      onRetry: (attempt, delay) => {
        console.warn(`[EvolutionAPI] checkNumber — retry ${attempt}/3 em ${Math.round(delay)}ms`);
      },
    }),

  sendPresence: (number: string, presence: 'composing' | 'recording' | 'paused'): Promise<unknown> =>
    callProxy('sendPresence', { number, presence }),

  subscribePresence: (number: string): Promise<unknown> =>
    callProxy('subscribePresence', { number }),

  downloadMedia: (messageId: string, mimetype?: string, mediaType?: string): Promise<unknown> =>
    callProxy('downloadMedia', { messageId, mimetype, mediaType }),
};
