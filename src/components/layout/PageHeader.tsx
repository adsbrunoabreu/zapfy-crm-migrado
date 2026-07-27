import { ReactNode } from 'react';
import { cn } from '@/lib/utils';

interface PageHeaderProps {
  title: string;
  subtitle?: ReactNode;
  actions?: ReactNode;
  icon?: ReactNode;
  className?: string;
}

/**
 * Padrão SaaS:
 * - Título text-xl font-semibold (sentence case)
 * - Subtítulo text-sm text-muted-foreground
 * - Ações alinhadas à direita
 * - Espaço inferior mb-6
 */
export function PageHeader({ title, subtitle, actions, icon, className }: PageHeaderProps) {
  return (
    <div className={cn('flex items-start justify-between gap-4 mb-6', className)}>
      <div className="min-w-0">
        <h1 className="text-xl font-semibold text-foreground flex items-center gap-2">
          {icon}
          <span className="truncate">{title}</span>
        </h1>
        {subtitle && (
          <p className="text-sm text-muted-foreground mt-1">{subtitle}</p>
        )}
      </div>
      {actions && (
        <div className="flex items-center gap-2 shrink-0">{actions}</div>
      )}
    </div>
  );
}
