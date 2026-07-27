/**
 * InstanceDot — chip textual com o nome da instância de WhatsApp.
 * Mostra apenas o nome (sem LED) com tooltip identificando provedor.
 */
import { Hash } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

interface Props {
  /** Mantido por compatibilidade — não é mais usado visualmente. */
  color?: string | null;
  label?: string | null;
  provider?: string | null;
  /** Mantido por compatibilidade. Não tem efeito visual. */
  showLabel?: boolean;
  className?: string;
}

function providerLabel(provider?: string | null): string | null {
  if (!provider) return null;
  if (provider === 'cloud_api') return 'Meta Cloud API (Oficial)';
  if (provider === 'evolution') return 'Evolution';
  return provider;
}

export function InstanceDot({ label, provider, className }: Props) {
  if (!label) return null;
  const provLabel = providerLabel(provider);
  return (
    <TooltipProvider delayDuration={150}>
      <Tooltip>
        <TooltipTrigger asChild>
          <span
            aria-label={provLabel ? `${label} — ${provLabel}` : label}
            style={{ letterSpacing: '0.5px' }}
            className={
              'group inline-flex items-center gap-0.5 shrink-0 rounded-[4px] border border-primary/60 ' +
              'bg-gradient-to-b from-primary/15 to-primary/25 px-2 py-1 ' +
              'text-[12px] font-semibold leading-none text-primary ' +
              'shadow-[0_1px_3px_hsl(var(--primary)/0.15)] ' +
              'transition-all duration-150 hover:brightness-110 hover:shadow-[0_2px_4px_hsl(var(--primary)/0.2)] ' +
              (className ?? '')
            }
          >
            <Hash className="w-3 h-3 shrink-0 opacity-80" strokeWidth={2.5} />
            <span className="truncate max-w-[140px]">{label}</span>
          </span>
        </TooltipTrigger>
        <TooltipContent side="top" sideOffset={4} className="text-xs">
          <div className="flex flex-col gap-0.5">
            <span className="font-medium">{label}</span>
            {provLabel && <span className="text-muted-foreground">{provLabel}</span>}
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

export default InstanceDot;
