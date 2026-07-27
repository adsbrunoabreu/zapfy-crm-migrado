import { forwardRef } from 'react';
import { Loader2 } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { formatCep } from '@/lib/viacep';
import { useCepLookup, type CepFields } from '@/hooks/useCepLookup';

export interface CepInputProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'onChange' | 'value'> {
  value: string;
  onChange: (value: string) => void;
  /** Disparado quando o ViaCEP retorna um endereço válido. */
  onAddressFound?: (fields: CepFields) => void;
  /** Some o spinner mesmo durante o lookup (default false). */
  hideSpinner?: boolean;
  /** Não mostra toasts ao falhar (default false). */
  silent?: boolean;
  className?: string;
}

/**
 * Input de CEP com máscara, autopreenchimento via ViaCEP no blur,
 * spinner de loading e toasts de erro padronizados.
 */
export const CepInput = forwardRef<HTMLInputElement, CepInputProps>(function CepInput(
  { value, onChange, onAddressFound, hideSpinner, silent, className, onBlur, ...rest },
  ref,
) {
  const { loading, lookup } = useCepLookup({ silent });

  const handleBlur = async (e: React.FocusEvent<HTMLInputElement>) => {
    onBlur?.(e);
    const fields = await lookup(value);
    if (fields && onAddressFound) onAddressFound(fields);
  };

  return (
    <div className="relative">
      <Input
        ref={ref}
        value={value}
        onChange={(e) => onChange(formatCep(e.target.value))}
        onBlur={handleBlur}
        placeholder={rest.placeholder ?? '00000-000'}
        inputMode="numeric"
        maxLength={9}
        className={cn(loading && !hideSpinner ? 'pr-9' : '', className)}
        {...rest}
      />
      {loading && !hideSpinner && (
        <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-muted-foreground" />
      )}
    </div>
  );
});
