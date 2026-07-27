
-- 1) Permitir edição de campos pós-venda em leads ganhos/perdidos
CREATE OR REPLACE FUNCTION public.prevent_closed_lead_edits()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
DECLARE
  v_locked_change boolean := false;
BEGIN
  -- Só interfere quando o lead permanece fechado (won/lost antes e depois).
  IF NOT (OLD.status IN ('won','lost') AND NEW.status IN ('won','lost')) THEN
    RETURN NEW;
  END IF;

  -- Lista de colunas "travadas" enquanto o lead está fechado.
  -- Qualquer alteração nelas exige reabertura. Demais colunas
  -- (payment_*, invoice_number, finance_notes, discount_*, net_value,
  --  updated_at, closed_at, etc.) ficam liberadas para o Financeiro.
  IF NEW.status         IS DISTINCT FROM OLD.status         THEN v_locked_change := true; END IF;
  IF NEW.stage_id       IS DISTINCT FROM OLD.stage_id       THEN v_locked_change := true; END IF;
  IF NEW.pipeline_id    IS DISTINCT FROM OLD.pipeline_id    THEN v_locked_change := true; END IF;
  IF NEW.assigned_to    IS DISTINCT FROM OLD.assigned_to    THEN v_locked_change := true; END IF;
  IF NEW.contact_id     IS DISTINCT FROM OLD.contact_id     THEN v_locked_change := true; END IF;
  IF NEW.name           IS DISTINCT FROM OLD.name           THEN v_locked_change := true; END IF;
  IF NEW.value          IS DISTINCT FROM OLD.value          THEN v_locked_change := true; END IF;

  IF v_locked_change THEN
    RAISE EXCEPTION 'Lead % está marcado como % e precisa ser reaberto antes de alterar etapa, valor, responsável, contato ou nome.',
      OLD.id, OLD.status
      USING ERRCODE = 'check_violation',
            HINT = 'Reabra o lead para editá-lo novamente. Campos do Financeiro (pagamento, NF, desconto, observações) podem ser alterados sem reabrir.';
  END IF;

  RETURN NEW;
END;
$function$;

-- 2) Auto-baixar o "A receber" quando o Financeiro confirma o pagamento
CREATE OR REPLACE FUNCTION public.tg_lead_payment_confirmed_marks_receivable()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  -- Confirmação: NULL -> not null  => marcar recebível como pago
  IF NEW.payment_confirmed_at IS NOT NULL
     AND (OLD.payment_confirmed_at IS NULL
          OR OLD.payment_confirmed_at IS DISTINCT FROM NEW.payment_confirmed_at) THEN
    UPDATE public.financial_entries
       SET status              = 'paid',
           paid_at             = NEW.payment_confirmed_at::date,
           paid_amount         = COALESCE(NEW.net_value, NEW.value, amount),
           payment_method      = COALESCE(NEW.payment_method, payment_method),
           paid_by             = COALESCE(NEW.payment_confirmed_by, paid_by),
           external_payment_id = COALESCE(NEW.payment_reference, external_payment_id),
           updated_at          = now()
     WHERE lead_id = NEW.id
       AND kind = 'receivable'
       AND status NOT IN ('paid','canceled');

  -- Desconfirmação: not null -> NULL  => reverter para rascunho
  ELSIF NEW.payment_confirmed_at IS NULL
        AND OLD.payment_confirmed_at IS NOT NULL THEN
    UPDATE public.financial_entries
       SET status      = 'draft',
           paid_at     = NULL,
           paid_amount = NULL,
           paid_by     = NULL,
           updated_at  = now()
     WHERE lead_id = NEW.id
       AND kind = 'receivable'
       AND status = 'paid';
  END IF;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_lead_payment_confirmed_marks_receivable ON public.leads;
CREATE TRIGGER trg_lead_payment_confirmed_marks_receivable
AFTER UPDATE OF payment_confirmed_at ON public.leads
FOR EACH ROW
EXECUTE FUNCTION public.tg_lead_payment_confirmed_marks_receivable();
