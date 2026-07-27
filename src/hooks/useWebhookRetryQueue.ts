import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export interface RetryQueueItem {
  id: string;
  company_id: string;
  kind: 'persist_message' | 'status_update';
  payload: Record<string, unknown>;
  message_id: string | null;
  provider: string | null;
  attempts: number;
  max_attempts: number;
  next_attempt_at: string;
  picked_at: string | null;
  last_error: string | null;
  status: 'pending' | 'done' | 'dead' | 'cancelled';
  created_at: string;
  updated_at: string;
}

export interface RetryStats {
  pending?: number;
  dead?: number;
  done_24h?: number;
  oldest_pending?: string | null;
}

export function useWebhookRetryQueue(filter: { status?: string; companyId?: string }) {
  return useQuery({
    queryKey: ['webhook-retry-queue', filter],
    staleTime: 1000 * 20,
    queryFn: async () => {
      let q = supabase
        .from('webhook_retry_queue')
        .select('*')
        .order('updated_at', { ascending: false })
        .limit(200);
      if (filter.status && filter.status !== 'all') q = q.eq('status', filter.status);
      if (filter.companyId) q = q.eq('company_id', filter.companyId);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as RetryQueueItem[];
    },
  });
}

export function useWebhookRetryStats(companyId?: string) {
  return useQuery({
    queryKey: ['webhook-retry-stats', companyId ?? null],
    staleTime: 1000 * 30,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_webhook_retry_stats', {
        _company_id: companyId ?? null,
      });
      if (error) throw error;
      return (data ?? {}) as RetryStats;
    },
  });
}

export function useRetryNow() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.rpc('retry_webhook_now', { _id: id });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success('Item agendado para execução imediata');
      qc.invalidateQueries({ queryKey: ['webhook-retry-queue'] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

export function useCancelRetry() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.rpc('cancel_webhook_retry', { _id: id });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success('Item cancelado');
      qc.invalidateQueries({ queryKey: ['webhook-retry-queue'] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
}
