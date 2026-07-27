import { describe, it, expect } from 'vitest';
import {
  computeKpis,
  fillEvolutionBuckets,
  makeIsWonLead,
  type LeadRowLite,
  type PipelineStageLite,
  type DateRangeLite,
} from './dashboardMetrics';

const stages: PipelineStageLite[] = [
  { id: 's-open', stage_type: 'open' },
  { id: 's-won', stage_type: 'won' },
  { id: 's-lost', stage_type: 'lost' },
];

const lead = (over: Partial<LeadRowLite>): LeadRowLite => ({
  id: over.id ?? crypto.randomUUID(),
  status: over.status ?? 'new',
  value: over.value ?? 0,
  created_at: over.created_at ?? '2026-01-01T10:00:00Z',
  responded_at: over.responded_at ?? null,
  assigned_to: over.assigned_to ?? null,
  stage_id: over.stage_id ?? null,
  pipeline_id: over.pipeline_id ?? null,
});

describe('makeIsWonLead', () => {
  it('uses stage_type=won as source of truth when stages exist', () => {
    const isWon = makeIsWonLead(stages);
    expect(isWon(lead({ stage_id: 's-won', status: 'new' }))).toBe(true);
    expect(isWon(lead({ stage_id: 's-open', status: 'won' }))).toBe(false);
    expect(isWon(lead({ stage_id: null, status: 'won' }))).toBe(false);
  });

  it('falls back to legacy status when company has no stages', () => {
    const isWon = makeIsWonLead([]);
    expect(isWon(lead({ status: 'won' }))).toBe(true);
    expect(isWon(lead({ status: 'new' }))).toBe(false);
  });
});

describe('computeKpis', () => {
  const isWon = makeIsWonLead(stages);

  it('returns zeros for empty input', () => {
    const k = computeKpis([], isWon);
    expect(k).toMatchObject({
      total: 0,
      revenue: 0,
      conversionRate: 0,
      avgTicket: 0,
      avgResponseHours: 0,
      wonCount: 0,
    });
  });

  it('computes conversion rate based on stage_type=won', () => {
    const leads = [
      lead({ stage_id: 's-won', value: 100 }),
      lead({ stage_id: 's-won', value: 200 }),
      lead({ stage_id: 's-open', value: 50 }),
      lead({ stage_id: null, status: 'won', value: 999 }), // legacy ignored
    ];
    const k = computeKpis(leads, isWon);
    expect(k.total).toBe(4);
    expect(k.wonCount).toBe(2);
    expect(k.conversionRate).toBe(50);
    expect(k.revenue).toBe(1349);
    expect(k.avgTicket).toBe(1349 / 4);
  });

  it('avgResponseHours uses responded_at - created_at and ignores nulls', () => {
    const leads = [
      lead({
        created_at: '2026-01-01T10:00:00Z',
        responded_at: '2026-01-01T11:00:00Z', // 1h
      }),
      lead({
        created_at: '2026-01-01T10:00:00Z',
        responded_at: '2026-01-01T13:00:00Z', // 3h
      }),
      lead({ responded_at: null }), // ignored
    ];
    const k = computeKpis(leads, isWon);
    expect(k.respondedCount).toBe(2);
    expect(k.avgResponseHours).toBe(2);
  });

  it('clamps negative response intervals to zero', () => {
    const leads = [
      lead({
        created_at: '2026-01-01T11:00:00Z',
        responded_at: '2026-01-01T10:00:00Z', // negative
      }),
    ];
    const k = computeKpis(leads, isWon);
    expect(k.avgResponseHours).toBe(0);
  });
});

describe('fillEvolutionBuckets', () => {
  const isWon = makeIsWonLead(stages);
  const range: DateRangeLite = {
    startDate: new Date('2026-01-01T00:00:00Z'),
    endDate: new Date('2026-01-07T23:59:59Z'),
    period: '7d',
  };

  it('creates one bucket per day for a 7d range', () => {
    const out = fillEvolutionBuckets(range, [], [], isWon);
    expect(out).toHaveLength(7);
    out.forEach((b) =>
      expect(b).toMatchObject({ count: 0, messages: 0, won: 0 }),
    );
  });

  it('attributes leads, messages and won to the correct day bucket', () => {
    const leads = [
      lead({ created_at: '2026-01-02T10:00:00Z', stage_id: 's-won' }),
      lead({ created_at: '2026-01-02T15:00:00Z', stage_id: 's-open' }),
      lead({ created_at: '2026-01-05T08:00:00Z', stage_id: 's-won' }),
    ];
    const msgs = [
      { created_at: '2026-01-02T11:00:00Z' },
      { created_at: '2026-01-02T12:00:00Z' },
      { created_at: '2026-01-05T09:00:00Z' },
    ];
    const out = fillEvolutionBuckets(range, leads, msgs, isWon);
    // Buckets keyed by yyyy-MM-dd built from local midnight; assert by index.
    const day2 = out[1];
    const day5 = out[4];
    expect(day2.count).toBe(2);
    expect(day2.won).toBe(1);
    expect(day2.messages).toBe(2);
    expect(day5.count).toBe(1);
    expect(day5.won).toBe(1);
    expect(day5.messages).toBe(1);
    const totalWon = out.reduce((s, b) => s + b.won, 0);
    const totalMsgs = out.reduce((s, b) => s + b.messages, 0);
    expect(totalWon).toBe(2);
    expect(totalMsgs).toBe(3);
  });

  it('ignores leads outside the date range', () => {
    const leads = [
      lead({ created_at: '2025-12-30T10:00:00Z', stage_id: 's-won' }),
      lead({ created_at: '2026-02-01T10:00:00Z', stage_id: 's-won' }),
    ];
    const out = fillEvolutionBuckets(range, leads, [], isWon);
    expect(out.reduce((s, b) => s + b.count, 0)).toBe(0);
    expect(out.reduce((s, b) => s + b.won, 0)).toBe(0);
  });

  it('uses hourly buckets for the today period', () => {
    const todayRange: DateRangeLite = {
      startDate: new Date('2026-01-01T00:00:00Z'),
      endDate: new Date('2026-01-01T23:59:59Z'),
      period: 'today',
    };
    const out = fillEvolutionBuckets(todayRange, [], [], isWon);
    expect(out.length).toBeGreaterThanOrEqual(23);
    expect(out.length).toBeLessThanOrEqual(25);
  });
});
