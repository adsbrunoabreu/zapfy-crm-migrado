UPDATE public.system_integrations
SET value = jsonb_set(
  COALESCE(value, '{}'::jsonb),
  '{methods}',
  '{"pix": true, "credit_card": false, "boleto": false}'::jsonb,
  true
), updated_at = now()
WHERE key = 'asaas';