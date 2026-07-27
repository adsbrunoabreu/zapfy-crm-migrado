/**
 * Available placeholders for templates rendering.
 * Mirrors the public.render_template SQL function.
 */
export const TEMPLATE_VARIABLES: { key: string; label: string; example: string }[] = [
  { key: 'nome', label: 'Nome completo do lead', example: 'João da Silva' },
  { key: 'primeiro_nome', label: 'Primeiro nome', example: 'João' },
  { key: 'empresa', label: 'Empresa do lead', example: 'Acme Ltda' },
  { key: 'telefone', label: 'Telefone', example: '11999998888' },
  { key: 'email', label: 'E-mail', example: 'joao@acme.com' },
  { key: 'valor', label: 'Valor do negócio', example: 'R$ 1.500,00' },
  { key: 'etapa', label: 'Etapa do pipeline', example: 'Qualificação' },
  { key: 'atendente', label: 'Atendente responsável', example: 'Maria Souza' },
  { key: 'cidade', label: 'Cidade', example: 'São Paulo' },
  { key: 'estado', label: 'Estado', example: 'SP' },
  { key: 'data', label: 'Data atual', example: '01/05/2026' },
];

export function renderPreview(body: string): string {
  let out = body || '';
  for (const v of TEMPLATE_VARIABLES) {
    out = out.split(`{{${v.key}}}`).join(v.example);
  }
  // strip unknowns
  return out.replace(/\{\{[^}]+\}\}/g, '');
}

export function detectVariables(body: string): string[] {
  const matches = (body || '').match(/\{\{([a-z_]+)\}\}/g) || [];
  return Array.from(new Set(matches.map((m) => m.slice(2, -2))));
}

export function slugify(input: string): string {
  return (input || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60) || `tpl-${Date.now()}`;
}
