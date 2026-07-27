import { useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  FileText, Upload, Trash2, RefreshCw, Loader2, CheckCircle2, XCircle, Clock,
  Search, BookOpen, Sparkles,
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface Props {
  agentId: string | null;
  companyId: string | null;
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; cls: string; icon: any }> = {
    pending: { label: 'Aguardando', cls: 'text-muted-foreground', icon: Clock },
    processing: { label: 'Processando', cls: 'text-violet', icon: Loader2 },
    ready: { label: 'Pronto', cls: 'text-emerald', icon: CheckCircle2 },
    error: { label: 'Erro', cls: 'text-destructive', icon: XCircle },
  };
  const m = map[status] || map.pending;
  const Icon = m.icon;
  return (
    <span className={`inline-flex items-center gap-1 text-[11px] ${m.cls}`}>
      <Icon className={`w-3 h-3 ${status === 'processing' ? 'animate-spin' : ''}`} />
      {m.label}
    </span>
  );
}

export default function AiKnowledgeBaseTab({ agentId, companyId }: Props) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [query, setQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [searchTime, setSearchTime] = useState<number | null>(null);

  const { data: docs = [] } = useQuery({
    queryKey: ['ai-kb', agentId],
    enabled: !!agentId,
    queryFn: async () => {
      const { data } = await supabase
        .from('ai_knowledge_documents')
        .select('*').eq('agent_id', agentId!)
        .order('created_at', { ascending: false }).limit(100);
      return data || [];
    },
    refetchInterval: (q) => {
      const list = (q.state.data as any[]) || [];
      return list.some((d) => ['pending', 'processing'].includes(d.status)) ? 3000 : false;
    },
  });

  const totalChunks = docs.reduce((s, d: any) => s + (d.chunks_count || 0), 0);
  const totalSize = docs.reduce((s, d: any) => s + (d.size_bytes || 0), 0);

  const handleUpload = async (file: File) => {
    if (!agentId || !companyId) return;
    if (file.size > 50 * 1024 * 1024) {
      toast({ title: 'Arquivo muito grande', description: 'Máximo 50MB', variant: 'destructive' });
      return;
    }
    setUploading(true);
    setProgress(0);
    try {
      const path = `${companyId}/${agentId}/${Date.now()}-${file.name.replace(/[^a-z0-9.\-_]/gi, '_')}`;
      const { error: upErr } = await supabase.storage
        .from('ai-knowledge').upload(path, file, { upsert: false });
      if (upErr) throw upErr;
      setProgress(60);

      const { data: doc, error: insErr } = await supabase
        .from('ai_knowledge_documents').insert({
          company_id: companyId, agent_id: agentId,
          file_name: file.name, storage_path: path,
          mime_type: file.type, size_bytes: file.size,
        }).select().single();
      if (insErr) throw insErr;
      setProgress(80);

      const { error: fnErr } = await supabase.functions.invoke('ingest-knowledge', {
        body: { document_id: doc.id },
      });
      if (fnErr) throw fnErr;
      setProgress(100);

      qc.invalidateQueries({ queryKey: ['ai-kb', agentId] });
      toast({ title: 'Arquivo enviado', description: 'Processando…' });
    } catch (e: any) {
      toast({ title: 'Erro no upload', description: e.message, variant: 'destructive' });
    } finally {
      setUploading(false);
      setProgress(0);
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const f = e.dataTransfer.files?.[0];
    if (f) handleUpload(f);
  };

  const handleDelete = async (docId: string, path: string) => {
    try {
      await supabase.storage.from('ai-knowledge').remove([path]);
      await supabase.from('ai_knowledge_documents').delete().eq('id', docId);
      qc.invalidateQueries({ queryKey: ['ai-kb', agentId] });
      toast({ title: 'Documento removido' });
    } catch (e: any) {
      toast({ title: 'Erro', description: e.message, variant: 'destructive' });
    }
  };

  const handleReprocess = async (docId: string) => {
    try {
      const { error } = await supabase.functions.invoke('ingest-knowledge', {
        body: { document_id: docId },
      });
      if (error) throw error;
      qc.invalidateQueries({ queryKey: ['ai-kb', agentId] });
      toast({ title: 'Reprocessamento iniciado' });
    } catch (e: any) {
      toast({ title: 'Erro', description: e.message, variant: 'destructive' });
    }
  };

  const handleSearch = async () => {
    if (!agentId || !query.trim()) return;
    setSearching(true);
    setSearchResults([]);
    setSearchTime(null);
    const t0 = Date.now();
    try {
      const { data, error } = await supabase.functions.invoke('rag-search', {
        body: { agent_id: agentId, query: query.trim(), top_k: 5 },
      });
      if (error) {
        let msg = error.message;
        try {
          const ctx = (error as any).context;
          if (ctx) {
            const j = typeof ctx === 'string' ? JSON.parse(ctx) : ctx;
            msg = j?.error || j?.message || msg;
          }
        } catch {}
        throw new Error(msg);
      }
      setSearchResults(data?.matches || []);
      setSearchTime(data?.elapsed_ms ?? Date.now() - t0);
    } catch (e: any) {
      toast({ title: 'Falha na busca', description: e.message, variant: 'destructive' });
    } finally {
      setSearching(false);
    }
  };

  if (!agentId) {
    return (
      <Card className="p-6 text-center text-sm text-muted-foreground">
        Salve um agente primeiro para gerenciar a base de conhecimento.
      </Card>
    );
  }

  const fmtSize = (b: number) =>
    b > 1024 * 1024 ? `${(b / 1024 / 1024).toFixed(1)}MB` : `${Math.round(b / 1024)}KB`;

  return (
    <div className="space-y-3">
      <Card className="p-4 flex items-start gap-3 bg-violet/5 border-violet/20">
        <BookOpen className="w-5 h-5 text-violet shrink-0 mt-0.5" />
        <div className="text-sm flex-1">
          <p className="font-medium">Base de conhecimento</p>
          <p className="text-xs text-muted-foreground mt-1">
            Carregue catálogos, FAQs, guias técnicos. O agente consulta automaticamente esses
            documentos. Suporta <strong>TXT, MD e PDF com texto</strong>.
          </p>
        </div>
        {docs.length > 0 && (
          <div className="text-right text-xs text-muted-foreground shrink-0">
            <p><strong className="text-foreground">{totalChunks}</strong> trechos</p>
            <p>{fmtSize(totalSize)}</p>
          </div>
        )}
      </Card>

      <Card
        className={`p-6 border-dashed border-2 transition-colors ${uploading ? 'border-violet/40 bg-violet/5' : 'border-border hover:border-violet/30'}`}
        onDragOver={(e) => e.preventDefault()}
        onDrop={handleDrop}
      >
        <input
          ref={inputRef}
          type="file"
          accept=".txt,.md,.pdf,text/plain,text/markdown,application/pdf"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) handleUpload(f);
          }}
        />
        <div className="text-center space-y-2">
          <Upload className={`w-8 h-8 mx-auto ${uploading ? 'text-violet animate-pulse' : 'text-muted-foreground'}`} />
          <p className="text-sm">
            {uploading ? 'Enviando…' : 'Arraste arquivos aqui ou'}
            {!uploading && (
              <Button variant="link" className="px-1 h-auto" onClick={() => inputRef.current?.click()}>
                selecione
              </Button>
            )}
          </p>
          <p className="text-[11px] text-muted-foreground">PDF, TXT, MD (máx 50MB)</p>
          {uploading && progress > 0 && (
            <div className="h-1.5 rounded-full bg-muted overflow-hidden mt-2 max-w-xs mx-auto">
              <div className="h-full bg-violet transition-all" style={{ width: `${progress}%` }} />
            </div>
          )}
        </div>
      </Card>

      {docs.length > 0 ? (
        <div className="space-y-1.5">
          {docs.map((d: any) => (
            <Card key={d.id} className="p-3 flex items-center gap-3">
              <FileText className="w-4 h-4 text-muted-foreground shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{d.file_name}</p>
                <div className="flex items-center gap-2 text-[11px] text-muted-foreground mt-0.5 flex-wrap">
                  <StatusBadge status={d.status} />
                  {d.chunks_count > 0 && <span>{d.chunks_count} trechos</span>}
                  {d.size_bytes && <><span>·</span><span>{fmtSize(d.size_bytes)}</span></>}
                  <span>·</span>
                  <span>{formatDistanceToNow(new Date(d.created_at), { locale: ptBR, addSuffix: true })}</span>
                </div>
                {d.error && <p className="text-[11px] text-destructive mt-1">{d.error}</p>}
              </div>
              {(d.status === 'error' || d.status === 'ready') && (
                <Button size="icon" variant="ghost" onClick={() => handleReprocess(d.id)} title="Reprocessar">
                  <RefreshCw className="w-3.5 h-3.5" />
                </Button>
              )}
              <Button size="icon" variant="ghost" onClick={() => handleDelete(d.id, d.storage_path)} title="Remover">
                <Trash2 className="w-3.5 h-3.5 text-destructive" />
              </Button>
            </Card>
          ))}
        </div>
      ) : (
        <Card className="p-6 text-center text-sm text-muted-foreground">
          Nenhum documento ainda. Envie acima para começar.
        </Card>
      )}

      <Card className="p-4 space-y-3">
        <div className="flex items-center gap-2">
          <Sparkles className="w-3.5 h-3.5 text-violet" />
          <p className="text-sm font-medium">Testar busca semântica</p>
        </div>
        <div className="flex gap-2">
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder='Ex: "Qual é o preço do produto X?"'
            onKeyDown={(e) => { if (e.key === 'Enter') handleSearch(); }}
          />
          <Button onClick={handleSearch} disabled={searching || !query.trim() || docs.length === 0}>
            {searching ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Search className="w-4 h-4 mr-2" />}
            Buscar
          </Button>
        </div>
        {searchTime !== null && (
          <p className="text-[11px] text-muted-foreground">
            ⏱️ {searchTime}ms · {searchResults.length} resultado(s)
          </p>
        )}
        {searchResults.length > 0 && (
          <div className="space-y-1.5">
            {searchResults.map((r: any, i: number) => {
              const sim = Math.round((r.similarity || 0) * 100);
              return (
                <div key={i} className="rounded bg-muted/40 p-2.5 text-xs space-y-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium truncate">{r.file_name || 'Documento'}</span>
                    <Badge variant="outline" className="text-[10px]">{sim}%</Badge>
                  </div>
                  <p className="text-[11px] text-muted-foreground line-clamp-3">{r.content || r.snippet}</p>
                </div>
              );
            })}
          </div>
        )}
      </Card>
    </div>
  );
}
