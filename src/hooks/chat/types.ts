import type { ChatMessage } from '@/hooks/useChatMessages';
import type { Conversation } from '@/hooks/useConversations';
import type { AttendanceSettings } from '@/hooks/useAttendanceSettings';

export interface ChatActionsBase {
  conversation: Conversation;
  companyId: string | undefined;
  isEvolutionConversation: boolean;
  signatureCfg: AttendanceSettings['signature'] | undefined;
  agentName: string;
  ensureTicketReopened: () => Promise<boolean>;
  addOptimisticMessage: (m: ChatMessage) => void;
  replaceCachedMessage: (id: string, m: ChatMessage) => void;
  updateCachedMessage: (id: string, fn: (m: ChatMessage) => ChatMessage) => void;
  removeCachedMessage: (id: string) => void;
  patchConversationLocally: (id: string, patch: Partial<Conversation>) => void;
}

export interface SendResultLike {
  messageId?: string;
  status?: string;
  _ts?: string;
}
