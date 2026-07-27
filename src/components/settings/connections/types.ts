import type { ElementType } from 'react';
import { CheckCircle2, XCircle, Clock } from 'lucide-react';

export interface WhatsAppInstance {
  id: string;
  company_id: string;
  instance_name: string;
  display_name: string;
  status: string;
  phone_connected: string | null;
  created_at: string;
  updated_at: string;
  provider?: string | null;
  config?: Record<string, unknown> | null;
  color?: string | null;
  mode?: string | null;
  coexistence_state?: {
    history_status?: string | null;
    contacts_status?: string | null;
    last_sync_request_id?: string | null;
    history_progress?: number | null;
    contacts_progress?: number | null;
    error?: string | null;
  } | null;
}

export const QR_TIMEOUT_SECONDS = 45;

export const COEX_PHASE_LABEL: Record<string, string> = {
  pending: 'Aguardando início',
  syncing: 'Sincronizando',
  in_progress: 'Sincronizando',
  completed: 'Concluído',
  done: 'Concluído',
  declined: 'Recusado pelo usuário',
  failed: 'Falhou',
  error: 'Falhou',
};

export function coexPhaseTone(status?: string | null): string {
  if (!status) return 'text-muted-foreground';
  if (status === 'completed' || status === 'done') return 'text-[hsl(var(--emerald))]';
  if (status === 'failed' || status === 'error' || status === 'declined') return 'text-[hsl(var(--destructive))]';
  return 'text-[hsl(var(--amber))]';
}

export const STATUS_CONFIG: Record<string, { label: string; color: string; icon: ElementType }> = {
  connected: {
    label: 'Conectado',
    color: 'bg-[hsl(var(--emerald)/0.10)] text-[hsl(var(--emerald))] border-[hsl(var(--emerald)/0.20)]',
    icon: CheckCircle2,
  },
  disconnected: {
    label: 'Desconectado',
    color: 'bg-muted text-muted-foreground border-border',
    icon: XCircle,
  },
  connecting: {
    label: 'Conectando...',
    color: 'bg-[hsl(var(--amber)/0.10)] text-[hsl(var(--amber))] border-[hsl(var(--amber)/0.20)]',
    icon: Clock,
  },
};

export function formatRelativeTime(iso: string | null | undefined): string {
  if (!iso) return 'nunca';
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return 'nunca';
  const diffSec = Math.max(0, Math.floor((Date.now() - then) / 1000));
  if (diffSec < 60) return 'há instantes';
  if (diffSec < 3600) return `há ${Math.floor(diffSec / 60)} min`;
  if (diffSec < 86400) return `há ${Math.floor(diffSec / 3600)} h`;
  if (diffSec < 86400 * 30) return `há ${Math.floor(diffSec / 86400)} d`;
  return new Date(iso).toLocaleDateString('pt-BR');
}
