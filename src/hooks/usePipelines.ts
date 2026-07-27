import { useQuery, useMutation, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { useCreateLeadActivity } from './useLeadActivities';
import { parsePlanLimitError } from './usePlanLimitGuard';

const PIPELINES_TIMEOUT_MS = 12_000;

const isRateLimited = (err: any) => {
  const code = err?.status ?? err?.code;
  const msg = `${err?.message ?? ''} ${err?.details ?? ''}`.toLowerCase();
  return code === 429 || code === '429' || msg.includes('rate limit') || msg.includes('too many requests') || msg.includes('failed to fetch');
};

const withTimeout = async <T,>(promise: PromiseLike<T>, ms: number, label = 'pipeline'): Promise<T> => {
  let timer: ReturnType<typeof setTimeout> | null = null;
  try {
    return await Promise.race([
      Promise.resolve(promise),
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => reject(new Error(`Tempo limite ao carregar ${label}`)), ms);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
};

const pipelineRetry = (failureCount: number, error: any) => {
  if (isRateLimited(error)) return false;
  if (`${error?.message ?? ''}`.includes('Tempo limite')) return failureCount < 1;
  return failureCount < 2;
};


export interface PipelineStage {
  id: string;
  name: string;
  color: string | null;
  position: number;
  pipeline_id: string;
}

export interface Pipeline {
  id: string;
  name: string;
  description: string | null;
  is_default: boolean | null;
  company_id: string;
  created_at: string;
  updated_at: string;
  lead_count?: number;
  stages?: PipelineStage[];
}

export interface LeadTag {
  id: string;
  name: string;
  color: string | null;
}

export interface LeadAssignee {
  id: string;
  full_name: string | null;
  email: string;
}

export interface StageWithLeads extends PipelineStage {
  leads: {
    id: string;
    name: string;
    phone: string | null;
    email: string | null;
    value: number | null;
    status: string;
    created_at: string;
    assigned_to: string | null;
    assignee: LeadAssignee | null;
    tags: LeadTag[];
    hasPendingActivities: boolean;
    numeric_id?: number;
    tenant_seq?: number;
    avatar_url?: string | null;
    contact_photo_url?: string | null;
    medical_doctor_id?: string | null;
    medical_procedure_id?: string | null;
    medical_doctor_name?: string | null;
    medical_procedure_name?: string | null;
    procedures?: { id: string; name: string }[];
    insurance?: string | null;
  }[];
}

export function usePipelines() {
  const { profile } = useAuth();

  return useQuery({
    queryKey: ['pipelines', profile?.company_id],
    queryFn: async () => {
      const { data, error } = await withTimeout(
        supabase
          .from('pipelines')
          .select(`
            *,
            stages:pipeline_stages(*)
          `)
          .eq('company_id', profile!.company_id)
          .order('created_at', { ascending: true }),
        PIPELINES_TIMEOUT_MS,
        'pipelines',
      );

      if (error) throw error;

      if (!data || data.length === 0) {
        return [] as Pipeline[];
      }

      const { data: leadRows } = await withTimeout(
        supabase
          .from('leads')
          .select('pipeline_id')
          .eq('company_id', profile!.company_id)
          .limit(10000),
        PIPELINES_TIMEOUT_MS,
        'leads',
      );

      const leadCountByPipeline = new Map<string, number>();
      (leadRows || []).forEach((lead) => {
        if (lead.pipeline_id) {
          leadCountByPipeline.set(lead.pipeline_id, (leadCountByPipeline.get(lead.pipeline_id) || 0) + 1);
        }
      });

      // Sort stages by position
      return (data as Pipeline[]).map(pipeline => ({
        ...pipeline,
        lead_count: leadCountByPipeline.get(pipeline.id) || 0,
        stages: pipeline.stages?.sort((a, b) => a.position - b.position) || []
      }));
    },
    enabled: !!profile,
    staleTime: 120_000,
    gcTime: 10 * 60_000,
    placeholderData: keepPreviousData,
    retry: pipelineRetry,
  });
}

export function usePipelineWithLeads(pipelineId: string | null) {
  const { profile } = useAuth();
  const companyId = profile?.company_id ?? null;

  return useQuery({
    queryKey: ['pipeline-leads', companyId, pipelineId],
    queryFn: async () => {
      if (!pipelineId) return null;

      // No mock fallback


      // Fetch stages
      const { data: stages, error: stagesError } = await withTimeout(
        supabase
          .from('pipeline_stages')
          .select('*')
          .eq('pipeline_id', pipelineId)
          .order('position', { ascending: true }),
        PIPELINES_TIMEOUT_MS,
        'etapas',
      );

      if (stagesError) throw stagesError;

      // Fetch leads for this pipeline with assignee — defensive company scope + bounded list
      let leadsQuery = supabase
        .from('leads')
        .select('id, name, phone, email, value, status, stage_id, created_at, assigned_to, numeric_id, tenant_seq, avatar_url, insurance, medical_doctor_id, medical_procedure_id, assignee:profiles!assigned_to(id, full_name, email), medical_doctor:medical_doctors!medical_doctor_id(id, full_name), medical_procedure:medical_procedures!medical_procedure_id(id, name)')
        .eq('pipeline_id', pipelineId);
      if (companyId) leadsQuery = leadsQuery.eq('company_id', companyId);
      const { data: leads, error: leadsError } = await withTimeout(
        leadsQuery.order('created_at', { ascending: false }).limit(2000),
        PIPELINES_TIMEOUT_MS,
        'leads do pipeline',
      );


      if (leadsError) throw leadsError;

      const leadIds = (leads || []).map(l => l.id);
      const phones = Array.from(
        new Set((leads || []).map(l => l.phone).filter((p): p is string => !!p))
      );

      // Fetch tags + pending activities + WhatsApp profile photos + procedures in parallel
      const [tagsRes, pendingRes, photosRes, procsRes] = leadIds.length > 0
        ? await Promise.all([
            supabase.from('lead_tags').select('lead_id, tag:tags(id, name, color)').in('lead_id', leadIds),
            (supabase as any).from('scheduled_messages').select('lead_id').in('lead_id', leadIds).eq('status', 'pending'),
            phones.length > 0 && companyId
              ? supabase
                  .from('conversations')
                  .select('phone, contact_photo_url')
                  .eq('company_id', companyId)
                  .in('phone', phones)
                  .not('contact_photo_url', 'is', null)
              : Promise.resolve({ data: [] as any[] }),
            (supabase as any).from('lead_procedures')
              .select('lead_id, medical_procedure_id, procedure:medical_procedures(id, name)')
              .in('lead_id', leadIds),
          ])
        : [{ data: [] as any[] }, { data: [] as any[] }, { data: [] as any[] }, { data: [] as any[] }];

      const leadTags = tagsRes.data || [];
      const pendingActivities = pendingRes.data || [];
      const contactPhotos = (photosRes as any).data || [];
      const leadProcedures = (procsRes as any).data || [];

      const proceduresMap = new Map<string, { id: string; name: string }[]>();
      leadProcedures.forEach((lp: any) => {
        if (!lp.procedure) return;
        const arr = proceduresMap.get(lp.lead_id) || [];
        arr.push({ id: lp.procedure.id, name: lp.procedure.name });
        proceduresMap.set(lp.lead_id, arr);
      });

      const tagsMap = new Map<string, LeadTag[]>();
      leadTags.forEach((lt: any) => {
        const tag = lt.tag as unknown as LeadTag;
        if (tag) {
          const existing = tagsMap.get(lt.lead_id) || [];
          existing.push(tag);
          tagsMap.set(lt.lead_id, existing);
        }
      });

      const pendingSet = new Set(pendingActivities.map((p: any) => p.lead_id));
      const photoByPhone = new Map<string, string>();
      contactPhotos.forEach((c: any) => {
        if (c.phone && c.contact_photo_url && !photoByPhone.has(c.phone)) {
          photoByPhone.set(c.phone, c.contact_photo_url);
        }
      });

      const stagesWithLeads: StageWithLeads[] = (stages || []).map(stage => ({
        ...stage,
        leads: (leads || []).filter(lead => lead.stage_id === stage.id).map(lead => ({
          ...lead,
          assignee: lead.assignee as LeadAssignee | null,
          tags: tagsMap.get(lead.id) || [],
          hasPendingActivities: pendingSet.has(lead.id),
          contact_photo_url: lead.phone ? photoByPhone.get(lead.phone) ?? null : null,
          medical_doctor_name: (lead as any).medical_doctor?.full_name ?? null,
          medical_procedure_name: (lead as any).medical_procedure?.name ?? null,
          procedures: proceduresMap.get(lead.id) || [],
          insurance: (lead as any).insurance ?? null,
        }))
      }));

      return stagesWithLeads;
    },
    enabled: !!profile && !!pipelineId,
    staleTime: 60_000,
    gcTime: 10 * 60_000,
    refetchOnWindowFocus: false,
    placeholderData: keepPreviousData,
    retry: pipelineRetry,
  });
}


export function useCreatePipeline() {
  const queryClient = useQueryClient();
  const { profile } = useAuth();

  return useMutation({
    mutationFn: async (pipeline: { name: string; description?: string }) => {
      if (!profile?.company_id) throw new Error('Empresa não encontrada');
      
      const { data, error } = await supabase
        .from('pipelines')
        .insert({
          ...pipeline,
          company_id: profile.company_id,
        })
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pipelines'] });
      toast.success('Pipeline criado com sucesso!');
    },
    onError: (error: any) => {
      const planMsg = parsePlanLimitError(error);
      toast.error(planMsg ? 'Limite do plano atingido' : 'Não foi possível criar o pipeline', {
        description: planMsg || error?.message || 'Tente novamente em instantes.',
      });
    },
  });
}

export function useCreateStage() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (stage: { name: string; color?: string; position: number; pipeline_id: string }) => {
      const { data, error } = await supabase
        .from('pipeline_stages')
        .insert(stage)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pipelines'] });
      queryClient.invalidateQueries({ queryKey: ['pipeline-leads'] });
      toast.success('Etapa criada com sucesso!');
    },
    onError: (error: any) => {
      toast.error('Não foi possível criar a etapa', {
        description: error?.message || 'Verifique os dados e tente novamente.',
      });
    },
  });
}

export function useUpdateLeadStage() {
  const queryClient = useQueryClient();
  const createActivity = useCreateLeadActivity();

  return useMutation({
    mutationFn: async ({ leadId, stageId, stageName }: { leadId: string; stageId: string; stageName?: string }) => {
      const { error } = await supabase
        .from('leads')
        .update({ stage_id: stageId })
        .eq('id', leadId);

      if (error) throw error;
      return { stageName };
    },
    onMutate: async ({ leadId, stageId }) => {
      await queryClient.cancelQueries({ queryKey: ['pipeline-leads'] });
      // Snapshot all pipeline-leads caches so we can restore on error
      const previous = queryClient.getQueriesData<StageWithLeads[] | null>({ queryKey: ['pipeline-leads'] });

      queryClient.setQueriesData<StageWithLeads[] | null>(
        { queryKey: ['pipeline-leads'] },
        (old) => {
          if (!old) return old;
          let movedLead: StageWithLeads['leads'][0] | null = null;
          const updated = old.map(stage => {
            const leadIndex = stage.leads.findIndex(l => l.id === leadId);
            if (leadIndex !== -1) {
              movedLead = { ...stage.leads[leadIndex] };
              return { ...stage, leads: stage.leads.filter(l => l.id !== leadId) };
            }
            return stage;
          });
          if (movedLead) {
            return updated.map(stage =>
              stage.id === stageId ? { ...stage, leads: [...stage.leads, movedLead!] } : stage
            );
          }
          return updated;
        }
      );
      return { previous };
    },
    onError: (err: any, _vars, context) => {
      // Restore each cache snapshot
      context?.previous?.forEach(([key, data]) => queryClient.setQueryData(key, data));
      const msg = String(err?.message || err?.context?.message || '').toLowerCase();
      const isClosed =
        msg.includes('closed') ||
        msg.includes('won') ||
        msg.includes('lost') ||
        msg.includes('ganho') ||
        msg.includes('perdido') ||
        msg.includes('immutable');
      if (isClosed) {
        toast.error('Lead fechado não pode ser movido', {
          description: 'Leads marcados como Ganho ou Perdido precisam ser reabertos antes de mudar de etapa.',
        });
      } else {
        toast.error('Erro ao mover lead');
      }
    },
    onSuccess: (data, variables) => {
      toast.success(`Lead movido para "${data.stageName || 'nova etapa'}"`);
      createActivity.mutate({
        leadId: variables.leadId,
        actionType: 'stage_changed',
        description: `Lead movido para etapa "${data.stageName || 'nova etapa'}"`,
        metadata: { new_stage_id: variables.stageId, new_stage_name: data.stageName },
      });
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['pipeline-leads'] });
      queryClient.invalidateQueries({ queryKey: ['leads'] });
    },
  });
}

// ============================================================
// Pipeline / Stage / Members management
// ============================================================

export function useUpdatePipeline() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, name, description }: { id: string; name: string; description?: string | null }) => {
      const { error } = await supabase
        .from('pipelines')
        .update({ name, description: description ?? null })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pipelines'] });
      toast.success('Pipeline atualizado com sucesso!');
    },
    onError: (e: any) =>
      toast.error('Não foi possível salvar o pipeline', {
        description: e?.message || 'Tente novamente em instantes.',
      }),
  });
}

export function useDeletePipeline() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('pipelines').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pipelines'] });
      queryClient.invalidateQueries({ queryKey: ['pipeline-leads'] });
      toast.success('Pipeline excluído com sucesso!');
    },
    onError: (e: any) =>
      toast.error('Não foi possível excluir o pipeline', {
        description: e?.message || 'Verifique se não há leads vinculados.',
      }),
  });
}

export function useUpdateStage() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, name, color }: { id: string; name?: string; color?: string }) => {
      const patch: Record<string, any> = {};
      if (name !== undefined) patch.name = name;
      if (color !== undefined) patch.color = color;
      const { error } = await supabase.from('pipeline_stages').update(patch).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pipelines'] });
      queryClient.invalidateQueries({ queryKey: ['pipeline-leads'] });
      toast.success('Etapa atualizada!');
    },
    onError: (e: any) =>
      toast.error('Não foi possível atualizar a etapa', {
        description: e?.message || 'Tente novamente em instantes.',
      }),
  });
}

export function useDeleteStage() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { count, error: countError } = await supabase
        .from('leads')
        .select('id', { count: 'exact', head: true })
        .eq('stage_id', id);
      if (countError) throw countError;
      if ((count || 0) > 0) {
        throw new Error('Não é possível excluir: existem leads nesta etapa');
      }
      const { error } = await supabase.from('pipeline_stages').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pipelines'] });
      queryClient.invalidateQueries({ queryKey: ['pipeline-leads'] });
      toast.success('Etapa excluída com sucesso!');
    },
    onError: (e: any) =>
      toast.error('Não foi possível excluir a etapa', {
        description: e?.message || 'Mova os leads desta etapa antes de excluí-la.',
      }),
  });
}

export function useReorderStages() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (orderedIds: string[]) => {
      // Atomic reorder via RPC (transactional, validates company)
      const { error } = await (supabase as any).rpc('reorder_pipeline_stages', { p_ids: orderedIds });
      if (error) throw error;
    },
    onMutate: async (orderedIds) => {
      await queryClient.cancelQueries({ queryKey: ['pipelines'] });
      const previousPipelines = queryClient.getQueriesData({ queryKey: ['pipelines'] });
      // Optimistic: reorder stages within any cached pipeline
      queryClient.setQueriesData<any>({ queryKey: ['pipelines'] }, (old: any) => {
        if (!Array.isArray(old)) return old;
        return old.map((p: any) => {
          if (!p.stages?.some((s: any) => orderedIds.includes(s.id))) return p;
          const orderMap = new Map(orderedIds.map((id, i) => [id, i]));
          const next = [...p.stages].sort(
            (a: any, b: any) => (orderMap.get(a.id) ?? a.position) - (orderMap.get(b.id) ?? b.position)
          ).map((s: any, idx: number) => ({ ...s, position: idx }));
          return { ...p, stages: next };
        });
      });
      return { previousPipelines };
    },
    onError: (e: any, _vars, context) => {
      context?.previousPipelines?.forEach(([key, data]: any) => queryClient.setQueryData(key, data));
      toast.error('Erro ao reordenar etapas: ' + (e?.message || 'falha'));
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['pipelines'] });
      queryClient.invalidateQueries({ queryKey: ['pipeline-leads'] });
    },
  });
}

export interface PipelineMember {
  id: string;
  user_id: string;
  pipeline_id: string;
}

export function usePipelineMembers(pipelineId: string | null) {
  return useQuery({
    queryKey: ['pipeline-members', pipelineId],
    queryFn: async () => {
      if (!pipelineId) return [] as PipelineMember[];
      if (pipelineId.startsWith('mock-')) return [] as PipelineMember[];
      const { data, error } = await supabase
        .from('pipeline_members' as any)
        .select('id, user_id, pipeline_id')
        .eq('pipeline_id', pipelineId);
      if (error) throw error;
      return (data || []) as unknown as PipelineMember[];
    },
    enabled: !!pipelineId,
    staleTime: 1000 * 60 * 2,
  });
}

export function useUpdatePipelineMembers() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ pipelineId, userIds }: { pipelineId: string; userIds: string[] }) => {
      const { data: existing, error: e1 } = await supabase
        .from('pipeline_members' as any)
        .select('user_id')
        .eq('pipeline_id', pipelineId);
      if (e1) throw e1;
      const currentIds = new Set((existing || []).map((m: any) => m.user_id));
      const nextIds = new Set(userIds);
      const toAdd = [...nextIds].filter(id => !currentIds.has(id));
      const toRemove = [...currentIds].filter(id => !nextIds.has(id));

      if (toAdd.length > 0) {
        const { error } = await supabase
          .from('pipeline_members' as any)
          .insert(toAdd.map(user_id => ({ pipeline_id: pipelineId, user_id })));
        if (error) throw error;
      }
      if (toRemove.length > 0) {
        const { error } = await supabase
          .from('pipeline_members' as any)
          .delete()
          .eq('pipeline_id', pipelineId)
          .in('user_id', toRemove);
        if (error) throw error;
      }
    },
    onSuccess: (_d, vars) => {
      queryClient.invalidateQueries({ queryKey: ['pipeline-members', vars.pipelineId] });
      queryClient.invalidateQueries({ queryKey: ['pipelines'] });
      toast.success('Membros atualizados com sucesso!');
    },
    onError: (e: any) =>
      toast.error('Não foi possível atualizar os membros', {
        description: e?.message || 'Tente novamente em instantes.',
      }),
  });
}

