import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

// Trigger → tabela (necessário para ALTER TRIGGER ... ON <table>)
const TRIGGER_TABLE: Record<string, string> = {
  trg_enqueue_auto_reply: "chat_messages",
  trg_lead_seq_after_insert: "leads",
  trg_lead_seq_after_stage: "leads",
  trg_seq_cancel_on_reply: "chat_messages",
  trg_seq_cancel_on_status: "leads",
  trg_webhook_lead_created: "leads",
  trg_webhook_lead_updated: "leads",
  trg_webhook_lead_stage_changed: "leads",
  trg_webhook_chat_message: "chat_messages",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    // Auth: somente Master
    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const userClient = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const admin = createClient(SUPABASE_URL, SERVICE_ROLE);

    const { data: userRes, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userRes?.user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const userId = userRes.user.id;
    const userEmail = userRes.user.email;
    const { data: isMasterRes } = await admin.rpc("is_master", { _user_id: userId });
    if (!isMasterRes) {
      return new Response(JSON.stringify({ error: "forbidden — master only" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json();
    const triggers: string[] = Array.isArray(body?.triggers) ? body.triggers : [];
    const action: string = body?.action;
    if (action !== "enable" && action !== "disable") {
      return new Response(JSON.stringify({ error: "action must be enable|disable" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const verb = action === "enable" ? "ENABLE" : "DISABLE";

    const toggled: string[] = [];
    const skipped: string[] = [];
    for (const t of triggers) {
      const table = TRIGGER_TABLE[t];
      if (!table) {
        skipped.push(t);
        continue;
      }
      const sql = `ALTER TABLE public.${table} ${verb} TRIGGER ${t};`;
      const { error } = await admin.rpc("exec_admin_sql", { sql });
      if (error) {
        skipped.push(t);
        console.error("toggle failed", t, error.message);
        continue;
      }
      toggled.push(t);
    }

    await admin.from("system_logs").insert({
      source: "toggle_triggers",
      level: "warn",
      event: `triggers_${action}d`,
      message: `${verb} ${toggled.length} trigger(s)`,
      metadata: { toggled, skipped, action, by: userEmail ?? userId },
    });

    return new Response(JSON.stringify({ ok: true, toggled, skipped, action }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    console.error("toggle-triggers error", e);
    return new Response(JSON.stringify({ error: e?.message ?? String(e) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
