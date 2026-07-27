import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { subMonths, startOfMonth, endOfMonth, format, startOfDay, endOfDay } from 'date-fns';
import { ptBR } from 'date-fns/locale';

export interface MasterDashboardStats {
  mrr: number;
  arr: number;
  prevMrr: number;
  totalCompanies: number;
  activeCompanies: number;
  trialCompanies: number;
  suspendedCompanies: number;
  totalUsers: number;
  totalLeads: number;
  messagesToday: number;
  companiesGrowth: { month: string; count: number }[];
  mrrByMonth: { month: string; mrr: number }[];
  planDistribution: { status: string; count: number }[];
  topCompanies: { id: string; name: string; leads: number; users: number }[];
  recentCompanies: { id: string; name: string; plan_status: string; created_at: string }[];
}

export function useMasterDashboardStats() {
  return useQuery({
    queryKey: ['master-dashboard-stats'],
    queryFn: async (): Promise<MasterDashboardStats> => {
      const now = new Date();
      const todayStart = startOfDay(now).toISOString();
      const todayEnd = endOfDay(now).toISOString();

      const [companiesRes, subsRes, usersRes, leadsRes, messagesRes] = await Promise.all([
        supabase.from('companies').select('id, name, plan_status, created_at').order('created_at', { ascending: false }),
        (supabase as any).from('subscriptions').select('id, company_id, monthly_price, billing_cycle, status, created_at'),
        supabase.from('profiles').select('id', { count: 'exact', head: true }),
        supabase.from('leads').select('id, company_id', { count: 'exact' }).limit(10000),
        supabase.from('chat_messages').select('id', { count: 'exact', head: true }).gte('created_at', todayStart).lte('created_at', todayEnd),
      ]);

      if (companiesRes.error) throw companiesRes.error;

      const companies = companiesRes.data || [];
      const subs = (subsRes.data || []) as any[];
      const leads = leadsRes.data || [];

      // MRR: active subscriptions
      const monthlyValue = (s: any) => s.billing_cycle === 'yearly' ? Number(s.monthly_price) / 12 : Number(s.monthly_price);
      const mrr = subs.filter(s => s.status === 'active').reduce((sum, s) => sum + monthlyValue(s), 0);

      // Previous MRR: subs active 1 month ago (by created_at)
      const oneMonthAgo = subMonths(now, 1);
      const prevMrr = subs.filter(s => s.status === 'active' && new Date(s.created_at) < oneMonthAgo).reduce((sum, s) => sum + monthlyValue(s), 0);

      const arr = mrr * 12;

      const activeCompanies = companies.filter(c => c.plan_status === 'active').length;
      const trialCompanies = companies.filter(c => c.plan_status === 'trial').length;
      const suspendedCompanies = companies.filter(c => c.plan_status === 'suspended').length;

      // Companies growth (last 6 months)
      const companiesGrowth: { month: string; count: number }[] = [];
      for (let i = 5; i >= 0; i--) {
        const d = subMonths(now, i);
        const s = startOfMonth(d), e = endOfMonth(d);
        const count = companies.filter(c => {
          const cd = new Date(c.created_at);
          return cd >= s && cd <= e;
        }).length;
        const label = format(d, 'MMM', { locale: ptBR });
        companiesGrowth.push({ month: label.charAt(0).toUpperCase() + label.slice(1), count });
      }

      // MRR by month (cumulative active subs by created_at)
      const mrrByMonth: { month: string; mrr: number }[] = [];
      for (let i = 5; i >= 0; i--) {
        const d = subMonths(now, i);
        const e = endOfMonth(d);
        const monthMrr = subs.filter(s => s.status === 'active' && new Date(s.created_at) <= e).reduce((sum, s) => sum + monthlyValue(s), 0);
        const label = format(d, 'MMM', { locale: ptBR });
        mrrByMonth.push({ month: label.charAt(0).toUpperCase() + label.slice(1), mrr: monthMrr });
      }

      // Plan distribution
      const planDistribution = [
        { status: 'Ativo', count: activeCompanies },
        { status: 'Trial', count: trialCompanies },
        { status: 'Suspenso', count: suspendedCompanies },
        { status: 'Cancelado', count: companies.filter(c => c.plan_status === 'cancelled').length },
      ].filter(p => p.count > 0);

      // Top companies by leads
      const leadsByCompany: Record<string, number> = {};
      leads.forEach(l => { if (l.company_id) leadsByCompany[l.company_id] = (leadsByCompany[l.company_id] || 0) + 1; });

      // Need user counts per company
      const usersByCompany: Record<string, number> = {};
      const { data: profilesAll } = await supabase.from('profiles').select('id, company_id').limit(5000);
      (profilesAll || []).forEach(p => { if (p.company_id) usersByCompany[p.company_id] = (usersByCompany[p.company_id] || 0) + 1; });

      const topCompanies = companies
        .map(c => ({ id: c.id, name: c.name, leads: leadsByCompany[c.id] || 0, users: usersByCompany[c.id] || 0 }))
        .sort((a, b) => b.leads - a.leads)
        .slice(0, 10);

      const recentCompanies = companies.slice(0, 5).map(c => ({
        id: c.id, name: c.name, plan_status: c.plan_status, created_at: c.created_at,
      }));

      return {
        mrr,
        arr,
        prevMrr,
        totalCompanies: companies.length,
        activeCompanies,
        trialCompanies,
        suspendedCompanies,
        totalUsers: usersRes.count || 0,
        totalLeads: leadsRes.count || 0,
        messagesToday: messagesRes.count || 0,
        companiesGrowth,
        mrrByMonth,
        planDistribution,
        topCompanies,
        recentCompanies,
      };
    },
  });
}
