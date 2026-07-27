import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface Invoice {
  id: string;
  company_id: string;
  subscription_id: string;
  invoice_number: string;
  amount: number;
  currency: string;
  billing_cycle: 'monthly' | 'yearly';
  period_start: string;
  period_end: string;
  status: 'paid' | 'open' | 'past_due' | 'void' | 'refunded';
  issued_at: string;
  paid_at: string | null;
  payment_method: string | null;
  pdf_url: string | null;
  description: string | null;
}

export function useInvoices(companyId?: string, limit = 50) {
  return useQuery({
    queryKey: ['invoices', companyId, limit],
    queryFn: async () => {
      if (!companyId) return [] as Invoice[];
      const { data, error } = await (supabase as any)
        .from('invoices')
        .select('*')
        .eq('company_id', companyId)
        .order('issued_at', { ascending: false })
        .limit(limit);
      if (error) throw error;
      return (data || []) as Invoice[];
    },
    enabled: !!companyId,
  });
}
