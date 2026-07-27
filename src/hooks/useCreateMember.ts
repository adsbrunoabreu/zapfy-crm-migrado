import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { parsePlanLimitError } from './usePlanLimitGuard';

interface CreateMemberData {
  name: string;
  email: string;
  password: string;
  role: 'agente' | 'admin';
}

/**
 * Extrai a mensagem de erro de uma resposta non-2xx do edge function
 * (FunctionsHttpError carrega o body em `error.context`).
 */
async function extractEdgeError(error: any): Promise<string | null> {
  try {
    if (error?.context?.json) {
      const body = await error.context.json();
      if (body?.error) return body.error as string;
    }
    if (error?.context?.text) {
      const body = await error.context.text();
      try {
        const parsed = JSON.parse(body);
        if (parsed?.error) return parsed.error as string;
      } catch {
        if (body) return body as string;
      }
    }
  } catch {
    /* ignore */
  }
  return null;
}

export function useCreateMember() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: CreateMemberData) => {
      const { data: response, error } = await supabase.functions.invoke('create-team-member', {
        body: data,
      });

      if (error) {
        const edgeMsg = await extractEdgeError(error);
        const message = edgeMsg || error.message || 'Erro ao criar membro';
        const planMsg = parsePlanLimitError({ message });
        throw new Error(planMsg || message);
      }

      if (response?.error) {
        const planMsg = parsePlanLimitError({ message: response.error });
        throw new Error(planMsg || response.error);
      }

      return response;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['team-members'] });
      queryClient.invalidateQueries({ queryKey: ['plan-limit-guard'] });
      queryClient.invalidateQueries({ queryKey: ['usage-limits'] });
      toast.success('Membro criado com sucesso!');
    },
    onError: (error: Error) => {
      toast.error('Erro ao criar membro', { description: error.message });
    },
  });
}
