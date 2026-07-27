
ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS asaas_customer_id text,
  ADD COLUMN IF NOT EXISTS last_payment_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_payment_amount numeric(15,2),
  ADD COLUMN IF NOT EXISTS last_payment_status text;

CREATE INDEX IF NOT EXISTS idx_leads_asaas_customer ON public.leads(company_id, asaas_customer_id) WHERE asaas_customer_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_leads_company_document ON public.leads(company_id, document) WHERE document IS NOT NULL;

CREATE OR REPLACE FUNCTION public.sync_asaas_payment_to_lead(
  _company_id uuid,
  _event text,
  _payment jsonb,
  _customer jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_lead_id uuid;
  v_doc text;
  v_asaas_customer text;
  v_pipeline uuid;
  v_stage_open uuid;
  v_stage_won uuid;
  v_stage_lost uuid;
  v_amount numeric;
  v_paid_at timestamptz;
  v_target_status lead_status;
  v_target_stage uuid;
  v_was_status lead_status;
BEGIN
  IF _company_id IS NULL OR _payment IS NULL THEN
    RETURN NULL;
  END IF;

  v_doc := regexp_replace(coalesce(_customer->>'cpfCnpj', ''), '[^0-9]', '', 'g');
  v_asaas_customer := coalesce(_payment->>'customer', _customer->>'id');
  v_amount := nullif(_payment->>'value','')::numeric;
  v_paid_at := coalesce(
    nullif(_payment->>'paymentDate','')::timestamptz,
    nullif(_payment->>'clientPaymentDate','')::timestamptz,
    now()
  );

  -- Resolve default pipeline + key stages
  SELECT id INTO v_pipeline
  FROM public.pipelines
  WHERE company_id = _company_id
  ORDER BY is_default DESC, created_at ASC
  LIMIT 1;

  IF v_pipeline IS NOT NULL THEN
    SELECT id INTO v_stage_open FROM public.pipeline_stages
      WHERE pipeline_id = v_pipeline AND stage_type = 'open' ORDER BY position ASC LIMIT 1;
    SELECT id INTO v_stage_won FROM public.pipeline_stages
      WHERE pipeline_id = v_pipeline AND stage_type = 'won' ORDER BY position ASC LIMIT 1;
    SELECT id INTO v_stage_lost FROM public.pipeline_stages
      WHERE pipeline_id = v_pipeline AND stage_type = 'lost' ORDER BY position ASC LIMIT 1;
  END IF;

  -- Find existing lead: by document (normalized) OR by asaas_customer_id
  IF v_doc <> '' THEN
    SELECT id, status INTO v_lead_id, v_was_status
    FROM public.leads
    WHERE company_id = _company_id
      AND regexp_replace(coalesce(document,''), '[^0-9]', '', 'g') = v_doc
    ORDER BY created_at DESC
    LIMIT 1;
  END IF;

  IF v_lead_id IS NULL AND v_asaas_customer IS NOT NULL THEN
    SELECT id, status INTO v_lead_id, v_was_status
    FROM public.leads
    WHERE company_id = _company_id AND asaas_customer_id = v_asaas_customer
    ORDER BY created_at DESC
    LIMIT 1;
  END IF;

  -- Create lead if missing
  IF v_lead_id IS NULL THEN
    INSERT INTO public.leads (
      company_id, pipeline_id, stage_id, name, phone, email, document,
      address, address_number, neighborhood, city, state, zip_code, country,
      asaas_customer_id, source, status
    ) VALUES (
      _company_id,
      v_pipeline,
      v_stage_open,
      coalesce(nullif(_customer->>'name',''), 'Cliente Asaas ' || coalesce(v_asaas_customer,'')),
      nullif(coalesce(_customer->>'mobilePhone', _customer->>'phone'),''),
      nullif(_customer->>'email',''),
      nullif(v_doc,''),
      nullif(_customer->>'address',''),
      nullif(_customer->>'addressNumber',''),
      nullif(_customer->>'province',''),
      nullif((_customer->'city')->>'name', ''),
      nullif((_customer->'city')->>'state', ''),
      nullif(_customer->>'postalCode',''),
      coalesce(nullif(_customer->>'country',''), 'Brasil'),
      v_asaas_customer,
      'asaas',
      'new'
    )
    RETURNING id, status INTO v_lead_id, v_was_status;
  END IF;

  -- Decide target status from event
  IF _event IN ('PAYMENT_CONFIRMED','PAYMENT_RECEIVED','PAYMENT_RECEIVED_IN_CASH','PAYMENT_ANTICIPATED') THEN
    v_target_status := 'won';
    v_target_stage := v_stage_won;
  ELSIF _event IN ('PAYMENT_REFUNDED','PAYMENT_CHARGEBACK_REQUESTED','PAYMENT_CHARGEBACK_DISPUTE','PAYMENT_DELETED') THEN
    v_target_status := 'lost';
    v_target_stage := v_stage_lost;
  ELSE
    v_target_status := NULL;
    v_target_stage := NULL;
  END IF;

  -- Always update payment snapshot + asaas_customer_id (allowed even on closed leads via document/no status change?)
  -- Closed-leads-immutable trigger blocks UPDATE on won/lost; so for those, only update if target is the same.
  IF v_was_status IN ('won','lost') AND (v_target_status IS NULL OR v_target_status <> v_was_status) THEN
    -- Skip mutation to avoid trigger error; log only
    INSERT INTO public.leads_status_change_log (lead_id, company_id, action, source, metadata)
    VALUES (
      v_lead_id, _company_id, 'asaas_event_skipped', 'asaas_webhook',
      jsonb_build_object('event', _event, 'reason', 'lead_already_closed', 'current_status', v_was_status)
    );
    RETURN v_lead_id;
  END IF;

  IF v_target_status IS NOT NULL THEN
    UPDATE public.leads SET
      status = v_target_status,
      stage_id = coalesce(v_target_stage, stage_id),
      asaas_customer_id = coalesce(asaas_customer_id, v_asaas_customer),
      last_payment_at = v_paid_at,
      last_payment_amount = v_amount,
      last_payment_status = _event,
      closed_at = v_paid_at,
      loss_reason_text = CASE WHEN v_target_status='lost' THEN 'Asaas: ' || _event ELSE loss_reason_text END,
      updated_at = now()
    WHERE id = v_lead_id;
  ELSE
    UPDATE public.leads SET
      asaas_customer_id = coalesce(asaas_customer_id, v_asaas_customer),
      last_payment_at = v_paid_at,
      last_payment_amount = v_amount,
      last_payment_status = _event,
      updated_at = now()
    WHERE id = v_lead_id;
  END IF;

  -- Log timeline event
  INSERT INTO public.leads_status_change_log (lead_id, company_id, action, source, metadata)
  VALUES (
    v_lead_id, _company_id,
    CASE
      WHEN v_target_status = 'won' THEN 'lead_won'
      WHEN v_target_status = 'lost' THEN 'lead_lost'
      ELSE 'asaas_payment_event'
    END,
    'asaas_webhook',
    jsonb_build_object(
      'event', _event,
      'asaas_payment_id', _payment->>'id',
      'asaas_customer_id', v_asaas_customer,
      'amount', v_amount,
      'billing_type', _payment->>'billingType'
    )
  );

  RETURN v_lead_id;
EXCEPTION WHEN OTHERS THEN
  -- Don't break the webhook because of lead sync issues
  RAISE WARNING 'sync_asaas_payment_to_lead failed: %', SQLERRM;
  RETURN NULL;
END;
$$;
