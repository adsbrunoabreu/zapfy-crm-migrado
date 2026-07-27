import { parsePhoneNumberFromString, type CountryCode } from 'libphonenumber-js';

export interface PhoneDisplay {
  countryCode: CountryCode | null;
  flagEmoji: string;
  dialCode: string; // ex: "+55"
  nationalNumber: string; // formatado nacional, ex: "(11) 98765-4321"
  formatted: string; // internacional formatado
  raw: string;
}

function isoToFlag(iso: string): string {
  if (!iso || iso.length !== 2) return '🏳️';
  const A = 0x1f1e6;
  const cp1 = A + iso.toUpperCase().charCodeAt(0) - 65;
  const cp2 = A + iso.toUpperCase().charCodeAt(1) - 65;
  return String.fromCodePoint(cp1, cp2);
}

export function getPhoneDisplay(raw: string | null | undefined): PhoneDisplay {
  const input = String(raw || '').trim();
  const empty: PhoneDisplay = {
    countryCode: null,
    flagEmoji: '🏳️',
    dialCode: '',
    nationalNumber: '',
    formatted: '',
    raw: input,
  };
  if (!input) return empty;

  const digits = input.replace(/\D/g, '');
  if (!digits) return empty;

  // Tenta parse internacional (com +)
  const withPlus = input.startsWith('+') ? input : `+${digits}`;
  let parsed = parsePhoneNumberFromString(withPlus);

  // Se inválido e parece ser BR sem DDI (10/11 dígitos), tenta como BR
  if ((!parsed || !parsed.isValid()) && (digits.length === 10 || digits.length === 11)) {
    parsed = parsePhoneNumberFromString(digits, 'BR');
  }

  if (!parsed || !parsed.country) {
    return {
      ...empty,
      dialCode: digits.length > 10 ? `+${digits.slice(0, Math.min(3, digits.length - 10))}` : '',
      nationalNumber: digits,
      formatted: digits.length > 10 ? `+${digits}` : digits,
    };
  }

  return {
    countryCode: parsed.country,
    flagEmoji: isoToFlag(parsed.country),
    dialCode: `+${parsed.countryCallingCode}`,
    nationalNumber: parsed.formatNational(),
    formatted: parsed.formatInternational(),
    raw: input,
  };
}
