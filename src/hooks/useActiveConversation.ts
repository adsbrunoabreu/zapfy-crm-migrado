/**
 * Registro global (módulo) da conversa de chat atualmente aberta.
 * Sem Context para evitar re-render desnecessário em consumidores
 * imperativos (ex.: hook de som de notificação).
 */

let activeConversationId: string | null = null;

export function setActiveConversationId(id: string | null) {
  activeConversationId = id;
}

export function getActiveConversationId(): string | null {
  return activeConversationId;
}
