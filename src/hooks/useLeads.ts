import { useQuery, useMutation, useQueryClient, QueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { useCreateLeadActivity } from './useLeadActivities';
import { parsePlanLimitError } from './usePlanLimitGuard';

// Centralized invalidation for all lead-related queries
export function invalidateLeadQueries(queryClient: QueryClient) {
  // Pipeline / lead lists
  queryClient.invalidateQueries({ queryKey: ['leads'] });
  queryClient.invalidateQueries({ queryKey: ['pipeline-leads'] });
  queryClient.invalidateQueries({ queryKey: ['pipeline-totals'] });
  queryClient.invalidateQueries({ queryKey: ['leads-with-phone'] });
  queryClient.invalidateQueries({ queryKey: ['lead-full'] });
  // Dashboards (chaves reais)
  queryClient.invalidateQueries({ queryKey: ['executive-dashboard'] });
  queryClient.invalidateQueries({ queryKey: ['my-dashboard-stats'] });
  queryClient.invalidateQueries({ queryKey: ['dashboard-stats'] });
  queryClient.invalidateQueries({ queryKey: ['dashboard-medical'] });
  queryClient.invalidateQueries({ queryKey: ['master-dashboard'] });
  // Relatórios
  queryClient.invalidateQueries({ queryKey: ['report-leads'] });
  queryClient.invalidateQueries({ queryKey: ['pipeline-performance'] });
  queryClient.invalidateQueries({ queryKey: ['attendance-reports'] });
  // Financeiro
  queryClient.invalidateQueries({ queryKey: ['financial-overview'] });
}

export interface Lead {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  value: number | null;
  status: 'new' | 'contacted' | 'qualified' | 'proposal' | 'won' | 'lost';
  notes: string | null;
  pipeline_id: string | null;
  stage_id: string | null;
  company_id: string;
  assigned_to: string | null;
  created_at: string;
  updated_at: string;
  closed_at: string | null;
  closed_by: string | null;
  loss_reason_id: string | null;
  loss_reason_text: string | null;
  pipeline?: { name: string };
  stage?: { name: string };
  assignee?: { id: string; full_name: string | null; email: string };
  closer?: { id: string; full_name: string | null; email: string } | null;
  loss_reason?: { id: string; label: string } | null;
}

export function useLeads() {
  const { profile } = useAuth();

  return useQuery({
    queryKey: ['leads', profile?.company_id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('leads')
        .select(`
          *,
          pipeline:pipelines(name),
          stage:pipeline_stages(name),
          assignee:profiles!assigned_to(id, full_name, email),
          closer:profiles!closed_by(id, full_name, email),
          loss_reason:loss_reasons!loss_reason_id(id, label)
        `)
        .order('created_at', { ascending: false })
        .limit(1000);

      if (error) throw error;
      return (data ?? []) as Lead[];
    },
    enabled: !!profile,
  });
}

export function useCreateLead() {
  const queryClient = useQueryClient();
  const { profile } = useAuth();
  const createActivity = useCreateLeadActivity();

  return useMutation({
    mutationFn: async (lead: Omit<Lead, 'id' | 'created_at' | 'updated_at' | 'company_id'> & Record<string, any>) => {
      if (!profile?.company_id) throw new Error('Empresa não encontrada');

      const { _silent, ...payload } = lead as any;
      const { data, error } = await supabase
        .from('leads')
        .insert({
          ...payload,
          company_id: profile.company_id,
        })
        .select()
        .single();

      if (error) throw error;
      return { ...data, _silent } as any;
    },
    onSuccess: (data: any) => {
      invalidateLeadQueries(queryClient);
      if (!data?._silent) {
        toast.success('Lead criado com sucesso!');
      }
      createActivity.mutate({
        leadId: data.id,
        actionType: 'lead_created',
        description: `Lead "${data.name}" criado`,
      });
    },
    onError: (error) => {
      const msg = (error as Error).message || '';
      if (msg.includes('Ganho ou Perda')) {
        toast.error('Não é possível criar leads em etapas de Ganho ou Perda', {
          description: 'Selecione uma etapa aberta do pipeline.',
        });
        return;
      }
      const friendly = parsePlanLimitError(error);
      toast.error(friendly || 'Erro ao criar lead: ' + msg);
    },
  });
}

export function useUpdateLead() {
  const queryClient = useQueryClient();
  const createActivity = useCreateLeadActivity();

  return useMutation({
    mutationFn: async ({ id, ...updates }: Partial<Lead> & { id: string }) => {
      const payload: Record<string, unknown> = { ...updates };
      if ('name' in updates) {
        payload.name_manually_edited = true;
      }
      const { error } = await supabase
        .from('leads')
        .update(payload)
        .eq('id', id);

      if (error) throw error;
      return { id, updates };
    },
    onSuccess: ({ id, updates }) => {
      invalidateLeadQueries(queryClient);
      toast.success('Lead atualizado!');
      const fieldLabels: Record<string, string> = {
        name: 'Nome', phone: 'Telefone', email: 'E-mail', value: 'Valor',
        notes: 'Observações', assigned_to: 'Atendente', document: 'CPF/CNPJ',
        company_name: 'Empresa', source: 'Origem', birth_date: 'Nascimento',
        country: 'País', zip_code: 'CEP', address: 'Endereço',
        address_number: 'Número', address_complement: 'Complemento',
        neighborhood: 'Bairro', city: 'Cidade', state: 'Estado',
        pipeline_id: 'Pipeline', stage_id: 'Etapa', status: 'Status',
        avatar_url: 'Foto', name_manually_edited: 'Nome editado',
        medical_doctor_id: 'Médico', medical_procedure_id: 'Procedimento',
        insurance_id: 'Convênio', facility_id: 'Hospital/Clínica',
      };
      const rawFields = Object.keys(updates).filter(k => k !== 'id' && k !== 'name_manually_edited');
      if (rawFields.length === 0) return;
      const fields = rawFields.map(k => fieldLabels[k] || k).join(', ');
      createActivity.mutate({
        leadId: id,
        actionType: 'field_updated',
        description: `Campos atualizados: ${fields}`,
        metadata: { updated_fields: rawFields },
      });
    },
    onError: (error) => {
      toast.error('Erro ao atualizar lead: ' + error.message);
    },
  });
}

export function useDeleteLead() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('leads')
        .delete()
        .eq('id', id);

      if (error) throw error;
      return id;
    },
    onSuccess: () => {
      invalidateLeadQueries(queryClient);
      toast.success('Lead excluído!');
    },
    onError: (error) => {
      toast.error('Erro ao excluir lead: ' + error.message);
    },
  });
}

export function useBulkDeleteLeads() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (ids: string[]) => {
      const { error } = await supabase
        .from('leads')
        .delete()
        .in('id', ids);

      if (error) throw error;
    },
    onSuccess: () => {
      invalidateLeadQueries(queryClient);
      toast.success('Leads excluídos com sucesso!');
    },
    onError: (error) => {
      toast.error('Erro ao excluir leads: ' + error.message);
    },
  });
}

export function useBulkCreateLeads() {
  const queryClient = useQueryClient();
  const { profile } = useAuth();

  return useMutation({
    mutationFn: async (leads: Array<{
      name: string;
      phone?: string;
      email?: string;
      value?: number;
      pipeline_id: string;
      stage_id: string;
    }>) => {
      if (!profile?.company_id) throw new Error('Empresa não encontrada');
      
      const leadsWithCompany = leads.map(lead => ({
        ...lead,
        company_id: profile.company_id,
        status: 'new' as const,
      }));

      const { data, error } = await supabase
        .from('leads')
        .insert(leadsWithCompany)
        .select();

      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      invalidateLeadQueries(queryClient);
      toast.success(`${data.length} leads importados com sucesso!`);
    },
    onError: (error) => {
      const friendly = parsePlanLimitError(error);
      toast.error(friendly || 'Erro ao importar leads: ' + (error as Error).message);
    },
  });
}
