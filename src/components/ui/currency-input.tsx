import * as React from 'react';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

/**
 * CurrencyInput — máscara de moeda BRL.
 *
 * Comportamento: o usuário digita apenas dígitos. O valor é interpretado
 * em centavos e exibido como "1.234,56". Isso evita o erro clássico de
 * digitar "202496" e o sistema persistir R$ 202.496 quando o usuário
 * pretendia R$ 2.024,96.
 *
 * - `value` é o número em reais (ex.: 2024.96). null/undefined = vazio.
 * - `onValueChange(n | null)` devolve o valor em reais.
 */
export interface CurrencyInputProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange' | 'type'> {
  value: number | null | undefined;
  onValueChange: (value: number | null) => void;
  /** Mostra o prefixo "R$" dentro do input. Default: true. */
  showPrefix?: boolean;
  className?: string;
}

const BRL = new Intl.NumberFormat('pt-BR', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

function formatFromCents(cents: number): string {
  return BRL.format(cents / 100);
}

function digitsOnly(s: string): string {
  return (s || '').replace(/\D+/g, '');
}

export const CurrencyInput = React.forwardRef<HTMLInputElement, CurrencyInputProps>(
  ({ value, onValueChange, showPrefix = true, className, placeholder = '0,00', disabled, readOnly, ...rest }, ref) => {
    // Estado local em centavos como string de dígitos. Sincroniza com `value` externo.
    const [digits, setDigits] = React.useState<string>(() =>
      value == null || Number.isNaN(value) ? '' : String(Math.round(Number(value) * 100))
    );

    React.useEffect(() => {
      const next = value == null || Number.isNaN(value) ? '' : String(Math.round(Number(value) * 100));
      // Evita loop: só atualiza se o número externo divergir do atual
      const currentReais = digits === '' ? null : Number(digits) / 100;
      const externalReais = value == null || Number.isNaN(value) ? null : Number(value);
      if (currentReais !== externalReais) {
        setDigits(next);
      }
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [value]);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      const raw = digitsOnly(e.target.value).replace(/^0+/, '');
      setDigits(raw);
      if (raw === '') {
        onValueChange(null);
      } else {
        onValueChange(Number(raw) / 100);
      }
    };

    const display = digits === '' ? '' : formatFromCents(Number(digits));

    return (
      <div className="relative">
        {showPrefix && (
          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
            R$
          </span>
        )}
        <Input
          ref={ref}
          type="text"
          inputMode="numeric"
          autoComplete="off"
          disabled={disabled}
          readOnly={readOnly}
          value={display}
          onChange={handleChange}
          placeholder={placeholder}
          className={cn(showPrefix && 'pl-9', className)}
          {...rest}
        />
      </div>
    );
  }
);
CurrencyInput.displayName = 'CurrencyInput';
