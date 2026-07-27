import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  APP_TIME_ZONE,
  APP_WEEK_STARTS_ON,
  appRangeToIso,
  getAppRangeForPreset,
  parseAppDateOnly,
  serializeAppDateRange,
} from './appDate';

const calendarDate = (date: Date) => ({
  year: date.getFullYear(),
  month: date.getMonth() + 1,
  day: date.getDate(),
  hour: date.getHours(),
  minute: date.getMinutes(),
  second: date.getSeconds(),
  millisecond: date.getMilliseconds(),
});

describe('appDate — filtros em America/Sao_Paulo', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('mantém a configuração do app em America/Sao_Paulo e semana começando na segunda-feira', () => {
    expect(APP_TIME_ZONE).toBe('America/Sao_Paulo');
    expect(APP_WEEK_STARTS_ON).toBe(1);
  });

  it('preset Hoje retorna 21/05/2026 do calendário de São Paulo, incluindo o dia inteiro', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-05-21T13:00:00.000Z')); // 10:00 em São Paulo

    const range = getAppRangeForPreset('today');

    expect(calendarDate(range.from)).toEqual({
      year: 2026,
      month: 5,
      day: 21,
      hour: 0,
      minute: 0,
      second: 0,
      millisecond: 0,
    });
    expect(calendarDate(range.to)).toEqual({
      year: 2026,
      month: 5,
      day: 21,
      hour: 23,
      minute: 59,
      second: 59,
      millisecond: 999,
    });
    expect(serializeAppDateRange(range)).toEqual({ from: '2026-05-21', to: '2026-05-21' });
    expect(appRangeToIso(range)).toEqual({
      fromIso: '2026-05-21T03:00:00.000Z',
      toIso: '2026-05-22T02:59:59.999Z',
    });
  });

  it('preset Últimos 7 dias inclui o dia de hoje e volta exatamente 6 dias', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-05-21T13:00:00.000Z')); // 10:00 em São Paulo

    const range = getAppRangeForPreset('7d');

    expect(serializeAppDateRange(range)).toEqual({ from: '2026-05-15', to: '2026-05-21' });
    expect(calendarDate(range.from)).toMatchObject({ year: 2026, month: 5, day: 15, hour: 0 });
    expect(calendarDate(range.to)).toMatchObject({ year: 2026, month: 5, day: 21, hour: 23 });
    expect(appRangeToIso(range)).toEqual({
      fromIso: '2026-05-15T03:00:00.000Z',
      toIso: '2026-05-22T02:59:59.999Z',
    });
  });

  it('não trata 00:30 UTC como dia 21 quando ainda é dia 20 em São Paulo', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-05-21T00:30:00.000Z')); // 21:30 do dia 20 em São Paulo

    const range = getAppRangeForPreset('today');

    expect(serializeAppDateRange(range)).toEqual({ from: '2026-05-20', to: '2026-05-20' });
  });

  it('parseia datas puras e ISOs legados sem deslocar YYYY-MM-DD para o dia anterior', () => {
    expect(serializeAppDateRange({
      from: parseAppDateOnly('2026-05-21')!,
      to: parseAppDateOnly('21/05/2026')!,
    })).toEqual({ from: '2026-05-21', to: '2026-05-21' });

    expect(serializeAppDateRange({
      from: parseAppDateOnly('2026-05-21T03:00:00.000Z')!,
      to: parseAppDateOnly('2026-05-22T02:59:59.999Z')!,
    })).toEqual({ from: '2026-05-21', to: '2026-05-21' });
  });
});