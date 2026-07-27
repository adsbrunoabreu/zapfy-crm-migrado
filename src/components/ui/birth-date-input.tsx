import { forwardRef, useEffect, useState } from 'react';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

export function isoToBr(value: string | Date | null | undefined): string {
  if (!value) return '';
  if (value instanceof Date) {
    if (isNaN(value.getTime())) return '';
    const dd = String(value.getDate()).padStart(2, '0');
    const mm = String(value.getMonth() + 1).padStart(2, '0');
    return `${dd}/${mm}/${value.getFullYear()}`;
  }
  const m = String(value).match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return '';
  return `${m[3]}/${m[2]}/${m[1]}`;
}

export function brToIso(value: string): string | null {
  const m = value.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!m) return null;
  const [, dd, mm, yyyy] = m;
  const day = Number(dd);
  const month = Number(mm);
  const year = Number(yyyy);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  if (year < 1900 || year > 2100) return null;
  return `${yyyy}-${mm}-${dd}`;
}

function applyMask(raw: string): string {
  const digits = raw.replace(/\D/g, '').slice(0, 8);
  const parts: string[] = [];
  if (digits.length > 0) parts.push(digits.slice(0, 2));
  if (digits.length > 2) parts.push(digits.slice(2, 4));
  if (digits.length > 4) parts.push(digits.slice(4, 8));
  return parts.join('/');
}

interface BirthDateInputProps {
  value: string | Date | null | undefined;
  onChange: (iso: string | null) => void;
  className?: string;
  placeholder?: string;
  disabled?: boolean;
}

export const BirthDateInput = forwardRef<HTMLInputElement, BirthDateInputProps>(
  ({ value, onChange, className, placeholder = 'dd/mm/aaaa', disabled }, ref) => {
    const [text, setText] = useState(() => isoToBr(value));

    useEffect(() => {
      const incomingIso =
        value instanceof Date
          ? (isNaN(value.getTime()) ? null : value.toISOString().slice(0, 10))
          : (value ? String(value).slice(0, 10) : null);
      if (brToIso(text) === incomingIso) return;
      setText(isoToBr(value));
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [value]);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      const masked = applyMask(e.target.value);
      setText(masked);
      onChange(masked === '' ? null : brToIso(masked));
    };

    return (
      <Input
        ref={ref}
        type="text"
        inputMode="numeric"
        autoComplete="bday"
        value={text}
        onChange={handleChange}
        placeholder={placeholder}
        disabled={disabled}
        maxLength={10}
        className={cn('h-9', className)}
      />
    );
  },
);
BirthDateInput.displayName = 'BirthDateInput';
