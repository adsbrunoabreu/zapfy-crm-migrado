import { Badge } from '@/components/ui/badge';
import { CheckCircle2, Clock, XCircle } from 'lucide-react';

export const AVAILABLE_EVENTS = [
  { value: 'message.received', label: 'Mensagem recebida', group: 'WhatsApp' },
  { value: 'message.sent', label: 'Mensagem enviada', group: 'WhatsApp' },
  { value: 'lead.created', label: 'Lead criado', group: 'CRM' },
  { value: 'lead.updated', label: 'Lead atualizado', group: 'CRM' },
  { value: 'lead.stage_changed', label: 'Lead mudou de etapa', group: 'CRM' },
  { value: 'lead.transferred', label: 'Lead transferido', group: 'CRM' },
] as const;

export interface WebhookRecord {
  id: string;
  company_id: string;
  name: string;
  url: string;
  secret: string;
  events: string[];
  instance_ids: string[];
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface Delivery {
  id: string;
  webhook_id: string;
  company_id: string;
  event: string;
  correlation_id: string;
  payload: any;
  status: 'pending' | 'success' | 'failed' | 'dead';
  attempt: number;
  max_attempts: number;
  next_attempt_at: string;
  last_request_headers: any;
  last_response_status: number | null;
  last_response_body: string | null;
  last_error: string | null;
  duration_ms: number | null;
  delivered_at: string | null;
  created_at: string;
  updated_at: string;
}

export function generateSecret() {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, '0')).join('');
}

export function statusBadge(status: string) {
  const map: Record<string, { label: string; cls: string; icon: any }> = {
    success: { label: 'Sucesso', cls: 'bg-emerald/10 text-emerald border-emerald/30', icon: CheckCircle2 },
    pending: { label: 'Pendente', cls: 'bg-amber/10 text-amber border-amber/30', icon: Clock },
    failed: { label: 'Falhou', cls: 'bg-orange-500/10 text-orange-400 border-orange-500/30', icon: XCircle },
    dead: { label: 'Definitivo', cls: 'bg-destructive/10 text-destructive border-destructive/30', icon: XCircle },
  };
  const cfg = map[status] ?? map.pending;
  const Icon = cfg.icon;
  return (
    <Badge variant="outline" className={cfg.cls}>
      <Icon className="h-3 w-3 mr-1" /> {cfg.label}
    </Badge>
  );
}
