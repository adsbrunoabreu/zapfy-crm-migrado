// Automation Control — Master-only edge function
// Enables/disables Postgres triggers, schedules/unschedules cron jobs,
// runs manual dispatches and exposes status.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const CRON_SECRET = Deno.env.get("CRON_SECRET") || SERVICE_ROLE;

// Known triggers (slug -> sql identifiers)
const TRIGGER_GROUPS: Record<string, { table: string; trigger: string }[]> = {
  auto_reply: [{ table: "chat_messages", trigger: "trg_enqueue_auto_reply" }],
  sequences: [
    { table: "leads", trigger: "trg_lead_seq_after_insert" },
    { table: "leads", trigger: "trg_lead_seq_after_stage" },
    { table: "chat_messages", trigger: "trg_seq_cancel_on_reply" },
    { table: "leads", trigger: "trg_seq_cancel_on_status" },
  ],
  webhooks: [
    { table: "leads", trigger: "trg_webhook_lead_created" },
    { table: "leads", trigger: "trg_webhook_lead_updated" },
    { table: "leads", trigger: "trg_webhook_lead_stage_changed" },
    { table: "chat_messages", trigger: "trg_webhook_chat_message" },
  ],
  lead_distribution: [{ table: "leads", trigger: "trg_distribute_lead" }],
};

// Known cron jobs (slug -> {jobname, schedule, function})
const CRON_JOBS: Record<string, { jobname: string; schedule: string; fn: string }> = {
  process_attendance_queue: {
    jobname: "process-attendance-queue-every-minute",
    schedule: "* * * * *",
    fn: "process-attendance-queue",
  },
  process_scheduled_messages: {
    jobname: "process-scheduled-messages-every-minute",
    schedule: "* * * * *",
    fn: "process-scheduled-messages",
  },
  process_sequences: {
    jobname: "process-sequence-enrollments-every-minute",
    schedule: "* * * * *",
    fn: "process-sequence-enrollments",
  },
  monitor_instances: {
    jobname: "monitor-instance-health-every-minute",
    schedule: "* * * * *",
    fn: "monitor-instance-health",
  },
  auto_reconnect: {
    jobname: "auto-reconnect-instances-every-minute",
    schedule: "* * * * *",
    fn: "auto-reconnect-instances",
  },
};

async function execSql(admin: any, sql: string) {
  const { data, error } = await admin.rpc("exec_admin_sql", { sql });
  if (error) throw error;
  return data;
}

async function isMaster(supabase: any, userId: string) {
  const { data, error } = await supabase.rpc("is_master", { _user_id: userId });
  if (error) return false;
  return !!data;
}

async function logAction(admin: any, level: string, event: string, message: string, metadata: any) {
  await admin.from("system_logs").insert({
    source: "automation_control",
    level,
    event,
    message,
    metadata,
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    const userClient = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const admin = createClient(SUPABASE_URL, SERVICE_ROLE);

    const { data: userRes } = await userClient.auth.getUser();
    const user = userRes?.user;
    if (!user) {
      return new Response(JSON.stringify({ error: "unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!(await isMaster(admin, user.id))) {
      return new Response(JSON.stringify({ error: "forbidden — master only" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json().catch(() => ({}));
    const action = body.action as string;

    // STATUS
    if (action === "status") {
      const triggerStatus: Record<string, boolean> = {};
      for (const [slug, items] of Object.entries(TRIGGER_GROUPS)) {
        const conds = items.map((i) => `(c.relname='${i.table}' AND t.tgname='${i.trigger}')`).join(" OR ");
        const sql = `SELECT bool_and((t.tgenabled <> 'D')) AS enabled
          FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid
          WHERE NOT t.tgisinternal AND (${conds});`;
        const r = await execSql(admin, sql);
        triggerStatus[slug] = !!r?.[0]?.enabled;
      }
      const cronList = await execSql(
        admin,
        `SELECT jobname, schedule, active FROM cron.job ORDER BY jobname;`
      );
      const cronStatus: Record<string, boolean> = {};
      for (const [slug, j] of Object.entries(CRON_JOBS)) {
        cronStatus[slug] = !!cronList?.find((row: any) => row.jobname === j.jobname && row.active);
      }
      const queue = await execSql(
        admin,
        `SELECT
          COUNT(*) FILTER (WHERE status='pending') AS pending,
          COUNT(*) FILTER (WHERE status='processing') AS processing,
          COUNT(*) FILTER (WHERE status='failed') AS failed,
          COUNT(*) FILTER (WHERE status='done' AND processed_at > NOW() - INTERVAL '24 hours') AS done_24h
        FROM attendance_auto_message_queue;`
      );
      return new Response(
        JSON.stringify({ triggers: triggerStatus, crons: cronStatus, queue: queue?.[0] ?? {}, allCron: cronList }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // TOGGLE TRIGGERS
    if (action === "toggle_triggers") {
      const slugs: string[] = body.slugs ?? [];
      const enable: boolean = !!body.enable;
      const verb = enable ? "ENABLE" : "DISABLE";
      const applied: string[] = [];
      for (const slug of slugs) {
        const items = TRIGGER_GROUPS[slug];
        if (!items) continue;
        for (const it of items) {
          await execSql(admin, `ALTER TABLE public.${it.table} ${verb} TRIGGER ${it.trigger};`);
          applied.push(`${it.table}.${it.trigger}`);
        }
      }
      await logAction(admin, "warn", "triggers_toggled", `${verb} triggers`, {
        user: user.email, slugs, applied,
      });
      return new Response(JSON.stringify({ ok: true, applied }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // TOGGLE CRON
    if (action === "toggle_crons") {
      const slugs: string[] = body.slugs ?? [];
      const enable: boolean = !!body.enable;
      const applied: string[] = [];
      for (const slug of slugs) {
        const j = CRON_JOBS[slug];
        if (!j) continue;
        if (enable) {
          // unschedule duplicates first
          await execSql(
            admin,
            `SELECT cron.unschedule(jobid) FROM cron.job WHERE jobname = '${j.jobname}';`
          );
          const url = `${SUPABASE_URL}/functions/v1/${j.fn}`;
          const headersJson = JSON.stringify({ "Content-Type": "application/json", "x-internal-key": CRON_SECRET });
          const cmd = `select net.http_post(url:='${url}', headers:='${headersJson.replace(/'/g, "''")}'::jsonb, body:='{}'::jsonb);`;
          await execSql(
            admin,
            `SELECT cron.schedule('${j.jobname}', '${j.schedule}', $cron$${cmd}$cron$);`
          );
        } else {
          await execSql(
            admin,
            `SELECT cron.unschedule(jobid) FROM cron.job WHERE jobname = '${j.jobname}';`
          );
        }
        applied.push(j.jobname);
      }
      await logAction(admin, "warn", "crons_toggled", `${enable ? "ENABLE" : "DISABLE"} crons`, {
        user: user.email, slugs, applied,
      });
      return new Response(JSON.stringify({ ok: true, applied }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // MANUAL DISPATCH — invokes the underlying edge function once
    if (action === "manual_dispatch") {
      const slug = body.cron_slug as string;
      const j = CRON_JOBS[slug];
      if (!j) {
        return new Response(JSON.stringify({ error: "unknown cron_slug" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const r = await fetch(`${SUPABASE_URL}/functions/v1/${j.fn}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-internal-key": CRON_SECRET },
        body: JSON.stringify({ manual: true, by: user.email }),
      });
      const text = await r.text();
      await logAction(admin, "info", "manual_dispatch", `dispatched ${j.fn}`, {
        user: user.email, status: r.status, response: text.slice(0, 500),
      });
      return new Response(JSON.stringify({ ok: r.ok, status: r.status, response: text.slice(0, 1000) }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: "unknown action" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    console.error("automation-control error", e);
    return new Response(JSON.stringify({ error: e?.message ?? String(e) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
