// Returns public tracking config for the front-end (no secrets).
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.74.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
  const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const admin = createClient(SUPABASE_URL, SERVICE_ROLE);

  const { data } = await admin.from('system_integrations').select('value').eq('key', 'tracking').maybeSingle();
  const v = (data?.value as any) || {};
  const out = {
    enabled: !!v.enabled,
    meta_pixel_id: v.meta_pixel_id || '',
    gtm_id: v.gtm_id || '',
    google_ads_id: v.google_ads_id || '',
    google_ads_conversion_label: v.google_ads_conversion_label || '',
  };
  return new Response(JSON.stringify(out), {
    status: 200,
    headers: { ...corsHeaders, 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=60' },
  });
});
