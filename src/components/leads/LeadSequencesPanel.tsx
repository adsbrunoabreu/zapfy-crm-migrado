import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Play, X, Clock, Workflow } from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

type Sequence = { id: string; name: string; trigger_type: string };
type Enrollment = {
  id: string; sequence_id: string; status: string; current_step: number;
  next_run_at: string | null; started_at: string;
  message_sequences: { name: string } | null;
};

export function LeadSequencesPanel({ leadId }: { leadId: string }) {
  const { profile } = useAuth();
  const qc = useQueryClient();
  const [selected, setSelected] = useState<string>('');

  const { data: sequences = [] } = useQuery({
    queryKey: ['active-sequences', profile?.company_id],
    enabled: !!profile?.company_id,
    staleTime: 60_000,
    queryFn: async () => {
      const { data } = await supabase.from('message_sequences')
        .select('id, name, trigger_type').eq('is_active', true).order('name').limit(100);
      return (data || []) as Sequence[];
    },
  });

  const { data: enrollments = [], refetch } = useQuery({
    queryKey: ['lead-enrollments', leadId],
    enabled: !!leadId,
    staleTime: 30_000,
    queryFn: async () => {
      const { data } = await supabase.from('message_sequence_enrollments')
        .select('id, sequence_id, status, current_step, next_run_at, started_at, message_sequences(name)')
        .eq('lead_id', leadId).order('started_at', { ascending: false }).limit(20);
      return (data || []) as unknown as Enrollment[];
    },
  });

  const start = useMutation({
    mutationFn: async () => {
      if (!selected) throw new Error('Selecione um fluxo');
      const { data, error } = await supabase.rpc('enroll_lead_in_sequence', {
        _sequence_id: selected, _lead_id: leadId, _started_by: profile?.id,
      });
      if (error) throw error;
      if (!data) throw new Error('Não foi possível inscrever (já ativo ou fluxo sem passos)');
      return data;
    },
    onSuccess: () => { toast.success('Fluxo iniciado'); setSelected(''); refetch(); qc.invalidateQueries({ queryKey: ['seq-enroll-counts'] }); },
    onError: (e: any) => toast.error('Erro', { description: e.message }),
  });

  const cancel = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('message_sequence_enrollments')
        .update({ status: 'canceled', cancel_reason: 'manual', completed_at: new Date().toISOString() })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success('Cancelado'); refetch(); qc.invalidateQueries({ queryKey: ['seq-enroll-counts'] }); },
  });

  const active = enrollments.filter((e) => e.status === 'active');
  const finished = enrollments.filter((e) => e.status !== 'active');

  return (
    <div className="space-y-4">
      <Card className="p-3">
        <div className="text-sm font-medium mb-2 flex items-center gap-2"><Workflow className="h-4 w-4" />Iniciar fluxo de follow-up</div>
        <div className="flex gap-2">
          <Select value={selected} onValueChange={setSelected}>
            <SelectTrigger className="flex-1"><SelectValue placeholder="Selecione um fluxo ativo" /></SelectTrigger>
            <SelectContent>
              {sequences.length === 0 && <div className="px-3 py-2 text-xs text-muted-foreground">Nenhum fluxo ativo. Crie em Templates & Fluxos.</div>}
              {sequences.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
            </SelectContent>
          </Select>
          <Button onClick={() => start.mutate()} disabled={!selected || start.isPending}>
            <Play className="h-4 w-4 mr-1" />Iniciar
          </Button>
        </div>
      </Card>

      {active.length > 0 && (
        <div>
          <div className="text-xs font-medium text-muted-foreground mb-2">Ativos</div>
          <div className="space-y-2">
            {active.map((e) => (
              <Card key={e.id} className="p-3 flex items-center gap-3">
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium truncate">{e.message_sequences?.name || 'Fluxo'}</div>
                  <div className="text-xs text-muted-foreground inline-flex items-center gap-1 mt-0.5">
                    <Clock className="h-3 w-3" />
                    Passo {e.current_step + 1}
                    {e.next_run_at && (
                      <> · Próximo envio: {format(new Date(e.next_run_at), "dd/MM 'às' HH:mm", { locale: ptBR })}</>
                    )}
                  </div>
                </div>
                <Button size="sm" variant="ghost" onClick={() => cancel.mutate(e.id)}>
                  <X className="h-4 w-4 mr-1" />Cancelar
                </Button>
              </Card>
            ))}
          </div>
        </div>
      )}

      {finished.length > 0 && (
        <div>
          <div className="text-xs font-medium text-muted-foreground mb-2">Histórico</div>
          <div className="space-y-1">
            {finished.map((e) => (
              <div key={e.id} className="flex items-center justify-between text-xs px-3 py-2 rounded border border-border">
                <span className="truncate">{e.message_sequences?.name || 'Fluxo'}</span>
                <Badge variant="outline" className="text-[10px]">{e.status}</Badge>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
