import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

interface PlanLimits {
  max_users: number | null;
  max_leads: number | null;
  max_whatsapp_instances: number | null;
  max_pipelines: number | null;
}

interface PlanUsage {
  users_count: number;
  pending_invites_count: number;
  instances_count: number;
  leads_count: number;
  pipelines_count: number;
}

export interface PlanLimitState {
  loading: boolean;
  hasPlan: boolean;
  limits: PlanLimits | null;
  usage: PlanUsage | null;
  // booleans
  canAddUser: boolean;
  canAddInstance: boolean;
  canAddLead: boolean;
  canAddPipeline: boolean;
  // remaining (null = ilimitado)
  usersRemaining: number | null;
  instancesRemaining: number | null;
  leadsRemaining: number | null;
  pipelinesRemaining: number | null;
  // mensagens prontas para tooltip/toast
  userBlockedReason: string | null;
  instanceBlockedReason: string | null;
  leadBlockedReason: string | null;
  pipelineBlockedReason: string | null;
}

/**
 * Lê limites do plano + uso atual da empresa do usuário logado.
 * Triggers no banco já bloqueiam — este hook é só para UX (desabilitar botões, banners).
 */
export function usePlanLimitGuard() {
  const { profile } = useAuth();
  const companyId = profile?.company_id;

  const { data, isLoading } = useQuery({
    queryKey: ['plan-limit-guard', companyId],
    enabled: !!companyId,
    staleTime: 60_000,
    queryFn: async () => {
      const [limitsRes, usageRes] = await Promise.all([
        supabase.rpc('get_company_plan_limits', { _company_id: companyId! }).maybeSingle(),
        supabase.rpc('get_company_plan_usage', { _company_id: companyId! }).maybeSingle(),
      ]);
      return {
        limits: (limitsRes.data ?? null) as PlanLimits | null,
        usage: (usageRes.data ?? null) as PlanUsage | null,
      };
    },
  });

  const limits = data?.limits ?? null;
  const usage = data?.usage ?? null;
  const hasPlan = !!limits && (limits.max_users !== null || limits.max_leads !== null || limits.max_whatsapp_instances !== null || limits.max_pipelines !== null);

  const usersUsed = (usage?.users_count ?? 0) + (usage?.pending_invites_count ?? 0);
  const usersRemaining = limits?.max_users == null ? null : Math.max(0, limits.max_users - usersUsed);
  const instancesRemaining = limits?.max_whatsapp_instances == null ? null : Math.max(0, limits.max_whatsapp_instances - (usage?.instances_count ?? 0));
  const leadsRemaining = limits?.max_leads == null ? null : Math.max(0, limits.max_leads - (usage?.leads_count ?? 0));
  const pipelinesRemaining = limits?.max_pipelines == null ? null : Math.max(0, limits.max_pipelines - (usage?.pipelines_count ?? 0));

  const canAddUser = usersRemaining == null || usersRemaining > 0;
  const canAddInstance = instancesRemaining == null || instancesRemaining > 0;
  const canAddLead = leadsRemaining == null || leadsRemaining > 0;
  const canAddPipeline = pipelinesRemaining == null || pipelinesRemaining > 0;

  return {
    loading: isLoading,
    hasPlan,
    limits,
    usage,
    canAddUser,
    canAddInstance,
    canAddLead,
    canAddPipeline,
    usersRemaining,
    instancesRemaining,
    leadsRemaining,
    pipelinesRemaining,
    userBlockedReason: canAddUser
      ? null
      : `Limite de ${limits?.max_users} usuário(s) do plano atingido. Faça upgrade para convidar mais membros.`,
    instanceBlockedReason: canAddInstance
      ? null
      : `Limite de ${limits?.max_whatsapp_instances} instância(s) WhatsApp atingido. Faça upgrade para conectar mais números.`,
    leadBlockedReason: canAddLead
      ? null
      : `Limite de ${limits?.max_leads?.toLocaleString('pt-BR')} leads atingido. Faça upgrade para adicionar mais.`,
    pipelineBlockedReason: canAddPipeline
      ? null
      : `Limite de ${limits?.max_pipelines} pipeline(s) atingido. Faça upgrade para criar mais funis.`,
  } satisfies PlanLimitState;
}

/**
 * Mapeia o erro Postgres das triggers de plano para uma mensagem amigável.
 * Retorna null se não for erro de plano (passar adiante).
 */
export function parsePlanLimitError(error: unknown): string | null {
  const raw = (error as any)?.message || (error as any)?.error_description || '';
  if (!raw || typeof raw !== 'string') return null;
  if (raw.includes('PLAN_LIMIT_USERS')) {
    return 'Limite de usuários do plano atingido. Faça upgrade para convidar mais pessoas.';
  }
  if (raw.includes('PLAN_LIMIT_INSTANCES')) {
    return 'Limite de instâncias WhatsApp do plano atingido. Faça upgrade para conectar mais números.';
  }
  if (raw.includes('PLAN_LIMIT_PIPELINES')) {
    return 'Limite de pipelines do plano atingido. Faça upgrade para criar mais funis.';
  }
  if (raw.includes('PLAN_LIMIT_LEADS')) {
    return 'Limite de leads do plano atingido. Faça upgrade para adicionar mais leads.';
  }
  return null;
}
