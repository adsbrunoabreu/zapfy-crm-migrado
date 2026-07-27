import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import type { Tag } from './useTags';

/**
 * Carrega todos os vínculos lead↔tag da empresa de uma só vez,
 * agrupando por lead_id para uso eficiente em listas (Chat, Pipelines, etc.).
 */
export function useCompanyLeadTags() {
  const { profile } = useAuth();
  const companyId = profile?.company_id;

  return useQuery({
    queryKey: ['company-lead-tags', companyId],
    queryFn: async () => {
      if (!companyId) return new Map<string, Tag[]>();

      const { data, error } = await supabase
        .from('lead_tags')
        .select('lead_id, tag:tags(*)')
        .limit(5000);

      if (error) throw error;

      const map = new Map<string, Tag[]>();
      (data || []).forEach((row: any) => {
        if (!row.tag) return;
        const list = map.get(row.lead_id) || [];
        list.push(row.tag as Tag);
        map.set(row.lead_id, list);
      });
      return map;
    },
    enabled: !!companyId,
    staleTime: 30 * 1000,
  });
}
