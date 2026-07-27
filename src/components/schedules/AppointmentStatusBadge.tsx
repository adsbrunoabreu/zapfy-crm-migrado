import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import type { AppointmentStatus } from '@/hooks/useAppointments';

const LABEL: Record<AppointmentStatus, string> = {
  scheduled: 'Pendente',
  confirmed: 'Confirmado',
  in_progress: 'Em andamento',
  completed: 'Concluído',
  cancelled: 'Cancelado',
  no_show: 'Não compareceu',
};

/**
 * Estilo Vercel/Supabase: outline + tinte sutil.
 * Mantém a paleta atual do app (semantic tokens + cores fixas pequenas para distinção).
 */
const VARIANT: Record<AppointmentStatus, string> = {
  scheduled: 'border-amber-500/30 bg-amber-500/10 text-amber-500',
  confirmed: 'border-blue-500/30 bg-blue-500/10 text-blue-500',
  in_progress: 'border-violet-500/30 bg-violet-500/10 text-violet-500',
  completed: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-500',
  cancelled: 'border-border bg-muted/30 text-muted-foreground',
  no_show: 'border-destructive/30 bg-destructive/10 text-destructive',
};

interface Props {
  status: AppointmentStatus;
  className?: string;
  size?: 'sm' | 'xs';
}

export function AppointmentStatusBadge({ status, className, size = 'sm' }: Props) {
  return (
    <Badge
      variant="outline"
      className={cn(
        VARIANT[status],
        'font-medium',
        size === 'xs' ? 'text-[10px] px-1.5 py-0 h-5' : 'text-xs px-2 py-0.5',
        className,
      )}
    >
      <span className={cn('w-1.5 h-1.5 rounded-full mr-1.5', dotColor(status))} />
      {LABEL[status]}
    </Badge>
  );
}

function dotColor(status: AppointmentStatus): string {
  switch (status) {
    case 'scheduled': return 'bg-amber-500';
    case 'confirmed': return 'bg-blue-500';
    case 'in_progress': return 'bg-violet-500';
    case 'completed': return 'bg-emerald-500';
    case 'cancelled': return 'bg-muted-foreground';
    case 'no_show': return 'bg-destructive';
  }
}
