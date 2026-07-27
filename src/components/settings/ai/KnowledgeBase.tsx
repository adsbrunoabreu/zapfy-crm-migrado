import { memo, useRef, useState, type ComponentType } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  CheckCircle2, Clock, FileText, Loader2, RefreshCw, Trash2, Upload, XCircle,
} from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';

interface KbDoc {
  id: string;
  file_name: string;
  storage_path: string;
  status: 'pending' | 'processing' | 'ready' | 'error' | string;
  chunks_count?: number;
  created_at: string;
  error?: string | null;
}

interface StatusMeta { label: string; cls: string; icon: ComponentType<{ className?: string }> }

function StatusBadgeBase({ status }: { status: string }) {
  const map: Record<string, StatusMeta> = {
    pending: { label: 'Aguardando', cls: 'text-muted-foreground', icon: Clock },
    processing: { label: 'Processando', cls: 'text-violet', icon: Loader2 },
    ready: { label: 'Pronto', cls: 'text-emerald', icon: CheckCircle2 },
    error: { label: 'Erro', cls: 'text-destructive', icon: XCircle },
  };
  const m = map[status] || map.pending;
  const Icon = m.icon;
  return (
    <span className={`inline-flex items-center gap-1 ${m.cls}`}>
      <Icon className={`w-3 h-3 ${status === 'processing' ? 'animate-spin' : ''}`} />
      {m.label}
    </span>
  );
}
const StatusBadge = memo(StatusBadgeBase);

function KnowledgeBaseBase({ agentId, companyId }: { agentId: string; companyId: string }) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  const { data: docs = [] } = useQuery({
    queryKey: ['ai-kb', agentId],
    queryFn: async () => {
      const { data } = await supabase
        .from('ai_knowledge_documents')
        .select('*').eq('agent_id', agentId)
        .order('created_at', { ascending: false }).limit(100);
      return (data || []) as KbDoc[];
    },
    refetchInterval: (q) => {
      const list = (q.state.data as KbDoc[] | undefined) || [];
      return list.some((d) => ['pending', 'processing'].includes(d.status)) ? 3000 : false;
    },
  });

  const upload = useMutation({
    mutationFn: async (file: File) => {
      const path = `${companyId}/${agentId}/${Date.now()}-${file.name.replace(/[^a-z0-9.\-_]/gi, '_')}`;
      const { error: upErr } = await supabase.storage
        .from('ai-knowledge').upload(path, file, { upsert: false });
      if (upErr) throw upErr;

      const { data: doc, error: insErr } = await supabase
        .from('ai_knowledge_documents').insert({
          company_id: companyId, agent_id: agentId,
          file_name: file.name, storage_path: path,
          mime_type: file.type, size_bytes: file.size,
        }).select().single();
      if (insErr) throw insErr;

      const { error: fnErr } = await supabase.functions.invoke('ingest-knowledge', {
        body: { document_id: doc.id },
      });
      if (fnErr) throw fnErr;
    },
    onMutate: () => setUploading(true),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['ai-kb', agentId] });
      toast({ title: 'Arquivo enviado', description: 'Processando…' });
    },
    onError: (e: Error) => toast({ title: 'Erro no upload', description: e.message, variant: 'destructive' }),
    onSettled: () => {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = '';
    },
  });

  const removeDoc = useMutation({
    mutationFn: async ({ docId, path }: { docId: string; path: string }) => {
      await supabase.storage.from('ai-knowledge').remove([path]);
      await supabase.from('ai_knowledge_documents').delete().eq('id', docId);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['ai-kb', agentId] });
      toast({ title: 'Documento removido' });
    },
    onError: (e: Error) => toast({ title: 'Erro', description: e.message, variant: 'destructive' }),
  });

  const reprocess = useMutation({
    mutationFn: async (docId: string) => {
      const { error } = await supabase.functions.invoke('ingest-knowledge', { body: { document_id: docId } });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['ai-kb', agentId] });
      toast({ title: 'Reprocessamento iniciado' });
    },
    onError: (e: Error) => toast({ title: 'Erro', description: e.message, variant: 'destructive' }),
  });

  return (
    <div className="space-y-3">
      <Card className="p-4 flex items-start gap-3 bg-violet/5 border-violet/20">
        <FileText className="w-5 h-5 text-violet shrink-0 mt-0.5" />
        <div className="text-sm flex-1">
          <p className="font-medium">Base de conhecimento</p>
          <p className="text-xs text-muted-foreground mt-1">
            Envie FAQs, catálogo, política de preços. O agente consulta automaticamente
            esses documentos antes de responder. Suporta <strong>TXT, MD e PDF com texto</strong>.
          </p>
        </div>
      </Card>

      <Card className="p-4">
        <input
          ref={inputRef}
          type="file"
          accept=".txt,.md,.pdf,text/plain,text/markdown,application/pdf"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) upload.mutate(f);
          }}
        />
        <Button
          variant="outline" className="w-full"
          onClick={() => inputRef.current?.click()}
          disabled={uploading}
        >
          {uploading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Upload className="w-4 h-4 mr-2" />}
          Enviar arquivo
        </Button>
      </Card>

      {docs.length === 0 ? (
        <Card className="p-6 text-center text-sm text-muted-foreground">
          Nenhum documento enviado ainda.
        </Card>
      ) : (
        <div className="space-y-2">
          {docs.map((d) => (
            <Card key={d.id} className="p-3 flex items-center gap-3">
              <FileText className="w-4 h-4 text-muted-foreground shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{d.file_name}</p>
                <div className="flex items-center gap-2 text-[11px] text-muted-foreground mt-0.5">
                  <StatusBadge status={d.status} />
                  {(d.chunks_count ?? 0) > 0 && <span>{d.chunks_count} trechos</span>}
                  <span>·</span>
                  <span>{formatDistanceToNow(new Date(d.created_at), { locale: ptBR, addSuffix: true })}</span>
                </div>
                {d.error && (
                  <p className="text-[11px] text-destructive mt-1">{d.error}</p>
                )}
              </div>
              {d.status === 'error' && (
                <Button size="icon" variant="ghost" onClick={() => reprocess.mutate(d.id)}>
                  <RefreshCw className="w-3.5 h-3.5" />
                </Button>
              )}
              <Button size="icon" variant="ghost" onClick={() => removeDoc.mutate({ docId: d.id, path: d.storage_path })}>
                <Trash2 className="w-3.5 h-3.5 text-destructive" />
              </Button>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

export const KnowledgeBase = memo(KnowledgeBaseBase);
