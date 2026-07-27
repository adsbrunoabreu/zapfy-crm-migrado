import { useState } from 'react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { LeadHistoryTimeline } from '@/components/chat/LeadHistoryTimeline';
import { useLeadActivities, useCreateLeadActivity } from '@/hooks/useLeadActivities';
import { toast } from 'sonner';
import { Loader2, StickyNote } from 'lucide-react';

function SectionLabel({ children }: { children: React.ReactNode }) {
  return <p className="text-[10px] uppercase tracking-[0.08em] text-muted-foreground/80 font-semibold">{children}</p>;
}

export function HistoryTab({ leadId }: { leadId: string }) {
  const { data: activities = [], isLoading } = useLeadActivities(leadId);
  const createActivity = useCreateLeadActivity();
  const [note, setNote] = useState('');

  const handleAddNote = () => {
    const text = note.trim();
    if (!text) return;
    createActivity.mutate(
      { leadId, actionType: 'note_added', description: text, metadata: { note: text } },
      { onSuccess: () => { setNote(''); toast.success('Nota adicionada'); } },
    );
  };

  return (
    <>
      <section className="rounded-xl border border-border bg-card/40 p-4 space-y-2">
        <SectionLabel>Nova nota interna</SectionLabel>
        <Textarea
          rows={2}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Registre uma observação interna..."
          className="text-sm resize-none border-border/60"
        />
        <div className="flex justify-end">
          <Button size="sm" onClick={handleAddNote} disabled={!note.trim() || createActivity.isPending} className="gap-1.5">
            {createActivity.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <StickyNote className="w-3.5 h-3.5" />}
            Adicionar
          </Button>
        </div>
      </section>

      <section className="rounded-xl border border-border bg-card/40 p-4 space-y-3">
        <SectionLabel>Linha do tempo</SectionLabel>
        <LeadHistoryTimeline leadId={leadId} />

        <div className="space-y-2 pt-2">
          {isLoading ? (
            <div className="flex justify-center py-4"><Loader2 className="w-4 h-4 animate-spin text-muted-foreground" /></div>
          ) : (
            activities
              .filter((a) => a.action_type === 'note_added')
              .map((a) => (
                <div key={a.id} className="rounded-lg border border-border/60 bg-background/40 p-3 space-y-1">
                  <p className="text-xs text-muted-foreground">
                    {format(new Date(a.created_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
                    {a.user?.full_name && <> · {a.user.full_name}</>}
                  </p>
                  <p className="text-sm text-foreground whitespace-pre-wrap">{a.description}</p>
                </div>
              ))
          )}
        </div>
      </section>
    </>
  );
}
