/**
 * Helpers para exportar a lista de procedimentos em CSV e PDF.
 */
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import type { MedicalProcedureFull } from '@/hooks/medical/useMedicalCatalogs';

const fmtBRL = (v: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v || 0);

const csvEscape = (v: unknown) => {
  const s = v == null ? '' : String(v);
  return /[",;\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

const timestamp = () => {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}`;
};

const triggerDownload = (blob: Blob, filename: string) => {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
};

export function exportProceduresToCSV(rows: MedicalProcedureFull[]) {
  const header = ['name', 'category', 'base_price', 'duration_minutes', 'active'];
  const lines = [header.join(',')];
  for (const r of rows) {
    lines.push([
      csvEscape(r.name),
      csvEscape(r.category ?? ''),
      // preço em formato neutro (ponto decimal) para reimportação
      csvEscape((Number(r.base_price) || 0).toFixed(2)),
      csvEscape(r.duration_minutes ?? 30),
      csvEscape(r.active ? 'true' : 'false'),
    ].join(','));
  }
  // BOM para abrir bem no Excel pt-BR
  const blob = new Blob(['\uFEFF' + lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
  triggerDownload(blob, `procedimentos-${timestamp()}.csv`);
}

export function exportProceduresToPDF(rows: MedicalProcedureFull[]) {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'pt', format: 'a4' });
  const now = new Date().toLocaleString('pt-BR');
  const total = rows.reduce((s, r) => s + (Number(r.base_price) || 0), 0);

  doc.setFontSize(16);
  doc.text('Catálogo de Procedimentos', 40, 48);
  doc.setFontSize(10);
  doc.setTextColor(120);
  doc.text(`Gerado em ${now}  •  ${rows.length} registro(s)`, 40, 64);
  doc.setTextColor(0);

  autoTable(doc, {
    startY: 84,
    head: [['Nome', 'Categoria', 'Preço base', 'Duração', 'Ativo']],
    body: rows.map((r) => [
      r.name,
      r.category || '—',
      fmtBRL(Number(r.base_price)),
      `${r.duration_minutes ?? 30} min`,
      r.active ? 'Sim' : 'Não',
    ]),
    foot: [['', '', `Soma: ${fmtBRL(total)}`, '', '']],
    styles: { fontSize: 9, cellPadding: 6 },
    headStyles: { fillColor: [24, 24, 27], textColor: 255 },
    footStyles: { fillColor: [244, 244, 245], textColor: 30, fontStyle: 'bold' },
    alternateRowStyles: { fillColor: [250, 250, 250] },
    columnStyles: {
      2: { halign: 'right' },
      3: { halign: 'right' },
      4: { halign: 'center' },
    },
    margin: { left: 40, right: 40 },
    didDrawPage: (data) => {
      const pageCount = doc.getNumberOfPages();
      const pageSize = doc.internal.pageSize;
      doc.setFontSize(8);
      doc.setTextColor(150);
      doc.text(
        `Página ${data.pageNumber} de ${pageCount}`,
        pageSize.getWidth() - 40,
        pageSize.getHeight() - 20,
        { align: 'right' },
      );
    },
  });

  doc.save(`procedimentos-${timestamp()}.pdf`);
}
