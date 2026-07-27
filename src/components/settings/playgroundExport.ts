import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

export interface KbCitationLite {
  title?: string;
  file_name?: string;
  snippet?: string;
  excerpt?: string;
  document_id?: string;
}

export interface PlaygroundMessage {
  role: 'user' | 'assistant';
  content: string;
  ts: number;
  kb?: KbCitationLite[];
  latency_ms?: number;
  sent?: boolean;
}

export interface ExportMeta {
  agentId: string;
  agentName?: string;
  useDraft: boolean;
  useKb: boolean;
  overrideDocs: string[] | null;
  filteredDocNames?: string[];
}

const fmtDate = (ts: number) =>
  new Date(ts).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'medium' });

const baseFileName = (agentId: string) => {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  const stamp = `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}`;
  return `playground-${agentId.slice(0, 8)}-${stamp}`;
};

const kbToText = (kb?: KbCitationLite[]) => {
  if (!kb || kb.length === 0) return '';
  return kb
    .map((c, i) => {
      const title = c.title || c.file_name || `Doc ${i + 1}`;
      const snip = (c.snippet || c.excerpt || '').replace(/\s+/g, ' ').trim();
      return snip ? `${title} — ${snip}` : title;
    })
    .join('\n');
};

const truncate = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1) + '…' : s);

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

export function exportPlaygroundCsv(messages: PlaygroundMessage[], meta: ExportMeta): string {
  const SEP = ';';
  const esc = (v: unknown) => {
    const s = v == null ? '' : String(v);
    return `"${s.replace(/"/g, '""')}"`;
  };

  const lines: string[] = [];
  lines.push(`"# Playground - Agente IA"`);
  lines.push(`"Agente";${esc(meta.agentName || meta.agentId)}`);
  lines.push(`"Exportado em";${esc(new Date().toLocaleString('pt-BR'))}`);
  lines.push(`"Total de mensagens";${esc(messages.length)}`);
  lines.push(`"Usar rascunho atual";${esc(meta.useDraft ? 'Sim' : 'Não')}`);
  lines.push(`"Consultar base de conhecimento";${esc(meta.useKb ? 'Sim' : 'Não')}`);
  if (meta.overrideDocs !== null) {
    const lbl =
      meta.overrideDocs.length === 0
        ? 'Todos'
        : (meta.filteredDocNames && meta.filteredDocNames.length
            ? meta.filteredDocNames.join(' | ')
            : `${meta.overrideDocs.length} documento(s)`);
    lines.push(`"Documentos filtrados";${esc(lbl)}`);
  }
  lines.push('');

  const header = ['#', 'Horário', 'Papel', 'Mensagem', 'Latência (ms)', 'KB consultada', 'Enviado WhatsApp'];
  lines.push(header.map(esc).join(SEP));

  messages.forEach((m, i) => {
    lines.push(
      [
        i + 1,
        fmtDate(m.ts),
        m.role === 'user' ? 'Usuário' : 'Assistente',
        m.content,
        m.latency_ms ?? '',
        kbToText(m.kb),
        m.sent ? 'Sim' : '',
      ]
        .map(esc)
        .join(SEP),
    );
  });

  const csv = '\ufeff' + lines.join('\r\n');
  const filename = `${baseFileName(meta.agentId)}.csv`;
  downloadBlob(new Blob([csv], { type: 'text/csv;charset=utf-8' }), filename);
  return filename;
}

export function exportPlaygroundPdf(messages: PlaygroundMessage[], meta: ExportMeta): string {
  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  const pageW = doc.internal.pageSize.getWidth();
  const margin = 36;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.text('Playground — Logs da sessão', margin, 40);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(90);
  const metaLines = [
    `Agente: ${meta.agentName || meta.agentId}`,
    `Exportado em: ${new Date().toLocaleString('pt-BR')}`,
    `Mensagens: ${messages.length}  •  Rascunho: ${meta.useDraft ? 'sim' : 'não'}  •  KB: ${meta.useKb ? 'sim' : 'não'}`,
  ];
  if (meta.overrideDocs !== null) {
    const lbl =
      meta.overrideDocs.length === 0
        ? 'Todos os documentos'
        : (meta.filteredDocNames && meta.filteredDocNames.length
            ? meta.filteredDocNames.join(', ')
            : `${meta.overrideDocs.length} documento(s)`);
    metaLines.push(`Filtro KB: ${truncate(lbl, 140)}`);
  }
  metaLines.forEach((l, i) => doc.text(l, margin, 58 + i * 12));

  const startY = 58 + metaLines.length * 12 + 8;
  doc.setTextColor(0);

  const body = messages.map((m, i) => [
    String(i + 1),
    fmtDate(m.ts),
    m.role === 'user' ? 'Usuário' : 'Assistente',
    m.content,
    m.latency_ms != null ? `${m.latency_ms}` : '',
    kbToText(m.kb),
  ]);

  autoTable(doc, {
    startY,
    head: [['#', 'Horário', 'Papel', 'Mensagem', 'Lat. (ms)', 'KB consultada']],
    body,
    styles: { font: 'helvetica', fontSize: 8, cellPadding: 4, valign: 'top', overflow: 'linebreak' },
    headStyles: { fillColor: [30, 30, 30], textColor: 255 },
    alternateRowStyles: { fillColor: [245, 245, 247] },
    columnStyles: {
      0: { cellWidth: 22, halign: 'right' },
      1: { cellWidth: 78 },
      2: { cellWidth: 56 },
      3: { cellWidth: 'auto' },
      4: { cellWidth: 44, halign: 'right' },
      5: { cellWidth: 150 },
    },
    margin: { left: margin, right: margin },
    didParseCell: (data) => {
      if (data.section === 'body' && data.column.index === 2) {
        const role = data.cell.raw as string;
        if (role === 'Usuário') data.cell.styles.textColor = [20, 90, 200];
        else data.cell.styles.textColor = [120, 60, 200];
      }
    },
  });

  // Footer com paginação
  const pageCount = doc.getNumberOfPages();
  for (let p = 1; p <= pageCount; p++) {
    doc.setPage(p);
    doc.setFontSize(8);
    doc.setTextColor(140);
    doc.text(`Página ${p} de ${pageCount}`, pageW - margin, doc.internal.pageSize.getHeight() - 16, { align: 'right' });
  }

  const filename = `${baseFileName(meta.agentId)}.pdf`;
  doc.save(filename);
  return filename;
}
