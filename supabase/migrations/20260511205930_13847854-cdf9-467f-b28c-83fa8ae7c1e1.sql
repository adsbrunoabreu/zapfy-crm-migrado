-- 1) Revoga execução da RPC self-cancel para qualquer cliente autenticado
REVOKE EXECUTE ON FUNCTION public.cancel_my_subscription() FROM anon, authenticated, public;

-- 2) Trigger que bloqueia cancelamento iniciado por usuário autenticado.
--    Permite somente quando:
--    - auth.uid() é NULL (cron, service role, edge function com SR key), OU
--    - o usuário é master (operação administrativa explícita).
CREATE OR REPLACE FUNCTION public.guard_subscription_cancellation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _uid uuid := auth.uid();
  _is_master boolean := false;
BEGIN
  -- Detecta tentativa de cancelamento (imediato ou agendado)
  IF (NEW.status = 'canceled' AND COALESCE(OLD.status,'') <> 'canceled')
     OR (COALESCE(NEW.cancel_at_period_end,false) = true
         AND COALESCE(OLD.cancel_at_period_end,false) = false) THEN

    -- Sem JWT = chamada interna (cron, service_role, webhook). Liberar.
    IF _uid IS NULL THEN
      RETURN NEW;
    END IF;

    -- Master pode cancelar via painel admin
    SELECT EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = _uid AND role = 'master'
    ) INTO _is_master;

    IF _is_master THEN
      RETURN NEW;
    END IF;

    RAISE EXCEPTION 'Subscription cancellation is not allowed via client API'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_subscription_cancellation ON public.subscriptions;
CREATE TRIGGER trg_guard_subscription_cancellation
BEFORE UPDATE ON public.subscriptions
FOR EACH ROW
EXECUTE FUNCTION public.guard_subscription_cancellation();