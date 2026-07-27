import { addDays, subDays } from 'date-fns';

export const APP_TIME_ZONE = 'America/Sao_Paulo';
export const APP_LOCALE = 'pt-BR';
export const APP_WEEK_STARTS_ON = 1;

export type AppDateRange = { from: Date; to: Date };

type Parts = { year: number; month: number; day: number; hour: number; minute: number; second: number };

const dtfCache = new Map<string, Intl.DateTimeFormat>();

function getFormatter(timeZone = APP_TIME_ZONE) {
  const cached = dtfCache.get(timeZone);
  if (cached) return cached;
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  });
  dtfCache.set(timeZone, fmt);
  return fmt;
}

function getTimeZoneParts(date = new Date(), timeZone = APP_TIME_ZONE): Parts {
  const values: Record<string, number> = {};
  getFormatter(timeZone).formatToParts(date).forEach((part) => {
    if (part.type !== 'literal') values[part.type] = Number(part.value);
  });
  return {
    year: values.year,
    month: values.month,
    day: values.day,
    hour: values.hour,
    minute: values.minute,
    second: values.second,
  };
}

function getTimeZoneOffsetMs(date: Date, timeZone = APP_TIME_ZONE) {
  const p = getTimeZoneParts(date, timeZone);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return asUtc - (date.getTime() - date.getMilliseconds());
}

function zonedDateTimeToUtc(
  year: number,
  month: number,
  day: number,
  hour = 0,
  minute = 0,
  second = 0,
  millisecond = 0,
  timeZone = APP_TIME_ZONE,
) {
  const utcGuess = Date.UTC(year, month - 1, day, hour, minute, second, millisecond);
  const offset = getTimeZoneOffsetMs(new Date(utcGuess), timeZone);
  let utc = utcGuess - offset;
  const nextOffset = getTimeZoneOffsetMs(new Date(utc), timeZone);
  if (offset !== nextOffset) utc = utcGuess - nextOffset;
  return new Date(utc);
}

function calendarParts(date: Date) {
  return { year: date.getFullYear(), month: date.getMonth() + 1, day: date.getDate() };
}

export function getAppToday(reference = new Date()) {
  const p = getTimeZoneParts(reference);
  return new Date(p.year, p.month - 1, p.day);
}

export function startOfAppDay(date: Date) {
  const p = calendarParts(date);
  return new Date(p.year, p.month - 1, p.day, 0, 0, 0, 0);
}

export function endOfAppDay(date: Date) {
  const p = calendarParts(date);
  return new Date(p.year, p.month - 1, p.day, 23, 59, 59, 999);
}

export function startOfAppMonth(date = getAppToday()) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

export function startOfAppYear(date = getAppToday()) {
  return new Date(date.getFullYear(), 0, 1);
}

export function appDayStartUtc(date: Date) {
  const p = calendarParts(date);
  return zonedDateTimeToUtc(p.year, p.month, p.day, 0, 0, 0, 0);
}

export function appDayEndUtc(date: Date) {
  const p = calendarParts(date);
  return zonedDateTimeToUtc(p.year, p.month, p.day, 23, 59, 59, 999);
}

export function appRangeToUtc(range: AppDateRange) {
  return { from: appDayStartUtc(range.from), to: appDayEndUtc(range.to) };
}

export function appDateFromInstant(date: Date) {
  const p = getTimeZoneParts(date);
  return new Date(p.year, p.month - 1, p.day, p.hour, p.minute, p.second, date.getMilliseconds());
}

export function appDateKey(date: Date) {
  const p = getTimeZoneParts(date);
  return `${p.year}-${String(p.month).padStart(2, '0')}-${String(p.day).padStart(2, '0')}`;
}

export function isSameAppDay(left: Date, right: Date) {
  return appDateKey(left) === appDateKey(right);
}

export function isAppToday(date: Date, reference = new Date()) {
  return isSameAppDay(date, reference);
}

export function isAppYesterday(date: Date, reference = new Date()) {
  return isSameAppDay(date, appDayStartUtc(subDays(getAppToday(reference), 1)));
}

export function appRangeToIso(range: AppDateRange) {
  const utc = appRangeToUtc(range);
  return { fromIso: utc.from.toISOString(), toIso: utc.to.toISOString() };
}

export function isIsoWithinAppRange(iso: string | null | undefined, range: AppDateRange) {
  if (!iso) return false;
  const ts = new Date(iso).getTime();
  if (!Number.isFinite(ts)) return false;
  const utc = appRangeToUtc(range);
  return ts >= utc.from.getTime() && ts <= utc.to.getTime();
}

export function getAppRangeForPreset(key: string): AppDateRange {
  const today = getAppToday();
  switch (key) {
    case 'today': return { from: startOfAppDay(today), to: endOfAppDay(today) };
    case 'yesterday': {
      const y = subDays(today, 1);
      return { from: startOfAppDay(y), to: endOfAppDay(y) };
    }
    case '7d': return { from: startOfAppDay(subDays(today, 6)), to: endOfAppDay(today) };
    case '15d': return { from: startOfAppDay(subDays(today, 14)), to: endOfAppDay(today) };
    case '30d': return { from: startOfAppDay(subDays(today, 29)), to: endOfAppDay(today) };
    case '60d': return { from: startOfAppDay(subDays(today, 59)), to: endOfAppDay(today) };
    case '90d': return { from: startOfAppDay(subDays(today, 89)), to: endOfAppDay(today) };
    case 'mtd': return { from: startOfAppMonth(today), to: endOfAppDay(today) };
    case 'ytd': return { from: startOfAppYear(today), to: endOfAppDay(today) };
    default: return { from: startOfAppDay(subDays(today, 29)), to: endOfAppDay(today) };
  }
}

export function previousAppRange(range: AppDateRange) {
  const start = startOfAppDay(range.from);
  const end = endOfAppDay(range.to);
  const days = Math.max(1, Math.round((startOfAppDay(end).getTime() - start.getTime()) / 86400000) + 1);
  return { from: startOfAppDay(subDays(start, days)), to: endOfAppDay(subDays(end, days)) };
}

export function toAppDateInputValue(date = getAppToday()) {
  const p = calendarParts(date);
  return `${p.year}-${String(p.month).padStart(2, '0')}-${String(p.day).padStart(2, '0')}`;
}

export function addAppDays(date: Date, amount: number) {
  return addDays(date, amount);
}

/**
 * Serializa uma data como string calendário (YYYY-MM-DD) usando as partes
 * locais do `Date` (que sempre representam um dia do calendário do app, pois
 * todos os helpers acima criam o `Date` com construtor local). NÃO usa
 * `toISOString()` para evitar deslocar para o dia anterior em fusos negativos.
 */
export function serializeAppDate(date: Date): string {
  return toAppDateInputValue(date);
}

/**
 * Parseia uma string de data do app. Aceita:
 *   - 'YYYY-MM-DD'           (formato canônico do app)
 *   - 'DD/MM/YYYY' / 'DD-MM-YYYY'
 *   - ISO completo (compat. com ranges antigos persistidos como toISOString()).
 *     Nesse caso, converte para o dia calendário em America/Sao_Paulo.
 * Retorna um `Date` local representando 00:00:00 do dia calendário, ou `null`.
 */
export function parseAppDateOnly(value: string | null | undefined): Date | null {
  if (!value) return null;

  // YYYY-MM-DD
  const iso = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (iso) {
    const y = +iso[1], m = +iso[2], d = +iso[3];
    if (m < 1 || m > 12 || d < 1 || d > 31) return null;
    const r = new Date(y, m - 1, d, 0, 0, 0, 0);
    if (r.getFullYear() !== y || r.getMonth() !== m - 1 || r.getDate() !== d) return null;
    return r;
  }

  // DD/MM/YYYY or DD-MM-YYYY
  const dmy = value.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/);
  if (dmy) {
    const d = +dmy[1], m = +dmy[2];
    let y = +dmy[3];
    if (y < 100) y += 2000;
    if (m < 1 || m > 12 || d < 1 || d > 31) return null;
    const r = new Date(y, m - 1, d, 0, 0, 0, 0);
    if (r.getFullYear() !== y || r.getMonth() !== m - 1 || r.getDate() !== d) return null;
    return r;
  }

  // ISO completo (compat retroativa)
  const full = new Date(value);
  if (!isNaN(full.getTime())) {
    const p = getTimeZoneParts(full);
    return new Date(p.year, p.month - 1, p.day, 0, 0, 0, 0);
  }

  return null;
}

/**
 * Parseia um range persistido. Aceita tanto o formato novo (YYYY-MM-DD) quanto
 * o legado (ISO de toISOString()). Sempre retorna datas calendário do app.
 */
export function parsePersistedAppDateRange(
  raw: { from?: string | null; to?: string | null } | null | undefined,
): AppDateRange | undefined {
  if (!raw) return undefined;
  const from = parseAppDateOnly(raw.from ?? undefined);
  const to = parseAppDateOnly(raw.to ?? undefined);
  if (!from || !to) return undefined;
  return { from: startOfAppDay(from), to: endOfAppDay(to) };
}

/** Serializa um range para localStorage no formato canônico YYYY-MM-DD. */
export function serializeAppDateRange(range: AppDateRange): { from: string; to: string } {
  return { from: serializeAppDate(range.from), to: serializeAppDate(range.to) };
}