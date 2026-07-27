import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { withJwtRetry } from '@/lib/supabaseRetry';
import { toast } from '@/hooks/use-toast';


/**
 * Marca um lead como Ganho/Perdido ou o reabre.
 * Histórico é registrado automaticamente pelo trigger `leads_status_change_log`.
 *
 * IMPORTANTE: usamos UPDATE sem .select() para evitar 403 de RLS.
 */
export function useLeadOutcome() {
  const qc = useQueryClient();

  const invalidate = (leadId: string) => {
    qc.invalidateQueries({ queryKey: ['pipeline-with-leads'] });
    qc.invalidateQueries({ queryKey: ['leads'] });
    qc.invalidateQueries({ queryKey: ['lead', leadId] });
    qc.invalidateQueries({ queryKey: ['lead-full', leadId] });
    qc.invalidateQueries({ queryKey: ['lead-activities', leadId] });
  };

  const markAsWon = useMutation({
    mutationFn: async (leadId: string) => {
      await withJwtRetry(async () => {
        const { error } = await supabase
          .from('leads')
          .update({
            status: 'won',
            loss_reason_id: null,
            loss_reason_text: null,
          })
          .eq('id', leadId);
        if (error) throw error;
      });
    },
    onSuccess: (_d, leadId) => {
      invalidate(leadId);
      toast({ title: 'Lead marcado como Ganho 🏆' });
    },
    onError: (e: any) => toast({ title: 'Erro', description: e.message, variant: 'destructive' }),
  });

  const markAsLost = useMutation({
    mutationFn: async (input: { leadId: string; reasonId?: string | null; reasonText?: string | null }) => {
      await withJwtRetry(async () => {
        const { error } = await supabase
          .from('leads')
          .update({
            status: 'lost',
            loss_reason_id: input.reasonId || null,
            loss_reason_text: (input.reasonText || '').trim() || null,
          })
          .eq('id', input.leadId);
        if (error) throw error;
      });
    },
    onSuccess: (_d, vars) => {
      invalidate(vars.leadId);
      toast({ title: 'Lead marcado como Perdido' });
    },
    onError: (e: any) => toast({ title: 'Erro', description: e.message, variant: 'destructive' }),
  });

  const reopen = useMutation({
    mutationFn: async (leadId: string) => {
      await withJwtRetry(async () => {
        const { error } = await supabase
          .from('leads')
          .update({ status: 'negotiation' })
          .eq('id', leadId);
        if (error) throw error;
      });
    },

    onSuccess: (_d, leadId) => {
      invalidate(leadId);
      toast({ title: 'Lead reaberto' });
    },
    onError: (e: any) => toast({ title: 'Erro', description: e.message, variant: 'destructive' }),
  });

  return { markAsWon, markAsLost, reopen };
}
