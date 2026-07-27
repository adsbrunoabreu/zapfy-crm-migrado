/**
 * Dialog para importação em massa de procedimentos via CSV.
 * Aceita separador "," ou ";". Header esperado:
 *   name,category,base_price,duration_minutes,active
 * Apenas "name" é obrigatório. Preços aceitam "1.234,56" ou "1234.56".
 */
import { useMemo, useRef, useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Loader2, Upload, Download, FileText, AlertTriangle } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import {
  useBulkImportMedicalProcedures, type BulkProcedureRow,
} from '@/hooks/medical/useMedicalCatalogs';

type ParseResult = {
  valid: BulkProcedureRow[];
  errors: { line: number; reason: string; raw: string }[];
};

function parsePrice(v: string): number {
  if (!v) return 0;
  const s = v.trim().replace(/[R$\s]/g, '');
  // Se tem vírgula e ponto, assume formato pt-BR: 1.234,56
  if (s.includes(',') && s.includes('.')) {
    return Number(s.replace(/\./g, '').replace(',', '.')) || 0;
  }
  if (s.includes(',')) return Number(s.replace(',', '.')) || 0;
  return Number(s) || 0;
}

function splitCSVLine(line: string, sep: string): string[] {
  const out: string[] = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') {
      if (inQuotes && line[i + 1] === '"') { cur += '"'; i++; }
      else inQuotes = !inQuotes;
    } else if (c === sep && !inQuotes) {
      out.push(cur); cur = '';
    } else {
      cur += c;
    }
  }
  out.push(cur);
  return out.map((s) => s.trim());
}

function parseCSV(text: string): ParseResult {
  const result: ParseResult = { valid: [], errors: [] };
  const cleaned = text.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const lines = cleaned.split('\n').filter((l) => l.trim().length > 0);
  if (!lines.length) return result;

  const sep = lines[0].includes(';') && !lines[0].includes(',') ? ';'
    : lines[0].split(';').length > lines[0].split(',').length ? ';' : ',';

  const firstCells = splitCSVLine(lines[0], sep).map((c) => c.toLowerCase());
  const headerKnown = ['name', 'nome', 'category', 'categoria', 'base_price', 'preco', 'preço', 'duration_minutes', 'duracao', 'duração', 'active', 'ativo'];
  const hasHeader = firstCells.some((c) => headerKnown.includes(c));

  let headers: string[];
  let dataStart = 0;
  if (hasHeader) {
    headers = firstCells.map((h) => h.normalize('NFD').replace(/[\u0300-\u036f]/g, ''));
    dataStart = 1;
  } else {
    headers = ['name', 'category', 'base_price', 'duration_minutes', 'active'];
  }

  const idx = (...keys: string[]) => {
    for (const k of keys) {
      const i = headers.indexOf(k);
      if (i >= 0) return i;
    }
    return -1;
  };
  const iName = idx('name', 'nome');
  const iCat = idx('category', 'categoria');
  const iPrice = idx('base_price', 'preco', 'price');
  const iDur = idx('duration_minutes', 'duracao', 'duration');
  const iActive = idx('active', 'ativo');

  for (let i = dataStart; i < lines.length; i++) {
    const raw = lines[i];
    const cells = splitCSVLine(raw, sep);
    const name = (iName >= 0 ? cells[iName] : cells[0]) ?? '';
    if (!name || name.trim().length < 2) {
      result.errors.push({ line: i + 1, reason: 'Nome ausente ou muito curto', raw });
      continue;
    }
    const activeStr = (iActive >= 0 ? cells[iActive] : '').toLowerCase().trim();
    result.valid.push({
      name: name.trim(),
      category: iCat >= 0 ? cells[iCat] || null : null,
      base_price: iPrice >= 0 ? parsePrice(cells[iPrice] ?? '') : 0,
      duration_minutes: iDur >= 0 ? Math.max(5, Math.round(Number(cells[iDur]) || 30)) : 30,
      active: activeStr === '' ? true : !['0', 'false', 'nao', 'não', 'no', 'inativo'].includes(activeStr),
    });
  }
  return result;
}

const SAMPLE_CSV =
  'name,category,base_price,duration_minutes,active\n' +
  'Consulta Clínica Geral,Consulta,250.00,30,true\n' +
  'Exame de Sangue,Exame,120.50,15,true\n' +
  'Ultrassom Abdominal,Exame,380.00,45,true\n';

export function ImportProceduresDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const { toast } = useToast();
  const bulk = useBulkImportMedicalProcedures();
  const fileRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState<string>('');
  const [text, setText] = useState<string>('');

  const parsed = useMemo<ParseResult>(() => (text ? parseCSV(text) : { valid: [], errors: [] }), [text]);

  const reset = () => { setFileName(''); setText(''); if (fileRef.current) fileRef.current.value = ''; };

  const handleFile = async (f: File | null) => {
    if (!f) return;
    setFileName(f.name);
    const buf = await f.text();
    setText(buf);
  };

  const downloadSample = () => {
    const blob = new Blob([SAMPLE_CSV], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'procedimentos-modelo.csv';
    document.body.appendChild(a); a.click(); a.remove();
    URL.revokeObjectURL(url);
  };

  const submit = async () => {
    if (!parsed.valid.length) {
      toast({ title: 'Nada para importar', description: 'Nenhuma linha válida encontrada.', variant: 'destructive' });
      return;
    }
    try {
      const { inserted } = await bulk.mutateAsync(parsed.valid);
      toast({ title: 'Importação concluída', description: `${inserted} procedimento(s) cadastrado(s).` });
      reset();
      onOpenChange(false);
    } catch (e: any) {
      toast({ title: 'Erro ao importar', description: e.message, variant: 'destructive' });
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) reset(); onOpenChange(o); }}>
      <DialogContent className="sm:max-w-[640px]">
        <DialogHeader>
          <DialogTitle>Importar procedimentos via CSV</DialogTitle>
          <DialogDescription>
            Arquivo CSV com as colunas: <code>name, category, base_price, duration_minutes, active</code>.
            Apenas <strong>name</strong> é obrigatório. Aceita separador <code>,</code> ou <code>;</code> e preços no formato 1.234,56 ou 1234.56.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => fileRef.current?.click()} className="gap-2">
              <Upload className="w-4 h-4" /> Selecionar arquivo
            </Button>
            <Button variant="ghost" size="sm" onClick={downloadSample} className="gap-2">
              <Download className="w-4 h-4" /> Baixar modelo
            </Button>
            <input
              ref={fileRef} type="file" accept=".csv,text/csv" className="hidden"
              onChange={(e) => handleFile(e.target.files?.[0] ?? null)}
            />
            {fileName && (
              <span className="text-xs text-muted-foreground inline-flex items-center gap-1.5">
                <FileText className="w-3.5 h-3.5" /> {fileName}
              </span>
            )}
          </div>

          {text && (
            <div className="border border-border rounded-lg bg-card/40 divide-y divide-border">
              <div className="px-3 py-2 flex items-center gap-3 text-sm">
                <span className="font-medium">{parsed.valid.length}</span>
                <span className="text-muted-foreground">linha(s) válida(s)</span>
                {parsed.errors.length > 0 && (
                  <span className="ml-auto inline-flex items-center gap-1.5 text-amber-500 text-xs">
                    <AlertTriangle className="w-3.5 h-3.5" /> {parsed.errors.length} ignorada(s)
                  </span>
                )}
              </div>

              {parsed.valid.length > 0 && (
                <div className="max-h-[220px] overflow-auto text-xs">
                  <div className="grid grid-cols-[1.5fr_1fr_90px_70px_60px] gap-2 px-3 py-2 text-muted-foreground border-b border-border bg-muted/30">
                    <div>Nome</div><div>Categoria</div><div>Preço</div><div>Min.</div><div>Ativo</div>
                  </div>
                  {parsed.valid.slice(0, 50).map((r, i) => (
                    <div key={i} className="grid grid-cols-[1.5fr_1fr_90px_70px_60px] gap-2 px-3 py-1.5 border-b border-border/40 last:border-0">
                      <div className="truncate">{r.name}</div>
                      <div className="truncate text-muted-foreground">{r.category || '—'}</div>
                      <div>{new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(r.base_price || 0)}</div>
                      <div>{r.duration_minutes}</div>
                      <div>{r.active ? 'Sim' : 'Não'}</div>
                    </div>
                  ))}
                  {parsed.valid.length > 50 && (
                    <div className="px-3 py-2 text-muted-foreground">… e mais {parsed.valid.length - 50} linha(s)</div>
                  )}
                </div>
              )}

              {parsed.errors.length > 0 && (
                <details className="text-xs">
                  <summary className="px-3 py-2 cursor-pointer text-amber-500">Ver linhas ignoradas</summary>
                  <div className="max-h-[140px] overflow-auto px-3 pb-2 space-y-1">
                    {parsed.errors.slice(0, 20).map((e, i) => (
                      <div key={i}>
                        <span className="text-muted-foreground">L{e.line}:</span> {e.reason} — <code className="text-muted-foreground">{e.raw.slice(0, 80)}</code>
                      </div>
                    ))}
                  </div>
                </details>
              )}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => { reset(); onOpenChange(false); }}>Cancelar</Button>
          <Button onClick={submit} disabled={bulk.isPending || parsed.valid.length === 0}>
            {bulk.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            Importar {parsed.valid.length > 0 ? `(${parsed.valid.length})` : ''}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
