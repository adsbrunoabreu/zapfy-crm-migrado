/**
 * Render a template body using REAL lead data (not example placeholders).
 * Mirrors the variables in templateVariables.ts and the SQL render_template function.
 */
import { format } from 'date-fns';

export interface LeadForTemplate {
  id: string;
  name: string | null;
  phone: string | null;
  email: string | null;
  value: number | null;
  company_name?: string | null;
  city?: string | null;
  state?: string | null;
  stage_name?: string | null;
  assigned_to_name?: string | null;
}

function formatBRL(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return '';
  try {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(value));
  } catch {
    return `R$ ${Number(value).toFixed(2)}`;
  }
}

function firstName(full: string | null | undefined): string {
  if (!full) return '';
  return full.trim().split(/\s+/)[0] ?? '';
}

export function renderWithLead(body: string, lead: LeadForTemplate | null): string {
  if (!body) return '';
  const map: Record<string, string> = {
    nome: lead?.name ?? '',
    primeiro_nome: firstName(lead?.name),
    empresa: lead?.company_name ?? '',
    telefone: lead?.phone ?? '',
    email: lead?.email ?? '',
    valor: formatBRL(lead?.value),
    etapa: lead?.stage_name ?? '',
    atendente: lead?.assigned_to_name ?? '',
    cidade: lead?.city ?? '',
    estado: lead?.state ?? '',
    data: format(new Date(), 'dd/MM/yyyy'),
  };

  let out = body;
  for (const [k, v] of Object.entries(map)) {
    out = out.split(`{{${k}}}`).join(v);
  }
  // Leave unknown variables intact so user notices, but trim doubled whitespace
  return out;
}

export function detectMissingVariables(body: string, lead: LeadForTemplate | null): string[] {
  const used = (body.match(/\{\{([a-z_]+)\}\}/g) || []).map((m) => m.slice(2, -2));
  const missing: string[] = [];
  const check = (k: string, value: string | null | undefined) => {
    if (used.includes(k) && (!value || String(value).trim() === '')) missing.push(k);
  };
  check('nome', lead?.name);
  check('primeiro_nome', firstName(lead?.name));
  check('empresa', lead?.company_name);
  check('telefone', lead?.phone);
  check('email', lead?.email);
  check('valor', lead?.value !== null && lead?.value !== undefined ? String(lead?.value) : null);
  check('etapa', lead?.stage_name);
  check('atendente', lead?.assigned_to_name);
  check('cidade', lead?.city);
  check('estado', lead?.state);
  return Array.from(new Set(missing));
}
