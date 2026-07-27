import type { SignatureConfig } from '@/hooks/useAttendanceSettings';

/**
 * Renderiza a assinatura do agente conforme o formato configurado.
 * Retorna string vazia se a assinatura estiver desativada.
 */
export function renderAgentSignature(cfg: SignatureConfig | undefined, agentName: string): string {
  if (!cfg || !cfg.enabled) return '';
  const name = (agentName || '').trim();
  if (!name) return '';
  switch (cfg.format) {
    case 'bold_name':
      return `*${name}*`;
    case 'attended_by':
      return `Atendido por: ${name}`;
    case 'name_dash':
      return `${name} — Suporte`;
    case 'custom':
      return (cfg.custom_template || '').split('{{nome_agente}}').join(name);
    default:
      return '';
  }
}

/**
 * Anexa a assinatura ao texto. Por padrão, posiciona ACIMA da mensagem
 * (cfg.position === 'top'), e somente abaixo quando explicitamente
 * configurado como 'bottom'. Evita duplicar caso já esteja presente.
 */
export function appendSignature(text: string, cfg: SignatureConfig | undefined, agentName: string): string {
  const sig = renderAgentSignature(cfg, agentName);
  if (!sig) return text;
  if (text.includes(sig)) return text;
  const position = cfg?.position ?? 'top';
  if (position === 'bottom') {
    const trimmed = text.trimEnd();
    return `${trimmed}\n\n${sig}`;
  }
  const trimmed = text.trimStart();
  return `${sig}\n\n${trimmed}`;
}

