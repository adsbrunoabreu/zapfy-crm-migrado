import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const isEmail = (s: unknown): s is string =>
  typeof s === "string" &&
  /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(s) &&
  s.length <= 255;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "missing_auth" }, 401);

    const userClient = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const admin = createClient(SUPABASE_URL, SERVICE_KEY);

    const { data: { user }, error: userErr } = await userClient.auth.getUser();
    if (userErr || !user) return json({ error: "unauthorized" }, 401);

    const body = await req.json().catch(() => ({}));
    const memberId = body?.member_id as string | undefined;
    const newEmail = (body?.new_email as string | undefined)?.trim().toLowerCase();

    if (!memberId || !isEmail(newEmail)) {
      return json({ error: "invalid_input" }, 400);
    }

    // Caller profile
    const { data: caller } = await admin
      .from("profiles")
      .select("id, role, company_id")
      .eq("id", user.id)
      .single();
    if (!caller) return json({ error: "no_profile" }, 403);

    const { data: target } = await admin
      .from("profiles")
      .select("id, company_id, email")
      .eq("id", memberId)
      .single();
    if (!target) return json({ error: "member_not_found" }, 404);

    const isMaster = caller.role === "master";
    const isSameCompanyAdmin =
      caller.role === "admin" && caller.company_id === target.company_id;
    if (!isMaster && !isSameCompanyAdmin) return json({ error: "forbidden" }, 403);

    if (newEmail === target.email) return json({ ok: true, unchanged: true });

    // Update auth.users
    const { error: authErr } = await admin.auth.admin.updateUserById(memberId, {
      email: newEmail,
      email_confirm: true,
    });
    if (authErr) return json({ error: authErr.message }, 400);

    // Mirror em profiles
    const { error: profErr } = await admin
      .from("profiles")
      .update({ email: newEmail })
      .eq("id", memberId);
    if (profErr) return json({ error: profErr.message }, 400);

    return json({ ok: true });
  } catch (e) {
    return json({ error: (e as Error).message ?? "unknown_error" }, 500);
  }
});
