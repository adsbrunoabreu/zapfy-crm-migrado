ALTER TABLE public.webhooks
ADD COLUMN IF NOT EXISTS payload_options jsonb NOT NULL DEFAULT jsonb_build_object(
  'include_lead', true,
  'include_conversation', true,
  'include_instance', true,
  'include_media_signed_url', true,
  'include_company', true
);