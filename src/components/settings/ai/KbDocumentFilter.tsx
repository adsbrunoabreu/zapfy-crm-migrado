import { memo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { BookOpen, FileText } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';

interface KbDoc { id: string; file_name: string; status: string }

interface Props {
  agentId: string;
  value: string[] | null;
  onChange: (ids: string[] | null) => void;
}

function KbDocumentFilterBase({ agentId, value, onChange }: Props) {
  const { data: docs = [] } = useQuery({
    queryKey: ['ai-kb-cfg', agentId],
    queryFn: async () => {
      const { data } = await supabase
        .from('ai_knowledge_documents')
        .select('id, file_name, status')
        .eq('agent_id', agentId)
        .order('created_at', { ascending: false }).limit(100);
      return (data || []) as KbDoc[];
    },
  });

  const allMode = value === null || value.length === 0;
  const selected = value ?? [];

  if (docs.length === 0) {
    return (
      <Card className="p-3 text-xs text-muted-foreground flex items-center gap-2">
        <BookOpen className="w-3.5 h-3.5" />
        Nenhum documento na base de conhecimento. Adicione na aba "Base de conhecimento".
      </Card>
    );
  }

  return (
    <Card className="p-3 space-y-2 bg-muted/20">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-medium flex items-center gap-2">
            <BookOpen className="w-3.5 h-3.5 text-violet" />
            Documentos usados na busca
          </p>
          <p className="text-[11px] text-muted-foreground">
            {allMode
              ? 'Todos os documentos disponíveis (padrão)'
              : `Restrito a ${selected.length} de ${docs.length}`}
          </p>
        </div>
        {!allMode && (
          <Button size="sm" variant="outline" className="h-7 text-[11px]" onClick={() => onChange(null)}>
            Usar todos
          </Button>
        )}
      </div>
      <div className="grid grid-cols-2 gap-1.5 max-h-40 overflow-y-auto pt-1 border-t border-border/40">
        {docs.map((d) => {
          const checked = allMode || selected.includes(d.id);
          const ready = d.status === 'ready';
          return (
            <label
              key={d.id}
              className={`flex items-center gap-2 text-[11px] p-1.5 rounded cursor-pointer hover:bg-muted/40 ${!ready ? 'opacity-50' : ''}`}
            >
              <input
                type="checkbox"
                className="accent-violet"
                checked={checked}
                disabled={!ready}
                onChange={(e) => {
                  const baseAll = docs.filter((x) => x.status === 'ready').map((x) => x.id);
                  const current = allMode ? baseAll : selected;
                  const next = e.target.checked
                    ? Array.from(new Set([...current, d.id]))
                    : current.filter((id) => id !== d.id);
                  onChange(next.length === baseAll.length ? null : next);
                }}
              />
              <FileText className="w-3 h-3 shrink-0 text-muted-foreground" />
              <span className="truncate">{d.file_name}</span>
            </label>
          );
        })}
      </div>
    </Card>
  );
}

export const KbDocumentFilter = memo(KbDocumentFilterBase);
