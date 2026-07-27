import { cn } from '@/lib/utils';

interface PulsingLedProps {
  size?: 'sm' | 'md';
  className?: string;
  label?: string;
}

/**
 * LED piscando para indicar notificações em tempo real (mensagens não lidas).
 * O glow pulsa suavemente. Some imediatamente quando removido do DOM.
 */
export function PulsingLed({ size = 'sm', className, label = 'Mensagens não lidas' }: PulsingLedProps) {
  const dim = size === 'sm' ? 'w-2 h-2' : 'w-2.5 h-2.5';
  return (
    <span
      role="status"
      aria-label={label}
      className={cn(
        'inline-block rounded-full bg-primary animate-led shrink-0',
        dim,
        className
      )}
    />
  );
}
