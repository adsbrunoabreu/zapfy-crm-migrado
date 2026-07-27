import type { ElementType } from 'react';
import { CheckCircle2, AlertCircle, Pause } from 'lucide-react';
import type { Database } from '@/integrations/supabase/types';

export type AppRole = Database['public']['Enums']['app_role'];
export type PlanStatus = 'active' | 'trial' | 'suspended' | 'cancelled';
export type SubStatus = 'active' | 'trialing' | 'canceled' | 'past_due';

export const planStatusLabel: Record<PlanStatus, { label: string; cls: string; icon: ElementType }> = {
  active: { label: 'Ativo', cls: 'bg-emerald/20 text-emerald border-emerald/30', icon: CheckCircle2 },
  trial: { label: 'Trial', cls: 'bg-amber/20 text-amber border-amber/30', icon: AlertCircle },
  suspended: { label: 'Suspenso', cls: 'bg-rose/20 text-rose border-rose/30', icon: Pause },
  cancelled: { label: 'Cancelado', cls: 'bg-muted text-muted-foreground border-border', icon: Pause },
};

export const subStatusLabel: Record<SubStatus, { label: string; cls: string }> = {
  active: { label: 'Ativa', cls: 'bg-emerald/20 text-emerald border-emerald/30' },
  trialing: { label: 'Em teste', cls: 'bg-amber/20 text-amber border-amber/30' },
  past_due: { label: 'Atrasada', cls: 'bg-rose/20 text-rose border-rose/30' },
  canceled: { label: 'Cancelada', cls: 'bg-muted text-muted-foreground border-border' },
};

export const roleLabelMap: Record<AppRole, string> = {
  master: 'Master Admin',
  admin: 'Admin',
  financeiro: 'Financeiro',
  gestor: 'Gestor',
  agente: 'Agente',
};

export const renderRoleLabel = (r: string): string => {
  if (r === 'company_admin') return roleLabelMap.admin;
  if (r === 'user') return roleLabelMap.agente;
  return roleLabelMap[r as AppRole] ?? r;
};

export function formatBRL(value: number): string {
  return value.toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: 2,
  });
}

export function initials(name?: string | null, email?: string): string {
  const src = (name || email || '?').trim();
  return src
    .split(/\s+/)
    .map((s) => s[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();
}
