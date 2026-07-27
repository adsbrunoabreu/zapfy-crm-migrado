import { useEffect } from 'react';
import {
  subscribeBroker,
  type BrokerEventFilter,
  type BrokerPayload,
} from '@/lib/realtimeBroker';

interface Options {
  table: string;
  event?: BrokerEventFilter;
  /** Filtro adicional em memória ("col=val"). Já que o broker compartilha
   *  o canal entre vários consumers, este filtro evita rodar o handler
   *  para linhas que não interessam ao chamador. */
  match?: { col: string; value: string };
  enabled?: boolean;
}

/**
 * Hook ergonômico em cima do `realtimeBroker`. Use sempre que precisar
 * reagir a INSERT/UPDATE/DELETE de uma tabela já pré-declarada em
 * `TABLE_FILTERS` (ver `src/lib/realtimeBroker.ts`).
 *
 * IMPORTANTE: o handler é capturado por referência — passe sempre uma
 * função estável (`useCallback`) ou inclua no `deps`.
 */
export function useRealtimeTable(
  companyId: string | null | undefined,
  opts: Options,
  handler: (p: BrokerPayload) => void,
  deps: ReadonlyArray<unknown> = [],
) {
  useEffect(() => {
    if (!companyId || opts.enabled === false) return;
    return subscribeBroker(companyId, {
      table: opts.table,
      event: opts.event ?? '*',
      matchKey: opts.match,
      handler,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyId, opts.table, opts.event, opts.match?.col, opts.match?.value, opts.enabled, ...deps]);
}
