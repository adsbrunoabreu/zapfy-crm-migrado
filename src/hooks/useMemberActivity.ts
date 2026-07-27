import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

export interface MemberActivity {
  leadsCount: number;
  messagesCount: number;
  conversionsCount: number;
  totalValue: number;
  leadsByStatus: Record<string, number>;
  goals: Array<{
    id: string;
    goalType: string;
    targetValue: number;
    currentValue: number;
    periodStart: string;
    periodEnd: string;
  }>;
}

export function useMemberActivity(memberId: string | null) {
  const { profile } = useAuth();
  const companyId = profile?.company_id;

  return useQuery({
    queryKey: ['member-activity', memberId, companyId],
    queryFn: async (): Promise<MemberActivity> => {
      if (!memberId || !companyId) {
        throw new Error('Missing memberId or companyId');
      }

      // Fetch leads assigned to member
      const { data: leads, error: leadsError } = await supabase
        .from('leads')
        .select('id, status, value')
        .eq('company_id', companyId)
        .eq('assigned_to', memberId)
        .limit(2000);

      if (leadsError) throw leadsError;

      const leadIds = leads?.map(l => l.id) || [];

      const messagesCount = 0;

      // Calculate stats
      const leadsCount = leads?.length || 0;
      const conversionsCount = leads?.filter(l => l.status === 'won').length || 0;
      const totalValue = leads?.reduce((sum, l) => sum + (Number(l.value) || 0), 0) || 0;

      // Group by status
      const leadsByStatus: Record<string, number> = {};
      leads?.forEach(lead => {
        leadsByStatus[lead.status] = (leadsByStatus[lead.status] || 0) + 1;
      });

      // Fetch active goals
      const now = new Date().toISOString().split('T')[0];
      const { data: goalsData, error: goalsError } = await supabase
        .from('user_goals')
        .select('*')
        .eq('user_id', memberId)
        .eq('company_id', companyId)
        .lte('period_start', now)
        .gte('period_end', now);

      if (goalsError) throw goalsError;

      // Calculate current values for goals
      const goals = (goalsData || []).map(goal => {
        let currentValue = 0;
        
        if (goal.goal_type === 'leads') {
          currentValue = leadsCount;
        } else if (goal.goal_type === 'value') {
          currentValue = totalValue;
        } else if (goal.goal_type === 'conversion') {
          currentValue = leadsCount > 0 ? (conversionsCount / leadsCount) * 100 : 0;
        }

        return {
          id: goal.id,
          goalType: goal.goal_type,
          targetValue: Number(goal.target_value),
          currentValue,
          periodStart: goal.period_start,
          periodEnd: goal.period_end,
        };
      });

      return {
        leadsCount,
        messagesCount,
        conversionsCount,
        totalValue,
        leadsByStatus,
        goals,
      };
    },
    enabled: !!memberId && !!companyId,
  });
}
