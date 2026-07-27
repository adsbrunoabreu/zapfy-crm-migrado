import { Crown, Shield, User, type LucideIcon } from 'lucide-react';

export type TeamRoleConfig = {
  label: string;
  icon: LucideIcon;
  className: string;
};

export const roleConfig: Record<string, TeamRoleConfig> = {
  master: {
    label: 'Master',
    icon: Crown,
    className: 'bg-[hsl(var(--violet)/0.20)] text-[hsl(var(--violet))] border-[hsl(var(--violet)/0.30)]',
  },
  company_admin: {
    label: 'Admin',
    icon: Shield,
    className: 'bg-amber/20 text-amber border-amber/30',
  },
  user: {
    label: 'Usuário',
    icon: User,
    className: 'bg-cyan/20 text-cyan border-cyan/30',
  },
};

export const statusConfig: Record<string, { label: string; color: string }> = {
  online: { label: 'Online', color: 'bg-[hsl(var(--emerald))]' },
  away: { label: 'Ausente', color: 'bg-[hsl(var(--amber))]' },
  offline: { label: 'Offline', color: 'bg-muted-foreground/50' },
};

export const inactiveStatus = { label: 'Inativo', color: 'bg-destructive' };

export function getMemberStatus(member: { isActive?: boolean; status?: string }) {
  if (member.isActive === false) return inactiveStatus;
  return statusConfig[member.status ?? 'offline'] || statusConfig.offline;
}

export function getRole(role: string): TeamRoleConfig {
  return roleConfig[role] || roleConfig.user;
}

export function formatDate(date: string) {
  return new Date(date).toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}
