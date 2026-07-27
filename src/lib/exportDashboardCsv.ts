import { csvEscape } from './format';

interface CsvSection {
  title: string;
  headers: string[];
  rows: (string | number)[][];
}

/**
 * Exporta múltiplas seções como um único CSV com BOM UTF-8.
 * Faz download via blob no navegador. Seguro contra CSV injection (csvEscape).
 */
export function downloadCsvSections(filename: string, sections: CsvSection[]) {
  const lines: string[] = [];
  sections.forEach((sec, i) => {
    if (i > 0) lines.push('');
    lines.push(`# ${sec.title}`);
    lines.push(sec.headers.map(csvEscape).join(';'));
    sec.rows.forEach((r) => lines.push(r.map(csvEscape).join(';')));
  });

  const blob = new Blob(['\uFEFF' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export type { CsvSection };
