import type { Database } from '@/integrations/supabase/types';

export type AppRole = Database['public']['Enums']['app_role'];

export const ROLE_LABELS: Record<AppRole, string> = {
  master: 'Master Admin',
  admin: 'Admin',
  financeiro: 'Financeiro',
  gestor: 'Gestor',
  agente: 'Agente',
};

/** Labels including legacy values (for safe rendering of any stored data). */
export function roleLabel(role: string | null | undefined): string {
  if (!role) return '—';
  // Legacy aliases (kept for backwards compat in rendering only)
  if (role === 'company_admin') return ROLE_LABELS.admin;
  if (role === 'user') return ROLE_LABELS.agente;
  return ROLE_LABELS[role as AppRole] ?? role;
}

/** Options shown when an admin assigns roles to a tenant member (no master). */
export const TENANT_ROLE_OPTIONS: { value: AppRole; label: string; description: string }[] = [
  { value: 'admin', label: 'Admin', description: 'Acesso total ao tenant' },
  { value: 'financeiro', label: 'Financeiro', description: 'Financeiro + leitura geral' },
  { value: 'gestor', label: 'Gestor', description: 'Operacional completo (sem billing)' },
  { value: 'agente', label: 'Agente', description: 'Operador diário (chat/leads)' },
];

/** Full option list (Master only when promoting from platform admin screen). */
export const ALL_ROLE_OPTIONS: { value: AppRole; label: string }[] = [
  { value: 'agente', label: 'Agente' },
  { value: 'gestor', label: 'Gestor' },
  { value: 'financeiro', label: 'Financeiro' },
  { value: 'admin', label: 'Admin' },
  { value: 'master', label: 'Master Admin' },
];

export const isMaster = (role?: string | null) => role === 'master';
export const isAdmin = (role?: string | null) => role === 'admin' || role === 'company_admin';
export const isFinance = (role?: string | null) => role === 'financeiro';
export const isManager = (role?: string | null) => role === 'gestor';
export const isAgent = (role?: string | null) => role === 'agente' || role === 'user';

/** Can manage operational data (master/admin/gestor). */
export const canManage = (role?: string | null) =>
  isMaster(role) || isAdmin(role) || isManager(role);

/** Can read full company data (master/admin/gestor/financeiro). */
export const canReadAll = (role?: string | null) =>
  canManage(role) || isFinance(role);

/** Normalize legacy roles to current enum. Returns null for unknown values. */
export function normalizeRole(raw?: string | null): AppRole | null {
  if (!raw) return null;
  if (raw === 'company_admin') return 'admin';
  if (raw === 'user') return 'agente';
  if (raw === 'master' || raw === 'admin' || raw === 'financeiro' || raw === 'gestor' || raw === 'agente') {
    return raw;
  }
  return null;
}

/** Priority — higher beats lower when combining sources. */
const ROLE_PRIORITY: Record<AppRole, number> = {
  master: 5,
  admin: 4,
  financeiro: 3,
  gestor: 2,
  agente: 1,
};

/** Pick the highest-priority role among many (used to merge user_roles + profiles.role). */
export function pickHighestRole(roles: Array<string | null | undefined>): AppRole | null {
  let best: AppRole | null = null;
  for (const r of roles) {
    const n = normalizeRole(r);
    if (!n) continue;
    if (!best || ROLE_PRIORITY[n] > ROLE_PRIORITY[best]) best = n;
  }
  return best;
}
