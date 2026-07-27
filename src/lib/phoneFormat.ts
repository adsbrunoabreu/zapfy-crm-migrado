/**
 * Formata número de telefone para o padrão pt-BR.
 * Exemplos:
 *  5511987654321 -> +55 (11) 98765-4321
 *  551133334444  -> +55 (11) 3333-4444
 *  11987654321   -> (11) 98765-4321
 *  Outros formatos (internacional não-BR) retornam com + e dígitos agrupados.
 */
export function formatPhoneBR(raw: string | null | undefined): string {
  if (!raw) return '';
  const digits = String(raw).replace(/\D/g, '');
  if (!digits) return '';

  // BR com DDI 55
  if (digits.startsWith('55') && (digits.length === 12 || digits.length === 13)) {
    const ddd = digits.slice(2, 4);
    const rest = digits.slice(4);
    if (rest.length === 9) {
      return `+55 (${ddd}) ${rest.slice(0, 5)}-${rest.slice(5)}`;
    }
    if (rest.length === 8) {
      return `+55 (${ddd}) ${rest.slice(0, 4)}-${rest.slice(4)}`;
    }
  }

  // BR sem DDI
  if (digits.length === 11) {
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
  }
  if (digits.length === 10) {
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
  }

  // Fallback: retorna com + se mais que 10 dígitos
  return digits.length > 10 ? `+${digits}` : digits;
}

/**
 * Normaliza um número digitado pelo usuário em formato E.164 sem o sinal de +,
 * pronto para enviar ao Evolution API. Assume Brasil (55) se vier sem DDI.
 */
export function normalizePhoneForSend(raw: string): string {
  const digits = String(raw || '').replace(/\D/g, '');
  if (!digits) return '';
  // Já tem DDI BR
  if (digits.startsWith('55') && digits.length >= 12) return digits;
  // Outro DDI (>=11 dígitos sem ser BR) — assume que já está com DDI
  if (digits.length >= 12) return digits;
  // BR sem DDI
  if (digits.length === 10 || digits.length === 11) return `55${digits}`;
  return digits;
}
