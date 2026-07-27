
ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS trial_reminder_12h_sent_at timestamptz;

DROP FUNCTION IF EXISTS public.get_trial_reminder_targets();

CREATE FUNCTION public.get_trial_reminder_targets()
RETURNS TABLE(
  company_id uuid,
  company_name text,
  trial_ends_at timestamptz,
  hours_left numeric,
  needs_12h_reminder boolean,
  needs_6h_reminder boolean,
  needs_expired_reminder boolean
)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT
    c.id, c.name, c.trial_ends_at,
    ROUND(EXTRACT(EPOCH FROM (c.trial_ends_at - now())) / 3600.0, 2),
    (c.trial_ends_at > now() + interval '6 hours'
      AND c.trial_ends_at <= now() + interval '12 hours'
      AND c.trial_reminder_12h_sent_at IS NULL),
    (c.trial_ends_at > now()
      AND c.trial_ends_at <= now() + interval '6 hours'
      AND c.trial_reminder_6h_sent_at IS NULL),
    (c.trial_ends_at <= now() AND c.trial_expired_notified_at IS NULL)
  FROM public.companies c
  WHERE c.plan_status = 'trial'
    AND c.trial_ends_at IS NOT NULL
    AND (
      (c.trial_ends_at > now() + interval '6 hours'
        AND c.trial_ends_at <= now() + interval '12 hours'
        AND c.trial_reminder_12h_sent_at IS NULL)
      OR (c.trial_ends_at > now()
        AND c.trial_ends_at <= now() + interval '6 hours'
        AND c.trial_reminder_6h_sent_at IS NULL)
      OR (c.trial_ends_at <= now() AND c.trial_expired_notified_at IS NULL)
    )
$function$;
