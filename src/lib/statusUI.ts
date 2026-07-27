import { CheckCircle2, AlertTriangle, AlertCircle, Info, Clock, type LucideIcon } from 'lucide-react';

export type StatusTone = 'success' | 'warning' | 'danger' | 'info' | 'pending' | 'muted';

export const STATUS_ICON: Record<StatusTone, LucideIcon> = {
  success: CheckCircle2,
  warning: AlertTriangle,
  danger: AlertCircle,
  info: Info,
  pending: Clock,
  muted: Info,
};

/** Classes utilitárias definidas em src/index.css */
export const STATUS_PILL: Record<StatusTone, string> = {
  success: 'status-pill-success',
  warning: 'status-pill-warning',
  danger:  'status-pill-danger',
  info:    'status-pill-info',
  pending: 'status-pill-warning',
  muted:   'status-pill-muted',
};

export const STATUS_TEXT: Record<StatusTone, string> = {
  success: 'status-success',
  warning: 'status-warning',
  danger:  'status-danger',
  info:    'status-info',
  pending: 'status-warning',
  muted:   'status-muted',
};

export const STATUS_DOT: Record<StatusTone, string> = {
  success: 'status-dot-success',
  warning: 'status-dot-warning',
  danger:  'status-dot-danger',
  info:    'status-dot-info',
  pending: 'status-dot-warning',
  muted:   'status-dot-muted',
};
