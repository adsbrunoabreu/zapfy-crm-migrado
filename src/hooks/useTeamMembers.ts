import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

export interface TeamMember {
  id: string;
  name: string;
  email: string;
  role: 'company_admin' | 'user' | 'master';
  createdAt: string;
  status: string;
  isOnline: boolean;
  lastSeen: string | null;
  isActive: boolean;
  phone: string | null;
  avatarUrl: string | null;
  tags: string[];
}

export function useTeamMembers() {
  const { profile } = useAuth();
  const companyId = profile?.company_id;

  return useQuery({
    queryKey: ['team-members', companyId],
    queryFn: async () => {
      if (!companyId) return [];

      const { data, error } = await supabase
        .from('profiles')
        .select('id, full_name, email, role, created_at, status, is_online, last_seen, is_active, phone, avatar_url, tags')
        .eq('company_id', companyId)
        .order('created_at', { ascending: true });

      if (error) throw error;

      const members = (data || []).map((member): TeamMember => {
        let computedStatus = 'offline';
        if (member.is_online) {
          computedStatus = 'online';
        } else if (member.last_seen) {
          const lastSeenDate = new Date(member.last_seen);
          const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000);
          if (lastSeenDate > tenMinutesAgo) {
            computedStatus = 'away';
          }
        }

        return {
          id: member.id,
          name: member.full_name || member.email,
          email: member.email,
          role: member.role as TeamMember['role'],
          createdAt: member.created_at,
          status: computedStatus,
          isOnline: member.is_online ?? false,
          lastSeen: member.last_seen,
          isActive: member.is_active ?? true,
          phone: member.phone ?? null,
          avatarUrl: member.avatar_url ?? null,
          tags: ((member as any).tags as string[] | null) ?? [],
        };
      });

      // No mock fallback


      return members;
    },
    enabled: !!companyId,
  });
}
