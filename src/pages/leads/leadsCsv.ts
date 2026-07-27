import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import type { Lead } from '@/hooks/useLeads';
import { statusConfig } from './constants';

export function exportLeadsCsv(leads: Lead[]) {
  if (leads.length === 0) return;
  const escape = (v: unknown) => {
    if (v == null) return '';
    const s = String(v).replace(/"/g, '""');
    return /[",;\n\r]/.test(s) ? `"${s}"` : s;
  };
  const headers = [
    'Nome', 'Telefone', 'E-mail', 'Pipeline', 'Estágio', 'Status',
    'Responsável', 'Valor', 'Criado em', 'Atualizado em',
    'Fechado em', 'Fechado por', 'Motivo da perda', 'Observações',
  ];
  const rows = leads.map(l => [
    l.name, l.phone ?? '', l.email ?? '',
    l.pipeline?.name ?? '', l.stage?.name ?? '',
    statusConfig[l.status]?.label ?? l.status,
    l.assignee?.full_name || l.assignee?.email || '',
    l.value ?? '',
    l.created_at ? format(new Date(l.created_at), 'dd/MM/yyyy HH:mm', { locale: ptBR }) : '',
    l.updated_at ? format(new Date(l.updated_at), 'dd/MM/yyyy HH:mm', { locale: ptBR }) : '',
    l.closed_at ? format(new Date(l.closed_at), 'dd/MM/yyyy HH:mm', { locale: ptBR }) : '',
    l.closer?.full_name || l.closer?.email || '',
    l.loss_reason?.label || l.loss_reason_text || '',
    l.notes ?? '',
  ]);
  const lines = [headers.map(escape).join(';'), ...rows.map(r => r.map(escape).join(';'))];
  const blob = new Blob(['\uFEFF' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const stamp = new Date().toISOString().slice(0, 10);
  const a = document.createElement('a');
  a.href = url;
  a.download = `leads_${stamp}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
