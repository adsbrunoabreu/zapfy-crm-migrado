import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import type { Tables, TablesInsert, TablesUpdate } from '@/integrations/supabase/types';

type Company = Tables<'companies'>;
type CompanyInsert = TablesInsert<'companies'>;
type CompanyUpdate = TablesUpdate<'companies'>;

interface CompanyWithCounts extends Company {
  usersCount: number;
  leadsCount: number;
}

// Fetch all companies (for Master users)
export function useCompanies() {
  return useQuery({
    queryKey: ['companies'],
    queryFn: async () => {
      const { data: companies, error } = await supabase
        .from('companies')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;

      // Fetch counts for each company
      const companiesWithCounts: CompanyWithCounts[] = await Promise.all(
        (companies || []).map(async (company) => {
          const [usersResult, leadsResult] = await Promise.all([
            supabase.from('profiles').select('id', { count: 'exact', head: true }).eq('company_id', company.id),
            supabase.from('leads').select('id', { count: 'exact', head: true }).eq('company_id', company.id),
          ]);

          return {
            ...company,
            usersCount: usersResult.count || 0,
            leadsCount: leadsResult.count || 0,
          };
        })
      );

      return companiesWithCounts;
    },
  });
}

// Fetch the logged-in user's company
export function useUserCompany() {
  const { profile } = useAuth();

  return useQuery({
    queryKey: ['user-company', profile?.company_id],
    queryFn: async () => {
      if (!profile?.company_id) return null;

      const { data, error } = await supabase
        .from('companies')
        .select('*')
        .eq('id', profile.company_id)
        .maybeSingle();

      if (error) throw error;
      return data;
    },
    enabled: !!profile?.company_id,
    staleTime: 1000 * 60 * 5,
    gcTime: 1000 * 60 * 30,
    placeholderData: (prev) => prev,
  });
}

// Create a new company
export function useCreateCompany() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (company: CompanyInsert) => {
      const { data, error } = await supabase
        .from('companies')
        .insert(company)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['companies'] });
    },
  });
}

// Update a company
export function useUpdateCompany() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, ...updates }: CompanyUpdate & { id: string }) => {
      const { data, error } = await supabase
        .from('companies')
        .update(updates)
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['companies'] });
      queryClient.invalidateQueries({ queryKey: ['user-company', data.id] });
    },
  });
}
