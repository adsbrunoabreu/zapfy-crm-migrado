import { Link } from 'react-router-dom';
import { AlertCircle } from 'lucide-react';
import { cn } from '@/lib/utils';

interface PlanLimitBannerProps {
  message: string;
  className?: string;
  ctaLabel?: string;
  ctaTo?: string;
}

/**
 * Banner exibido quando uma ação está bloqueada por limite de plano.
 * Usado em Conexões, Leads, Equipe etc.
 */
export function PlanLimitBanner({ message, className, ctaLabel = 'Fazer upgrade', ctaTo = '/subscription' }: PlanLimitBannerProps) {
  return (
    <div
      className={cn(
        'rounded-lg border border-amber/30 bg-amber/10 text-amber px-4 py-3 flex items-center justify-between gap-3 text-sm',
        className
      )}
    >
      <div className="flex items-center gap-2 min-w-0">
        <AlertCircle className="w-4 h-4 shrink-0" />
        <span className="truncate">{message}</span>
      </div>
      <Link
        to={ctaTo}
        className="font-medium underline underline-offset-2 hover:opacity-80 shrink-0"
      >
        {ctaLabel} →
      </Link>
    </div>
  );
}
