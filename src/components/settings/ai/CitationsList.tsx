import { memo, useState } from 'react';
import { FileText, Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import type { KbCitation } from './types';

function CitationsListBase({ citations }: { citations: KbCitation[] }) {
  const [opening, setOpening] = useState<string | null>(null);

  const openDoc = async (documentId: string) => {
    setOpening(documentId);
    try {
      const { data: doc } = await supabase
        .from('ai_knowledge_documents')
        .select('storage_path').eq('id', documentId).maybeSingle();
      if (!doc?.storage_path) throw new Error('Documento não encontrado');
      const { data: signed, error } = await supabase.storage
        .from('ai-knowledge')
        .createSignedUrl(doc.storage_path, 300);
      if (error || !signed?.signedUrl) throw error || new Error('Falha ao gerar link');
      window.open(signed.signedUrl, '_blank', 'noopener');
    } catch (e) {
      console.error('open doc failed', e);
    } finally {
      setOpening(null);
    }
  };

  return (
    <div className="space-y-1.5">
      {citations.map((k, j) => {
        const sim = Math.round((k.similarity || 0) * 100);
        return (
          <div key={k.chunk_id || j} className="rounded bg-muted/50 p-2 text-[11px] space-y-1">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-1.5 min-w-0">
                <FileText className="w-3 h-3 text-muted-foreground shrink-0" />
                <span className="font-medium truncate">{k.file_name || 'Documento'}</span>
                <span className="text-muted-foreground shrink-0">· {sim}%</span>
              </div>
              {k.document_id && (
                <button
                  onClick={() => openDoc(k.document_id)}
                  disabled={opening === k.document_id}
                  className="text-violet hover:underline shrink-0 flex items-center gap-1"
                >
                  {opening === k.document_id
                    ? <Loader2 className="w-3 h-3 animate-spin" />
                    : 'Abrir'}
                </button>
              )}
            </div>
            <div className="text-foreground/80 line-clamp-3">{k.snippet}</div>
          </div>
        );
      })}
    </div>
  );
}

export const CitationsList = memo(CitationsListBase);
