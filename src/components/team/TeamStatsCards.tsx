import { memo } from 'react';
import { Card } from '@/components/ui/card';
import { Users, Shield, Mail, Activity } from 'lucide-react';

interface Props {
  total: number;
  admins: number;
  pending: number;
  active: number;
}

function StatCard({
  icon: Icon,
  iconBg,
  iconColor,
  value,
  label,
}: {
  icon: typeof Users;
  iconBg: string;
  iconColor: string;
  value: number;
  label: string;
}) {
  return (
    <Card className="stat-card">
      <div className="flex items-center gap-3">
        <div className={`w-11 h-11 rounded-xl ${iconBg} flex items-center justify-center`}>
          <Icon className={`w-5 h-5 ${iconColor}`} />
        </div>
        <div>
          <p className="text-2xl font-semibold">{value}</p>
          <p className="text-xs text-muted-foreground">{label}</p>
        </div>
      </div>
    </Card>
  );
}

function TeamStatsCardsComponent({ total, admins, pending, active }: Props) {
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      <StatCard icon={Users} iconBg="bg-primary/20" iconColor="text-primary" value={total} label="Total de Membros" />
      <StatCard icon={Activity} iconBg="bg-[hsl(var(--emerald)/0.20)]" iconColor="text-[hsl(var(--emerald))]" value={active} label="Ativos" />
      <StatCard icon={Shield} iconBg="bg-amber/20" iconColor="text-amber" value={admins} label="Administradores" />
      <StatCard icon={Mail} iconBg="bg-cyan/20" iconColor="text-cyan" value={pending} label="Convites Pendentes" />
    </div>
  );
}

export const TeamStatsCards = memo(TeamStatsCardsComponent);
