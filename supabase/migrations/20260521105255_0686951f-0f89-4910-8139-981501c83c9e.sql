
-- 1) link approvals to a specific procedure when item-level
ALTER TABLE public.lead_discount_approvals
  ADD COLUMN IF NOT EXISTS lead_procedure_id uuid NULL;

CREATE INDEX IF NOT EXISTS idx_lda_procedure
  ON public.lead_discount_approvals(lead_procedure_id);

-- 2) helper: actor name from profiles
CREATE OR REPLACE FUNCTION public.fin_actor_name(_uid uuid)
RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, auth
AS $$
  SELECT COALESCE(p.full_name, p.email, u.email, 'Sistema')
    FROM auth.users u
    LEFT JOIN public.profiles p ON p.id = u.id
   WHERE u.id = _uid
   LIMIT 1
$$;

-- 3) Item-level discount release with password
CREATE OR REPLACE FUNCTION public.release_lead_procedure_discount(
  _proc_id uuid,
  _discount_pct numeric DEFAULT NULL,
  _discount_amount numeric DEFAULT NULL,
  _reason text DEFAULT NULL,
  _password text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, auth, extensions
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_proc record;
  v_lead record;
  v_pwd_ok boolean;
  v_actor text;
  v_proc_name text;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'unauthorized'; END IF;

  SELECT lp.id, lp.lead_id, lp.company_id, lp.medical_procedure_id,
         lp.price_snapshot, lp.quantity, lp.discount_pct, lp.discount_amount
    INTO v_proc
    FROM public.lead_procedures lp
   WHERE lp.id = _proc_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'item_not_found'; END IF;

  SELECT id, company_id, status INTO v_lead FROM public.leads WHERE id = v_proc.lead_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'lead_not_found'; END IF;

  IF NOT public.has_financial_access(v_lead.company_id) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  IF v_lead.status IN ('won','lost') THEN
    RAISE EXCEPTION 'ficha_fechada';
  END IF;

  SELECT (u.encrypted_password = extensions.crypt(_password, u.encrypted_password))
    INTO v_pwd_ok
    FROM auth.users u WHERE u.id = v_user;
  IF NOT COALESCE(v_pwd_ok, false) THEN
    RAISE EXCEPTION 'senha_invalida';
  END IF;

  IF _discount_pct IS NOT NULL AND (_discount_pct < 0 OR _discount_pct > 100) THEN
    RAISE EXCEPTION 'desconto_invalido';
  END IF;
  IF _discount_amount IS NOT NULL AND _discount_amount < 0 THEN
    RAISE EXCEPTION 'desconto_invalido';
  END IF;

  UPDATE public.lead_procedures
     SET discount_pct = _discount_pct,
         discount_amount = _discount_amount
   WHERE id = _proc_id;

  INSERT INTO public.lead_discount_approvals(
    company_id, lead_id, lead_procedure_id, requested_by, approved_by,
    discount_pct, discount_amount, previous_pct, previous_amount, reason
  ) VALUES (
    v_proc.company_id, v_proc.lead_id, _proc_id, v_user, v_user,
    _discount_pct, _discount_amount, v_proc.discount_pct, v_proc.discount_amount, _reason
  );

  SELECT name INTO v_proc_name FROM public.medical_procedures WHERE id = v_proc.medical_procedure_id;
  v_actor := public.fin_actor_name(v_user);

  INSERT INTO public.lead_history(company_id, lead_id, event_type, actor_user_id, actor_name, payload)
  VALUES (
    v_proc.company_id, v_proc.lead_id, 'discount_item_released', v_user, v_actor,
    jsonb_build_object(
      'procedure_id', v_proc.medical_procedure_id,
      'procedure_name', COALESCE(v_proc_name, '—'),
      'previous_pct', v_proc.discount_pct,
      'previous_amount', v_proc.discount_amount,
      'new_pct', _discount_pct,
      'new_amount', _discount_amount,
      'reason', _reason
    )
  );

  RETURN jsonb_build_object('ok', true);
END $$;

-- 4) Replace release_lead_discount to also log into lead_history
CREATE OR REPLACE FUNCTION public.release_lead_discount(
  _lead_id uuid,
  _discount_pct numeric DEFAULT NULL,
  _discount_amount numeric DEFAULT NULL,
  _reason text DEFAULT NULL,
  _password text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, auth, extensions
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_lead record;
  v_pwd_ok boolean;
  v_actor text;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'unauthorized'; END IF;

  SELECT id, company_id, value, status, discount_pct, discount_amount
    INTO v_lead FROM public.leads WHERE id = _lead_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'lead_not_found'; END IF;

  IF NOT public.has_financial_access(v_lead.company_id) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  IF v_lead.status IN ('won','lost') THEN
    RAISE EXCEPTION 'ficha_fechada';
  END IF;

  SELECT (u.encrypted_password = extensions.crypt(_password, u.encrypted_password))
    INTO v_pwd_ok
    FROM auth.users u WHERE u.id = v_user;
  IF NOT COALESCE(v_pwd_ok, false) THEN
    RAISE EXCEPTION 'senha_invalida';
  END IF;

  IF _discount_pct IS NOT NULL AND (_discount_pct < 0 OR _discount_pct > 100) THEN
    RAISE EXCEPTION 'desconto_invalido';
  END IF;
  IF _discount_amount IS NOT NULL AND _discount_amount < 0 THEN
    RAISE EXCEPTION 'desconto_invalido';
  END IF;

  UPDATE public.leads
    SET discount_pct = _discount_pct,
        discount_amount = _discount_amount,
        discount_approved_by = v_user,
        discount_approved_at = now(),
        updated_at = now()
   WHERE id = _lead_id;

  INSERT INTO public.lead_discount_approvals(
    company_id, lead_id, requested_by, approved_by,
    discount_pct, discount_amount, previous_pct, previous_amount, reason
  ) VALUES (
    v_lead.company_id, _lead_id, v_user, v_user,
    _discount_pct, _discount_amount, v_lead.discount_pct, v_lead.discount_amount, _reason
  );

  v_actor := public.fin_actor_name(v_user);
  INSERT INTO public.lead_history(company_id, lead_id, event_type, actor_user_id, actor_name, payload)
  VALUES (
    v_lead.company_id, _lead_id, 'discount_released', v_user, v_actor,
    jsonb_build_object(
      'previous_pct', v_lead.discount_pct,
      'previous_amount', v_lead.discount_amount,
      'new_pct', _discount_pct,
      'new_amount', _discount_amount,
      'reason', _reason
    )
  );

  RETURN jsonb_build_object('ok', true);
END $$;

-- 5) Finance audit trigger on leads
CREATE OR REPLACE FUNCTION public.leads_finance_audit_tg()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_actor text;
  v_changes jsonb := '{}'::jsonb;
  v_field text;
  v_pairs jsonb := '[]'::jsonb;
BEGIN
  IF NEW.value IS DISTINCT FROM OLD.value THEN
    v_pairs := v_pairs || jsonb_build_object('field','value','old',OLD.value,'new',NEW.value);
  END IF;
  IF NEW.payment_method IS DISTINCT FROM OLD.payment_method THEN
    v_pairs := v_pairs || jsonb_build_object('field','payment_method','old',OLD.payment_method,'new',NEW.payment_method);
  END IF;
  IF NEW.payment_installments IS DISTINCT FROM OLD.payment_installments THEN
    v_pairs := v_pairs || jsonb_build_object('field','payment_installments','old',OLD.payment_installments,'new',NEW.payment_installments);
  END IF;
  IF NEW.payment_reference IS DISTINCT FROM OLD.payment_reference THEN
    v_pairs := v_pairs || jsonb_build_object('field','payment_reference','old',OLD.payment_reference,'new',NEW.payment_reference);
  END IF;
  IF NEW.invoice_number IS DISTINCT FROM OLD.invoice_number THEN
    v_pairs := v_pairs || jsonb_build_object('field','invoice_number','old',OLD.invoice_number,'new',NEW.invoice_number);
  END IF;
  IF NEW.finance_notes IS DISTINCT FROM OLD.finance_notes THEN
    v_pairs := v_pairs || jsonb_build_object('field','finance_notes','old',OLD.finance_notes,'new',NEW.finance_notes);
  END IF;
  IF NEW.payment_confirmed_at IS DISTINCT FROM OLD.payment_confirmed_at THEN
    v_pairs := v_pairs || jsonb_build_object(
      'field', CASE WHEN NEW.payment_confirmed_at IS NULL THEN 'payment_undone' ELSE 'payment_confirmed' END,
      'old', OLD.payment_confirmed_at, 'new', NEW.payment_confirmed_at
    );
  END IF;

  IF jsonb_array_length(v_pairs) = 0 THEN
    RETURN NEW;
  END IF;

  v_actor := public.fin_actor_name(v_user);

  INSERT INTO public.lead_history(company_id, lead_id, event_type, actor_user_id, actor_name, payload)
  VALUES (NEW.company_id, NEW.id, 'finance_update', v_user, v_actor, jsonb_build_object('changes', v_pairs));

  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_leads_finance_audit ON public.leads;
CREATE TRIGGER trg_leads_finance_audit
AFTER UPDATE OF value, payment_method, payment_installments, payment_reference,
                invoice_number, finance_notes, payment_confirmed_at
ON public.leads
FOR EACH ROW EXECUTE FUNCTION public.leads_finance_audit_tg();

-- 6) Attachment audit
CREATE OR REPLACE FUNCTION public.lead_attachments_audit_tg()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_actor text := public.fin_actor_name(v_user);
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.lead_history(company_id, lead_id, event_type, actor_user_id, actor_name, payload)
    VALUES (NEW.company_id, NEW.lead_id, 'attachment_added', v_user, v_actor,
      jsonb_build_object('kind', NEW.kind, 'file_name', NEW.file_name));
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    INSERT INTO public.lead_history(company_id, lead_id, event_type, actor_user_id, actor_name, payload)
    VALUES (OLD.company_id, OLD.lead_id, 'attachment_removed', v_user, v_actor,
      jsonb_build_object('kind', OLD.kind, 'file_name', OLD.file_name));
    RETURN OLD;
  END IF;
  RETURN NULL;
END $$;

DROP TRIGGER IF EXISTS trg_lead_attachments_audit ON public.lead_payment_attachments;
CREATE TRIGGER trg_lead_attachments_audit
AFTER INSERT OR DELETE ON public.lead_payment_attachments
FOR EACH ROW EXECUTE FUNCTION public.lead_attachments_audit_tg();
