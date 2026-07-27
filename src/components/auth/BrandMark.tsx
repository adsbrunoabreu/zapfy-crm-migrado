import { Link } from 'react-router-dom';
import { useBrand } from '@/hooks/useBrand';

interface BrandMarkProps {
  to?: string;
  className?: string;
}

export function BrandMark({ to = '/', className = '' }: BrandMarkProps) {
  const { displayName, Icon } = useBrand();

  return (
    <Link
      to={to}
      aria-label={displayName}
      className={`flex items-center justify-center gap-3 ${className}`}
    >
      <div className="w-10 h-10 rounded-xl bg-primary/20 flex items-center justify-center">
        <Icon className="w-6 h-6 text-primary" fill="currentColor" />
      </div>
      <span className="font-display text-xl font-bold lowercase">
        {displayName}
      </span>
    </Link>
  );
}
