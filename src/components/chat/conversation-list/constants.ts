import {
  Inbox, UserCheck, CheckCircle2, CircleDot, EyeOff, Clock,
} from 'lucide-react';
import type { StatusOption, SortOption } from './types';

export const STATUS_FILTERS: StatusOption[] = [
  { value: 'all', label: 'Todas', icon: Inbox, color: 'text-muted-foreground' },
  { value: 'unread', label: 'Não lidas', icon: CircleDot, color: 'text-rose' },
  { value: 'waiting', label: 'Aguardando', icon: Clock, color: 'text-amber' },
  { value: 'in_progress', label: 'Em aberto', icon: UserCheck, color: 'text-emerald' },
  { value: 'closed', label: 'Finalizadas', icon: CheckCircle2, color: 'text-cyan' },
  { value: 'hidden', label: 'Ocultas', icon: EyeOff, color: 'text-muted-foreground' },
];

export const SORT_OPTIONS: SortOption[] = [
  { value: 'recent', label: 'Mais recentes', description: 'Não lidas primeiro, depois por última mensagem' },
  { value: 'selected-tags', label: 'Tags selecionadas no topo', description: 'Prioriza leads que correspondem ao filtro de tags' },
  { value: 'most-tags', label: 'Mais tags primeiro', description: 'Leads com maior quantidade de tags no topo' },
];
