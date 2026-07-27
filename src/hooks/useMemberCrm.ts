import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';

export interface MemberNote {
  id: string;
  company_id: string;
  member_id: string;
  author_id: string;
  content: string;
  created_at: string;
  updated_at: string;
}

export function useMemberNotes(memberId: string | null) {
  return useQuery({
    queryKey: ['member-notes', memberId],
    enabled: !!memberId,
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('team_member_notes')
        .select('*')
        .eq('member_id', memberId!)
        .order('created_at', { ascending: false })
        .limit(200);
      if (error) throw error;
      return (data ?? []) as MemberNote[];
    },
  });
}

export function useCreateMemberNote() {
  const qc = useQueryClient();
  const { profile } = useAuth();
  return useMutation({
    mutationFn: async ({ memberId, content }: { memberId: string; content: string }) => {
      if (!profile?.company_id) throw new Error('Sem empresa vinculada');
      const trimmed = content.trim();
      if (!trimmed) throw new Error('Conteúdo vazio');
      if (trimmed.length > 4000) throw new Error('Máximo 4000 caracteres');
      const { error } = await supabase.from('team_member_notes').insert({
        member_id: memberId,
        author_id: profile.id,
        company_id: profile.company_id,
        content: trimmed,
      });
      if (error) throw error;
    },
    onSuccess: (_d, v) => {
      qc.invalidateQueries({ queryKey: ['member-notes', v.memberId] });
      toast.success('Observação adicionada');
    },
    onError: (e: any) => toast.error(e?.message || 'Erro ao salvar observação'),
  });
}

export function useUpdateMemberNote() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, content }: { id: string; content: string }) => {
      const trimmed = content.trim();
      if (!trimmed) throw new Error('Conteúdo vazio');
      const { error } = await supabase
        .from('team_member_notes')
        .update({ content: trimmed })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['member-notes'] });
      toast.success('Observação atualizada');
    },
    onError: (e: any) => toast.error(e?.message || 'Erro ao atualizar'),
  });
}

export function useDeleteMemberNote() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('team_member_notes').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['member-notes'] });
      toast.success('Observação removida');
    },
    onError: (e: any) => toast.error(e?.message || 'Erro ao remover'),
  });
}

export function useUpdateMemberTags() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ memberId, tags }: { memberId: string; tags: string[] }) => {
      const clean = Array.from(
        new Set(tags.map((t) => t.trim().toLowerCase()).filter((t) => t && t.length <= 32)),
      ).slice(0, 20);
      const { error } = await supabase
        .from('profiles')
        .update({ tags: clean })
        .eq('id', memberId);
      if (error) throw error;
      return clean;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['team-members'] });
      toast.success('Tags atualizadas');
    },
    onError: (e: any) => toast.error(e?.message || 'Erro ao salvar tags'),
  });
}

export function useUpdateMemberEmail() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ memberId, email }: { memberId: string; email: string }) => {
      const { data, error } = await supabase.functions.invoke('admin-update-member-email', {
        body: { member_id: memberId, new_email: email },
      });
      if (error) {
        const ctx: any = (error as any).context;
        let msg = error.message;
        try { msg = (await ctx?.json?.())?.error || msg; } catch {}
        throw new Error(msg);
      }
      if ((data as any)?.error) throw new Error((data as any).error);
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['team-members'] });
      qc.invalidateQueries({ queryKey: ['profile'] });
      toast.success('E-mail atualizado');
    },
    onError: (e: any) => toast.error(e?.message || 'Erro ao atualizar e-mail'),
  });
}
