
CREATE OR REPLACE FUNCTION public.lead_is_closed(_status lead_status, _stage_type text)
RETURNS boolean LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT public.lead_is_closed(_status::text, _stage_type);
$$;

CREATE OR REPLACE FUNCTION public.lead_is_won(_status lead_status, _stage_type text)
RETURNS boolean LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT public.lead_is_won(_status::text, _stage_type);
$$;

CREATE OR REPLACE FUNCTION public.lead_is_lost(_status lead_status, _stage_type text)
RETURNS boolean LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT public.lead_is_lost(_status::text, _stage_type);
$$;
