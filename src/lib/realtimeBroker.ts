/**
 * Broker de Realtime — consolida em UM canal por empresa todas as
 * subscriptions de tabelas operacionais usadas por hooks auxiliares
 * (billing, unread, reports, etc.), em vez de cada hook abrir o seu próprio.
 *
 * Resultado prático: passamos de ~5-6 WebSocket subscriptions por tab
 * (billing-rt-X, unread-conversations-X, reports-rt-X, incoming-msg-X,
 * realtime-company-X) para 2 (chat_messages no RealtimeContext + este broker).
 *
 * Observações:
 * - O Supabase exige `.on(...)` ANTES de `.subscribe()`. Por isso o conjunto
 *   de tabelas é PRÉ-DECLARADO no `buildChannel()`. Para adicionar uma nova
 *   tabela, edite a lista `TABLE_FILTERS` abaixo.
 * - Consumers registram handlers via `subscribeBroker(...)`; o broker faz
 *   fan-out filtrando em memória por tabela e (opcionalmente) por filtro.
 * - Refcount automático: o canal é mantido enquanto houver pelo menos um
 *   handler ativo; é derrubado e refeito quando companyId muda.
 */

import type { RealtimeChannel } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';

export type BrokerEvent = 'INSERT' | 'UPDATE' | 'DELETE';
export type BrokerEventFilter = BrokerEvent | '*';

export interface BrokerPayload<T = Record<string, unknown>> {
  eventType: BrokerEvent;
  new: T;
  old: T;
}

type Handler = (payload: BrokerPayload) => void;

interface Subscription {
  table: string;
  event: BrokerEventFilter;
  /** Filtro em memória: "col=valor" (igualdade simples). Opcional. */
  matchKey?: { col: string; value: string };
  handler: Handler;
}

interface BrokerEntry {
  companyId: string;
  channel: RealtimeChannel | null;
  subs: Set<Subscription>;
}

const brokers = new Map<string, BrokerEntry>();

/**
 * Lista de tabelas + filtros que o broker pré-declara. Sempre que precisar
 * escutar uma nova tabela, adicione aqui (não esquecer da publicação
 * supabase_realtime no banco).
 *
 * `filter` é uma função que recebe o companyId e devolve a string de filtro
 * postgres_changes ou undefined quando a tabela não é tenant-scoped.
 */
const TABLE_FILTERS: Array<{ table: string; filter?: (cid: string) => string | undefined }> = [
  // Billing
  { table: 'companies', filter: (cid) => `id=eq.${cid}` },
  { table: 'invoices', filter: (cid) => `company_id=eq.${cid}` },
  { table: 'subscriptions', filter: (cid) => `company_id=eq.${cid}` },
  // Unread / chat lateral
  { table: 'conversations', filter: (cid) => `company_id=eq.${cid}` },
  // Reports / dashboards / financeiro / DRE
  { table: 'leads', filter: (cid) => `company_id=eq.${cid}` },
  { table: 'lead_history', filter: (cid) => `company_id=eq.${cid}` },
  { table: 'lead_tags' }, // sem company_id na tabela
  { table: 'lead_procedures' },
  { table: 'attendance_tickets', filter: (cid) => `company_id=eq.${cid}` },
  { table: 'attendance_ticket_events', filter: (cid) => `company_id=eq.${cid}` },
  { table: 'attendance_ticket_ratings', filter: (cid) => `company_id=eq.${cid}` },
  { table: 'financial_entries', filter: (cid) => `company_id=eq.${cid}` },
  { table: 'financial_categories', filter: (cid) => `company_id=eq.${cid}` },
  { table: 'appointments', filter: (cid) => `company_id=eq.${cid}` },
];

function buildChannel(entry: BrokerEntry) {
  if (entry.channel) {
    supabase.removeChannel(entry.channel).catch(() => undefined);
    entry.channel = null;
  }

  let ch = supabase.channel(`broker-${entry.companyId}`);

  for (const { table, filter } of TABLE_FILTERS) {
    const opts: any = { event: '*', schema: 'public', table };
    if (filter) {
      const f = filter(entry.companyId);
      if (f) opts.filter = f;
    }
    ch = ch.on('postgres_changes', opts, (payload: any) => {
      dispatch(entry, table, payload);
    });
  }

  ch.subscribe((status) => {
    if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
      // Reagenda rebuild leve — não trava se o socket cair.
      setTimeout(() => {
        if (brokers.get(entry.companyId) === entry && entry.subs.size > 0) {
          buildChannel(entry);
        }
      }, 5_000);
    }
  });

  entry.channel = ch;
}

function dispatch(entry: BrokerEntry, table: string, payload: any) {
  const eventType = payload.eventType as BrokerEvent;
  const newRow = (payload.new ?? {}) as Record<string, unknown>;
  const oldRow = (payload.old ?? {}) as Record<string, unknown>;

  for (const sub of entry.subs) {
    if (sub.table !== table) continue;
    if (sub.event !== '*' && sub.event !== eventType) continue;
    if (sub.matchKey) {
      const v =
        (newRow[sub.matchKey.col] as string | undefined) ??
        (oldRow[sub.matchKey.col] as string | undefined);
      if (v !== sub.matchKey.value) continue;
    }
    try {
      sub.handler({ eventType, new: newRow, old: oldRow });
    } catch (e) {
      console.error('[realtimeBroker] handler error', table, e);
    }
  }
}

function getOrCreate(companyId: string): BrokerEntry {
  let entry = brokers.get(companyId);
  if (!entry) {
    entry = { companyId, channel: null, subs: new Set() };
    brokers.set(companyId, entry);
    buildChannel(entry);
  }
  return entry;
}

/**
 * Registra um handler. Retorna a função de cleanup.
 *
 * @example
 * useEffect(() => subscribeBroker(companyId, {
 *   table: 'invoices', event: '*', handler: (p) => qc.invalidate(...)
 * }), [companyId]);
 */
export function subscribeBroker(
  companyId: string | null | undefined,
  sub: Omit<Subscription, 'table'> & { table: string },
): () => void {
  if (!companyId) return () => undefined;

  const entry = getOrCreate(companyId);
  entry.subs.add(sub);

  return () => {
    entry.subs.delete(sub);
    if (entry.subs.size === 0) {
      if (entry.channel) supabase.removeChannel(entry.channel).catch(() => undefined);
      brokers.delete(companyId);
    }
  };
}

/** Útil em testes ou logout para limpar tudo de uma vez. */
export function teardownAllBrokers() {
  for (const entry of brokers.values()) {
    if (entry.channel) supabase.removeChannel(entry.channel).catch(() => undefined);
  }
  brokers.clear();
}
