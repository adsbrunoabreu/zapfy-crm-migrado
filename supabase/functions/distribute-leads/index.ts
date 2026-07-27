import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
    const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') ?? '';

    const supabaseClient = createClient(SUPABASE_URL, SERVICE_KEY);

    // ── Auth: aceita (a) chamada interna com x-internal-key=SERVICE_KEY
    //                    (trigger / outra edge function), ou
    //                  (b) JWT de usuário admin/master da MESMA company_id.
    const internalKey = req.headers.get('x-internal-key') || '';
    const isInternal = internalKey && internalKey === SERVICE_KEY;

    const { company_id, lead_id } = await req.json();
    console.log('Distribute leads request:', { company_id, lead_id, isInternal });

    if (!company_id) {
      return new Response(
        JSON.stringify({ error: 'company_id is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!isInternal) {
      const authHeader = req.headers.get('Authorization');
      if (!authHeader?.startsWith('Bearer ')) {
        return new Response(
          JSON.stringify({ error: 'Unauthorized' }),
          { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      const userClient = createClient(SUPABASE_URL, ANON_KEY, {
        global: { headers: { Authorization: authHeader } },
      });
      const { data: { user } } = await userClient.auth.getUser();
      if (!user) {
        return new Response(
          JSON.stringify({ error: 'Unauthorized' }),
          { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      // Master pode tudo; admin só sua própria company
      const { data: isMaster } = await supabaseClient.rpc('is_master', { _user_id: user.id });
      if (!isMaster) {
        const { data: prof } = await supabaseClient
          .from('profiles')
          .select('company_id')
          .eq('id', user.id)
          .maybeSingle();
        const { data: isAdmin } = await supabaseClient.rpc('is_company_admin', { _user_id: user.id });
        if (!isAdmin || prof?.company_id !== company_id) {
          return new Response(
            JSON.stringify({ error: 'Forbidden' }),
            { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
      }
    }

    // Get distribution settings
    const { data: settings, error: settingsError } = await supabaseClient
      .from('lead_distribution_settings')
      .select('*')
      .eq('company_id', company_id)
      .maybeSingle();

    if (settingsError) {
      console.error('Error fetching settings:', settingsError);
      return new Response(
        JSON.stringify({ error: 'Error fetching settings' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // If distributing a single lead (from webhook), check if enabled
    if (lead_id && (!settings || !settings.enabled)) {
      console.log('Distribution not enabled, skipping single lead');
      return new Response(
        JSON.stringify({ status: 'skipped', reason: 'distribution not enabled' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get active distribution users with profile info (is_online)
    const { data: activeUsers, error: usersError } = await supabaseClient
      .from('lead_distribution_users')
      .select(`
        user_id, assigned_count, max_chats, is_active,
        profile:profiles!user_id(is_online)
      `)
      .eq('company_id', company_id)
      .eq('is_active', true);

    if (usersError) {
      console.error('Error fetching users:', usersError);
      return new Response(
        JSON.stringify({ error: 'Error fetching users' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!activeUsers || activeUsers.length === 0) {
      console.log('No active users for distribution');
      return new Response(
        JSON.stringify({ status: 'skipped', reason: 'no active users' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Filter users who haven't hit their max_chats limit
    const availableUsers = activeUsers.filter(u => {
      if (u.max_chats === null || u.max_chats === undefined) return true;
      return (u.assigned_count || 0) < u.max_chats;
    });

    if (availableUsers.length === 0) {
      console.log('All users have reached their max_chats limit');
      return new Response(
        JSON.stringify({ status: 'skipped', reason: 'all users at max capacity' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Separate online and offline users
    const onlineUsers = availableUsers.filter(u => u.profile?.is_online === true);
    const offlineUsers = availableUsers.filter(u => u.profile?.is_online !== true);

    // Prioritize online users, fallback to offline
    const prioritizedUsers = onlineUsers.length > 0 ? onlineUsers : offlineUsers;

    const distributionMode = settings?.distribution_mode || 'round_robin';
    let leadsToDistribute: { id: string }[] = [];

    if (lead_id) {
      leadsToDistribute = [{ id: lead_id }];
    } else {
      const { data: unassignedLeads, error: leadsError } = await supabaseClient
        .from('leads')
        .select('id')
        .eq('company_id', company_id)
        .is('assigned_to', null);

      if (leadsError) {
        console.error('Error fetching leads:', leadsError);
        return new Response(
          JSON.stringify({ error: 'Error fetching leads' }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      leadsToDistribute = unassignedLeads || [];
    }

    console.log(`Distributing ${leadsToDistribute.length} leads among ${prioritizedUsers.length} users (mode: ${distributionMode}, online: ${onlineUsers.length}, offline: ${offlineUsers.length})`);

    let distributedCount = 0;
    const userAssignmentUpdates: Record<string, number> = {};

    // Build the pool: start with prioritized, can expand to all available if needed
    const getEligibleUser = (pool: typeof availableUsers) => {
      if (distributionMode === 'random') {
        // Filter pool for users still under max_chats considering pending updates
        const eligible = pool.filter(u => {
          if (u.max_chats === null || u.max_chats === undefined) return true;
          return (u.assigned_count || 0) + (userAssignmentUpdates[u.user_id] || 0) < u.max_chats;
        });
        if (eligible.length === 0) return null;
        return eligible[Math.floor(Math.random() * eligible.length)];
      } else {
        // Round-robin: select user with lowest count, respecting max_chats
        const eligible = pool.filter(u => {
          if (u.max_chats === null || u.max_chats === undefined) return true;
          return (u.assigned_count || 0) + (userAssignmentUpdates[u.user_id] || 0) < u.max_chats;
        });
        if (eligible.length === 0) return null;
        eligible.sort((a, b) => {
          const countA = (a.assigned_count || 0) + (userAssignmentUpdates[a.user_id] || 0);
          const countB = (b.assigned_count || 0) + (userAssignmentUpdates[b.user_id] || 0);
          return countA - countB;
        });
        return eligible[0];
      }
    };

    // Pré-carrega vínculos agente↔instância da empresa para aplicar filtro por canal
    const { data: linksAll } = await supabaseClient
      .from('instance_agents')
      .select('instance_id, user_id')
      .eq('company_id', company_id);
    const agentsByInstance = new Map<string, Set<string>>();
    (linksAll || []).forEach((l: any) => {
      if (!agentsByInstance.has(l.instance_id)) agentsByInstance.set(l.instance_id, new Set());
      agentsByInstance.get(l.instance_id)!.add(l.user_id);
    });

    const filterByInstance = async (lead: { id: string }, pool: typeof availableUsers) => {
      // Tenta achar instância de origem via última conversa do lead
      const { data: conv } = await supabaseClient
        .from('conversations')
        .select('instance_id')
        .eq('company_id', company_id)
        .eq('lead_id', lead.id)
        .order('last_message_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      const instId = conv?.instance_id || null;
      if (!instId) return pool;
      const allowed = agentsByInstance.get(instId);
      if (!allowed || allowed.size === 0) return pool; // instância "aberta"
      const filtered = pool.filter((u) => allowed.has(u.user_id));
      return filtered.length > 0 ? filtered : pool; // fallback p/ não deixar lead órfão
    };

    for (let i = 0; i < leadsToDistribute.length; i++) {
      const lead = leadsToDistribute[i];

      const channelOnline = await filterByInstance(lead, prioritizedUsers);
      const channelAll = await filterByInstance(lead, availableUsers);

      // Try online first, then all available
      let selectedUser = getEligibleUser(channelOnline);
      if (!selectedUser) {
        selectedUser = getEligibleUser(channelAll);
      }

      if (!selectedUser) {
        console.log('No more eligible users with capacity, stopping distribution');
        break;
      }

      const { error: updateError } = await supabaseClient
        .from('leads')
        .update({ assigned_to: selectedUser.user_id })
        .eq('id', lead.id);

      if (updateError) {
        console.error('Error assigning lead:', updateError);
        continue;
      }

      userAssignmentUpdates[selectedUser.user_id] = (userAssignmentUpdates[selectedUser.user_id] || 0) + 1;
      distributedCount++;
    }

    // Update assigned_count for each user
    for (const [userId, count] of Object.entries(userAssignmentUpdates)) {
      const { data: currentUser } = await supabaseClient
        .from('lead_distribution_users')
        .select('assigned_count')
        .eq('company_id', company_id)
        .eq('user_id', userId)
        .single();

      if (currentUser) {
        await supabaseClient
          .from('lead_distribution_users')
          .update({ assigned_count: (currentUser.assigned_count || 0) + count })
          .eq('company_id', company_id)
          .eq('user_id', userId);
      }
    }

    console.log(`Successfully distributed ${distributedCount} leads`);

    return new Response(
      JSON.stringify({ status: 'success', distributed: distributedCount }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Distribution error:', error);
    return new Response(
      JSON.stringify({ error: 'Internal error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
