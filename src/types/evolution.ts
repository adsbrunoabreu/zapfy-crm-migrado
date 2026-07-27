/**
 * Tipos compartilhados para a Evolution API.
 *
 * Modelados a partir das respostas reais consumidas em `evolutionApi.ts`
 * e `evolution-proxy`. Campos opcionais quando a API pode omiti-los.
 */

export interface EvolutionQuotedKey {
  remoteJid: string;
  fromMe: boolean;
  id: string;
}

export interface EvolutionQuotedMessage {
  key: EvolutionQuotedKey;
  message: { conversation: string };
}

export interface EvolutionSendTextPayload {
  number: string;
  text: string;
  delay?: number;
  quoted?: EvolutionQuotedMessage;
}

export interface EvolutionMessageKey {
  id: string;
  remoteJid?: string;
  fromMe?: boolean;
}

/** Resposta padrão de `/message/sendText`, `sendMedia`, etc. */
export interface EvolutionSendResponse {
  key?: EvolutionMessageKey;
  status?: string;
  messageTimestamp?: number;
  message?: Record<string, unknown>;
}

export interface EvolutionApiResponse<T = unknown> {
  status: number;
  data: T;
  error?: string;
}

export type EvolutionInstanceState = 'open' | 'close' | 'connecting';

export interface EvolutionInstance {
  instanceName: string;
  state: EvolutionInstanceState;
  profilePicUrl?: string;
}

export interface EvolutionProfilePicture {
  profilePictureUrl?: string | null;
  profilePicUrl?: string | null;
  picture?: string | null;
}

export interface EvolutionCheckNumberResult {
  exists: boolean;
  jid?: string;
  number?: string;
}
