/**
 * Resolve tokens do sistema (ex.: {{primeiro_nome}}, {{empresa}}) para
 * valores reais do lead vinculado à conversa antes de enviar um template Meta.
 */
import { TEMPLATE_VARIABLES } from '@/components/templates/templateVariables';

export interface LeadContext {
  name?: string | null;
  company?: string | null;
  phone?: string | null;
  email?: string | null;
  value?: number | null;
  stage?: string | null;
  assigned_to_name?: string | null;
  city?: string | null;
  state?: string | null;
}

const TOKEN_RE = /\{\{\s*([a-z_]+)\s*\}\}/gi;

export const SYSTEM_TOKEN_KEYS = TEMPLATE_VARIABLES.map((v) => v.key);

function fmtCurrency(v: number | null | undefined): string {
  if (v == null) return '';
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function fmtToday(): string {
  return new Date().toLocaleDateString('pt-BR');
}

function valueFor(key: string, lead: LeadContext | null | undefined): string {
  if (!lead && key !== 'data') return '';
  switch (key) {
    case 'nome':
      return lead?.name ?? '';
    case 'primeiro_nome':
      return (lead?.name ?? '').split(' ')[0] ?? '';
    case 'empresa':
      return lead?.company ?? '';
    case 'telefone':
      return lead?.phone ?? '';
    case 'email':
      return lead?.email ?? '';
    case 'valor':
      return fmtCurrency(lead?.value);
    case 'etapa':
      return lead?.stage ?? '';
    case 'atendente':
      return lead?.assigned_to_name ?? '';
    case 'cidade':
      return lead?.city ?? '';
    case 'estado':
      return lead?.state ?? '';
    case 'data':
      return fmtToday();
    default:
      return '';
  }
}

/** Resolve todos os {{token}} válidos do sistema; ignora desconhecidos. */
export function resolveSystemTokens(input: string, lead: LeadContext | null | undefined): string {
  if (!input) return '';
  return input.replace(TOKEN_RE, (full, raw) => {
    const key = String(raw).toLowerCase();
    if (!SYSTEM_TOKEN_KEYS.includes(key)) return full;
    return valueFor(key, lead);
  });
}

/** Sugestão por posição quando ainda não há mapping salvo. */
export const DEFAULT_TOKEN_SEQUENCE = [
  '{{primeiro_nome}}',
  '{{empresa}}',
  '{{telefone}}',
  '{{email}}',
  '{{valor}}',
  '{{etapa}}',
  '{{atendente}}',
  '{{cidade}}',
  '{{estado}}',
  '{{data}}',
];

export function suggestDefaultTokens(count: number): string[] {
  return Array.from({ length: count }, (_, i) => DEFAULT_TOKEN_SEQUENCE[i] ?? '');
}
