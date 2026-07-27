/**
 * Página unificada de Oportunidades.
 *
 * Apenas roteia entre Pipelines (Kanban) e Leads (Lista) baseado no
 * query param `?view=`. O toggle visual fica no header de cada página
 * filha (componente OpportunityViewToggle), evitando barras duplicadas.
 */
import { useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import PipelinesPage from './Pipelines';
import LeadsPage from './Leads';
import { useAuth } from '@/contexts/AuthContext';

type ViewMode = 'kanban' | 'list';
const STORAGE_PREFIX = 'opps-view-mode';

function readStored(companyId?: string | null): ViewMode {
  if (typeof window === 'undefined') return 'kanban';
  const key = `${STORAGE_PREFIX}:${companyId ?? 'anon'}`;
  const stored = window.localStorage.getItem(key);
  return stored === 'list' ? 'list' : 'kanban';
}

export default function Opportunities() {
  const { profile } = useAuth();
  const [params] = useSearchParams();
  const queryView = params.get('view');

  const view: ViewMode = useMemo(() => {
    if (queryView === 'kanban' || queryView === 'list') return queryView;
    return readStored(profile?.company_id);
  }, [queryView, profile?.company_id]);

  return view === 'kanban' ? <PipelinesPage /> : <LeadsPage />;
}
