import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import { computeTotals, DRE_LABEL, GROUP_LABEL, GROUP_ORDER, GROUP_SECTIONS, type DreReport } from '@/lib/dre';

const fmt = (n: number) =>
  n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 2 });

type Row = { label: string; value: number; bold?: boolean; indent?: number };

function buildRows(report: DreReport): Row[] {
  const t = computeTotals(report.sections);
  const rows: Row[] = [];
  rows.push({ label: 'RECEITA BRUTA', value: t.receitaBruta, bold: true });
  for (const s of GROUP_SECTIONS.receita_bruta) {
    const v = Number(report.sections[s] ?? 0);
    if (v) rows.push({ label: DRE_LABEL[s], value: v, indent: 1 });
  }
  rows.push({ label: '(-) DEDUÇÕES', value: -t.deducoes, bold: true });
  for (const s of GROUP_SECTIONS.deducoes) {
    const v = Number(report.sections[s] ?? 0);
    if (v) rows.push({ label: DRE_LABEL[s], value: -v, indent: 1 });
  }
  rows.push({ label: '= RECEITA LÍQUIDA', value: t.receitaLiquida, bold: true });
  rows.push({ label: '(-) CUSTOS DIRETOS', value: -t.custos, bold: true });
  for (const s of GROUP_SECTIONS.custos_diretos) {
    const v = Number(report.sections[s] ?? 0);
    if (v) rows.push({ label: DRE_LABEL[s], value: -v, indent: 1 });
  }
  rows.push({ label: '= LUCRO BRUTO', value: t.lucroBruto, bold: true });
  rows.push({ label: '(-) DESPESAS OPERACIONAIS', value: -t.despesas, bold: true });
  for (const s of GROUP_SECTIONS.despesas_operacionais) {
    const v = Number(report.sections[s] ?? 0);
    if (v) rows.push({ label: DRE_LABEL[s], value: -v, indent: 1 });
  }
  rows.push({ label: '= EBITDA', value: t.ebitda, bold: true });
  rows.push({ label: '(-) RESULTADO FINANCEIRO', value: -t.resultadoFinanceiro, bold: true });
  for (const s of GROUP_SECTIONS.resultado_financeiro) {
    const v = Number(report.sections[s] ?? 0);
    if (v) rows.push({ label: DRE_LABEL[s], value: -v, indent: 1 });
  }
  rows.push({ label: '= LUCRO ANTES DOS IMPOSTOS', value: t.lucroAntesImpostos, bold: true });
  rows.push({ label: '(-) IMPOSTOS', value: -t.impostos, bold: true });
  rows.push({ label: '= LUCRO LÍQUIDO', value: t.lucroLiquido, bold: true });
  return rows;
}

export function exportDREtoCSV(report: DreReport, filename = 'dre.csv') {
  const rows = buildRows(report);
  const header = `DRE - ${report.period.start} a ${report.period.end} (${report.period.basis})\n`;
  const body = rows
    .map((r) => `"${'  '.repeat(r.indent ?? 0)}${r.label}";${r.value.toFixed(2).replace('.', ',')}`)
    .join('\n');
  const blob = new Blob(['\uFEFF' + header + 'Linha;Valor\n' + body], { type: 'text/csv;charset=utf-8;' });
  triggerDownload(blob, filename);
}

export function exportDREtoXLSX(report: DreReport, filename = 'dre.xlsx') {
  const rows = buildRows(report);
  const aoa: any[][] = [
    [`DRE - ${report.period.start} a ${report.period.end} (${report.period.basis})`],
    [],
    ['Linha', 'Valor (R$)'],
    ...rows.map((r) => [`${'  '.repeat(r.indent ?? 0)}${r.label}`, r.value]),
  ];
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws['!cols'] = [{ wch: 42 }, { wch: 18 }];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'DRE');
  XLSX.writeFile(wb, filename);
}

export function exportDREtoPDF(report: DreReport, filename = 'dre.pdf') {
  const rows = buildRows(report);
  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();
  let y = 48;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.text('Demonstrativo de Resultado do Exercício', 40, y);
  y += 18;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.text(
    `Período: ${report.period.start} a ${report.period.end}  ·  Regime: ${report.period.basis === 'caixa' ? 'Caixa' : 'Competência'}`,
    40, y,
  );
  y += 16;
  doc.setDrawColor(180);
  doc.line(40, y, pageWidth - 40, y);
  y += 14;

  doc.setFontSize(10);
  for (const r of rows) {
    if (y > 780) { doc.addPage(); y = 48; }
    if (r.bold) {
      doc.setFont('helvetica', 'bold');
      doc.setFillColor(245, 245, 245);
      doc.rect(40, y - 11, pageWidth - 80, 16, 'F');
    } else {
      doc.setFont('helvetica', 'normal');
    }
    const label = `${'   '.repeat(r.indent ?? 0)}${r.label}`;
    doc.text(label, 44, y);
    doc.text(String(fmt(r.value)), pageWidth - 44, y, { align: 'right' });
    y += 16;
  }

  const totals = computeTotals(report.sections);
  y += 8;
  if (y > 760) { doc.addPage(); y = 48; }
  doc.setFont('helvetica', 'bold');
  doc.text('MARGENS', 40, y); y += 14;
  doc.setFont('helvetica', 'normal');
  doc.text(`Margem Bruta:    ${totals.margemBruta.toFixed(1)}%`, 40, y); y += 12;
  doc.text(`Margem EBITDA:   ${totals.margemEbitda.toFixed(1)}%`, 40, y); y += 12;
  doc.text(`Margem Líquida:  ${totals.margemLiquida.toFixed(1)}%`, 40, y);

  doc.save(filename);
}

function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
