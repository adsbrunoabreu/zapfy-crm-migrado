import { Info } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

interface Props {
  /** Texto curto descrevendo a métrica. */
  title?: string;
  /** Definição em linguagem natural. */
  definition: string;
  /** Fórmula simbólica (ex: "MRR / Empresas ativas"). */
  formula?: string;
  /** Observações ou avisos extras. */
  note?: string;
  className?: string;
  side?: 'top' | 'right' | 'bottom' | 'left';
  align?: 'start' | 'center' | 'end';
}

/**
 * Ícone "i" com tooltip de definição/fórmula. Use ao lado de títulos
 * de KPIs, gráficos e colunas de tabela do Master Dashboard.
 */
export function InfoHint({
  title,
  definition,
  formula,
  note,
  className,
  side = 'top',
  align = 'center',
}: Props) {
  return (
    <Tooltip delayDuration={150}>
      <TooltipTrigger asChild>
        <button
          type="button"
          aria-label={title ? `Sobre ${title}` : 'Mais informações'}
          className={cn(
            'inline-flex items-center justify-center rounded-full text-muted-foreground/70',
            'hover:text-foreground transition-colors focus:outline-none focus:ring-1 focus:ring-ring',
            className,
          )}
        >
          <Info className="w-3.5 h-3.5" />
        </button>
      </TooltipTrigger>
      <TooltipContent
        side={side}
        align={align}
        collisionPadding={12}
        className="max-w-[min(20rem,calc(100vw-2rem))] space-y-1.5 text-xs break-words"
      >
        {title && <p className="font-semibold text-foreground break-words">{title}</p>}
        <p className="text-muted-foreground leading-relaxed break-words">{definition}</p>
        {formula && (
          <p className="font-mono text-[11px] text-foreground bg-secondary/60 px-1.5 py-0.5 rounded whitespace-pre-wrap break-words">
            {formula}
          </p>
        )}
        {note && <p className="text-[11px] italic text-muted-foreground break-words">{note}</p>}
      </TooltipContent>
    </Tooltip>
  );
}
