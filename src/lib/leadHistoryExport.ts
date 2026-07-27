import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { supabase } from '@/integrations/supabase/client';

// ─────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────

export interface LeadExportInfo {
  id: string;
  name: string;
  phone?: string | null;
  email?: string | null;
  company_name?: string | null;
  pipeline_name?: string | null;
  stage_name?: string | null;
  assignee_name?: string | null;
  numeric_id?: number | null;
}

interface RawConversation {
  id: string;
  remote_jid: string;
  phone: string;
  contact_name: string | null;
  instance_name: string;
}

interface RawMessage {
  id: string;
  message_id: string;
  conversation_id: string;
  from_me: boolean;
  message_type: string;
  content: string | null;
  media_mimetype: string | null;
  file_name: string | null;
  duration: number | null;
  latitude: number | null;
  longitude: number | null;
  reaction_emoji: string | null;
  status: string;
  sender_name: string | null;
  timestamp: string;
}

export interface LeadHistoryRow {
  index: number;
  timestamp: string;
  direction: 'Enviada' | 'Recebida';
  type: string;
  sender: string;
  content: string;
  status: string;
  messageId: string;
  conversationPhone: string;
}

export interface LeadHistoryBundle {
  conversations: RawConversation[];
  rows: LeadHistoryRow[];
  totalMessages: number;
  firstAt: string | null;
  lastAt: string | null;
}

// ─────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────

const PAGE_SIZE = 1000;

const fmtDate = (ts: string | number | Date) =>
  new Date(ts).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'medium' });

const slugify = (s: string) =>
  (s || 'lead')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40) || 'lead';

const fileStamp = () => {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}`;
};

const baseFileName = (lead: LeadExportInfo) =>
  `historico-${slugify(lead.name)}${lead.numeric_id ? `-${lead.numeric_id}` : ''}-${fileStamp()}`;

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function formatDuration(sec?: number | null) {
  if (!sec || sec <= 0) return '';
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return ` ${m}:${String(s).padStart(2, '0')}`;
}

function describeMessage(m: RawMessage): { type: string; content: string } {
  const typeMap: Record<string, string> = {
    text: 'Texto',
    image: 'Imagem',
    audio: 'Áudio',
    video: 'Vídeo',
    document: 'Documento',
    sticker: 'Sticker',
    location: 'Localização',
    contact: 'Contato',
    reaction: 'Reação',
  };
  const typeLabel = typeMap[m.message_type] || m.message_type || 'Desconhecido';

  if (m.reaction_emoji) {
    return { type: 'Reação', content: `[Reação: ${m.reaction_emoji}]${m.content ? ` ${m.content}` : ''}` };
  }

  switch (m.message_type) {
    case 'text':
      return { type: typeLabel, content: m.content || '' };
    case 'image':
      return { type: typeLabel, content: m.content ? `[Imagem] ${m.content}` : '[Imagem]' };
    case 'audio':
      return { type: typeLabel, content: `[Áudio${formatDuration(m.duration)}]` };
    case 'video':
      return { type: typeLabel, content: m.content ? `[Vídeo] ${m.content}` : '[Vídeo]' };
    case 'document':
      return { type: typeLabel, content: `[Documento${m.file_name ? `: ${m.file_name}` : ''}]` };
    case 'sticker':
      return { type: typeLabel, content: '[Sticker]' };
    case 'location':
      return {
        type: typeLabel,
        content: `[Localização${m.latitude != null && m.longitude != null ? `: ${m.latitude}, ${m.longitude}` : ''}]`,
      };
    default:
      return { type: typeLabel, content: m.content || `[${typeLabel}]` };
  }
}

const STATUS_LABEL: Record<string, string> = {
  pending: 'Pendente',
  sending: 'Enviando',
  uploading: 'Enviando',
  sent: 'Enviada',
  delivered: 'Entregue',
  read: 'Lida',
  played: 'Reproduzida',
  failed: 'Falhou',
  error: 'Erro',
};

// ─────────────────────────────────────────────────────────────
// Fetch
// ─────────────────────────────────────────────────────────────

export async function fetchLeadHistory(leadId: string): Promise<LeadHistoryBundle> {
  // 1) Conversas vinculadas
  const { data: convs, error: convErr } = await supabase
    .from('conversations')
    .select('id, remote_jid, phone, contact_name, instance_name')
    .eq('lead_id', leadId)
    .limit(100);
  if (convErr) throw convErr;

  const conversations = (convs || []) as RawConversation[];
  if (conversations.length === 0) {
    return { conversations: [], rows: [], totalMessages: 0, firstAt: null, lastAt: null };
  }

  const convIds = conversations.map((c) => c.id);

  // 2) Mensagens — paginadas (RLS isola por empresa)
  const allMessages: RawMessage[] = [];
  let from = 0;
  // bound de segurança: 100 páginas = 100k mensagens
  for (let i = 0; i < 100; i++) {
    const { data, error } = await supabase
      .from('chat_messages')
      .select(
        'id, message_id, conversation_id, from_me, message_type, content, media_mimetype, file_name, duration, latitude, longitude, reaction_emoji, status, sender_name, timestamp',
      )
      .in('conversation_id', convIds)
      .order('timestamp', { ascending: true })
      .range(from, from + PAGE_SIZE - 1);
    if (error) throw error;
    const batch = (data || []) as RawMessage[];
    allMessages.push(...batch);
    if (batch.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }

  const convMap = new Map(conversations.map((c) => [c.id, c]));

  const rows: LeadHistoryRow[] = allMessages.map((m, idx) => {
    const desc = describeMessage(m);
    const conv = convMap.get(m.conversation_id);
    const direction: 'Enviada' | 'Recebida' = m.from_me ? 'Enviada' : 'Recebida';
    const sender = m.from_me
      ? m.sender_name || 'Atendente'
      : m.sender_name || conv?.contact_name || conv?.phone || 'Contato';
    return {
      index: idx + 1,
      timestamp: m.timestamp,
      direction,
      type: desc.type,
      sender,
      content: desc.content,
      status: STATUS_LABEL[m.status] || m.status || '',
      messageId: m.message_id || m.id,
      conversationPhone: conv?.phone || '',
    };
  });

  return {
    conversations,
    rows,
    totalMessages: rows.length,
    firstAt: rows.length ? rows[0].timestamp : null,
    lastAt: rows.length ? rows[rows.length - 1].timestamp : null,
  };
}

// ─────────────────────────────────────────────────────────────
// Header / metadata block
// ─────────────────────────────────────────────────────────────

function buildMetaLines(lead: LeadExportInfo, bundle: LeadHistoryBundle): string[] {
  const lines: string[] = [];
  lines.push(`Lead: ${lead.name}${lead.numeric_id ? ` (#${String(lead.numeric_id).padStart(4, '0')})` : ''}`);
  if (lead.phone) lines.push(`Telefone: ${lead.phone}`);
  if (lead.email) lines.push(`E-mail: ${lead.email}`);
  if (lead.company_name) lines.push(`Empresa do lead: ${lead.company_name}`);
  if (lead.pipeline_name || lead.stage_name) {
    lines.push(
      `Pipeline: ${lead.pipeline_name || '—'}${lead.stage_name ? ` › ${lead.stage_name}` : ''}`,
    );
  }
  if (lead.assignee_name) lines.push(`Responsável: ${lead.assignee_name}`);
  lines.push(`Conversas vinculadas: ${bundle.conversations.length}`);
  lines.push(`Total de mensagens: ${bundle.totalMessages}`);
  if (bundle.firstAt && bundle.lastAt) {
    lines.push(`Período: ${fmtDate(bundle.firstAt)} → ${fmtDate(bundle.lastAt)}`);
  }
  lines.push(`Exportado em: ${new Date().toLocaleString('pt-BR')}`);
  return lines;
}

// ─────────────────────────────────────────────────────────────
// CSV
// ─────────────────────────────────────────────────────────────

export function exportLeadHistoryCsv(lead: LeadExportInfo, bundle: LeadHistoryBundle): string {
  const SEP = ';';
  const esc = (v: unknown) => {
    const s = v == null ? '' : String(v);
    return `"${s.replace(/"/g, '""')}"`;
  };

  const lines: string[] = [];
  lines.push(`"# Histórico de mensagens do lead"`);
  buildMetaLines(lead, bundle).forEach((l) => {
    const [k, ...rest] = l.split(': ');
    lines.push(`${esc(k)};${esc(rest.join(': '))}`);
  });
  lines.push('');

  const header = ['#', 'Data/Hora', 'Direção', 'Tipo', 'Remetente', 'Conteúdo', 'Status', 'Telefone', 'ID Mensagem'];
  lines.push(header.map(esc).join(SEP));

  bundle.rows.forEach((r) => {
    lines.push(
      [
        r.index,
        fmtDate(r.timestamp),
        r.direction,
        r.type,
        r.sender,
        r.content,
        r.status,
        r.conversationPhone,
        r.messageId,
      ]
        .map(esc)
        .join(SEP),
    );
  });

  const csv = '\ufeff' + lines.join('\r\n');
  const filename = `${baseFileName(lead)}.csv`;
  downloadBlob(new Blob([csv], { type: 'text/csv;charset=utf-8' }), filename);
  return filename;
}

// ─────────────────────────────────────────────────────────────
// PDF
// ─────────────────────────────────────────────────────────────

export function exportLeadHistoryPdf(lead: LeadExportInfo, bundle: LeadHistoryBundle): string {
  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const margin = 36;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.text('Histórico de mensagens — WhatsApp', margin, 40);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(90);
  const metaLines = buildMetaLines(lead, bundle);
  metaLines.forEach((l, i) => doc.text(l, margin, 58 + i * 12));

  const startY = 58 + metaLines.length * 12 + 8;
  doc.setTextColor(0);

  if (bundle.rows.length === 0) {
    doc.setFontSize(10);
    doc.text('Nenhuma mensagem encontrada para este lead.', margin, startY);
  } else {
    const body = bundle.rows.map((r) => [
      String(r.index),
      fmtDate(r.timestamp),
      r.direction,
      r.type,
      r.sender,
      r.content,
      r.status,
    ]);

    autoTable(doc, {
      startY,
      head: [['#', 'Data/Hora', 'Direção', 'Tipo', 'Remetente', 'Mensagem', 'Status']],
      body,
      styles: { font: 'helvetica', fontSize: 8, cellPadding: 4, valign: 'top', overflow: 'linebreak' },
      headStyles: { fillColor: [30, 30, 30], textColor: 255 },
      alternateRowStyles: { fillColor: [245, 245, 247] },
      columnStyles: {
        0: { cellWidth: 24, halign: 'right' },
        1: { cellWidth: 78 },
        2: { cellWidth: 50 },
        3: { cellWidth: 52 },
        4: { cellWidth: 70 },
        5: { cellWidth: 'auto' },
        6: { cellWidth: 56 },
      },
      margin: { left: margin, right: margin },
      didParseCell: (data) => {
        if (data.section === 'body' && data.column.index === 2) {
          const role = data.cell.raw as string;
          if (role === 'Enviada') data.cell.styles.textColor = [20, 90, 200];
          else data.cell.styles.textColor = [120, 60, 200];
        }
      },
    });
  }

  // Footer
  const pageCount = doc.getNumberOfPages();
  for (let p = 1; p <= pageCount; p++) {
    doc.setPage(p);
    doc.setFontSize(8);
    doc.setTextColor(140);
    doc.text(`Página ${p} de ${pageCount}`, pageW - margin, pageH - 16, { align: 'right' });
    doc.text(`Lead: ${lead.name}`, margin, pageH - 16);
  }

  const filename = `${baseFileName(lead)}.pdf`;
  doc.save(filename);
  return filename;
}
