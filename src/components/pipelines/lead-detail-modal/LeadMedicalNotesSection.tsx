import { useState } from 'react';
import { StickyNote, Loader2 } from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { useLeadMedicalNotes, useCreateLeadMedicalNote } from '@/hooks/useLeadMedicalNotes';

export function LeadMedicalNotesSection({ leadId, locked = false }: { leadId: string; locked?: boolean }) {
  const { data: notes = [], isLoading } = useLeadMedicalNotes(leadId);
  const createNote = useCreateLeadMedicalNote();
  const [text, setText] = useState('');

  const submit = () => {
    if (!text.trim()) return;
    createNote.mutate({ leadId, body: text }, { onSuccess: () => setText('') });
  };

  return (
    <section className="rounded-xl border border-border bg-card/40 p-4 space-y-3">
      <h4 className="text-sm font-semibold flex items-center gap-2">
        <StickyNote className="w-4 h-4 text-primary" />
        Notas clínicas
        <span className="text-[10px] font-normal text-muted-foreground ml-auto">não editáveis</span>
      </h4>

      {!locked && (
        <div className="space-y-2">
          <Textarea
            rows={3}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Adicione uma anotação clínica (não poderá ser editada após salvar)…"
            className="resize-none border-border/60"
          />
          <div className="flex justify-end">
            <Button
              size="sm"
              disabled={!text.trim() || createNote.isPending}
              onClick={submit}
              className="gap-1.5"
            >
              {createNote.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <StickyNote className="w-3.5 h-3.5" />}
              Salvar nota
            </Button>
          </div>
        </div>
      )}

      <div className="space-y-2 pt-1">
        {isLoading ? (
          <div className="flex justify-center py-3"><Loader2 className="w-4 h-4 animate-spin text-muted-foreground" /></div>
        ) : notes.length === 0 ? (
          <p className="text-xs text-muted-foreground/60">Nenhuma nota registrada</p>
        ) : (
          notes.map(n => (
            <div key={n.id} className="rounded-lg border border-border/60 bg-background/40 p-3 space-y-1">
              <p className="text-[11px] text-muted-foreground">
                {format(new Date(n.created_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })} · {n.author_name}
              </p>
              <p className="text-sm text-foreground whitespace-pre-wrap">{n.body}</p>
            </div>
          ))
        )}
      </div>
    </section>
  );
}
