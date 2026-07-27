import { ReactNode, ReactElement, cloneElement, isValidElement, useId } from 'react';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';

interface FormFieldProps {
  label?: ReactNode;
  /** Texto auxiliar abaixo do campo (text-xs muted) */
  hint?: ReactNode;
  /** Mensagem de erro. Se presente, sobrescreve hint e marca o campo */
  error?: string | null;
  /** Indica que o campo é obrigatório (asterisco discreto) */
  required?: boolean;
  /** O input/select/textarea — receberá id e aria-describedby automaticamente */
  children: ReactElement;
  className?: string;
  /** Ocultar label visualmente mas manter para a11y */
  srOnlyLabel?: boolean;
}

/**
 * Wrapper padrão de campos de formulário.
 *
 * - Label acima (text-sm font-medium)
 * - Helper text abaixo (text-xs text-muted-foreground)
 * - Estado de erro com border destructive + texto destructive
 *
 * Aplica `id`, `aria-invalid` e `aria-describedby` no filho automaticamente.
 */
export function FormField({
  label,
  hint,
  error,
  required,
  children,
  className,
  srOnlyLabel,
}: FormFieldProps) {
  const reactId = useId();
  const childProps = isValidElement(children) ? (children.props as Record<string, unknown>) : {};
  const fieldId = (childProps.id as string | undefined) || `field-${reactId}`;
  const describedById = error || hint ? `${fieldId}-desc` : undefined;

  const enhancedChild = isValidElement(children)
    ? cloneElement(children, {
        id: fieldId,
        'aria-invalid': error ? true : undefined,
        'aria-describedby': describedById,
        className: cn(
          (childProps.className as string | undefined) || '',
          error && 'border-destructive focus-visible:ring-destructive/40',
        ),
      } as Record<string, unknown>)
    : children;

  return (
    <div className={cn('space-y-1.5', className)}>
      {label && (
        <Label
          htmlFor={fieldId}
          className={cn('flex items-center gap-1', srOnlyLabel && 'sr-only')}
        >
          <span>{label}</span>
          {required && <span className="text-destructive" aria-hidden="true">*</span>}
        </Label>
      )}
      {enhancedChild}
      {(error || hint) && (
        <p
          id={describedById}
          className={cn(
            'text-xs',
            error ? 'text-destructive' : 'text-muted-foreground',
          )}
        >
          {error || hint}
        </p>
      )}
    </div>
  );
}
