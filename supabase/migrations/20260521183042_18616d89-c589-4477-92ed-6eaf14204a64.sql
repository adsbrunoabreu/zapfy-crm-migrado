CREATE OR REPLACE FUNCTION public.get_finance_pending_receivables()
RETURNS TABLE(pending_count integer, pending_value numeric)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company uuid;
BEGIN
  SELECT company_id INTO v_company FROM public.profiles WHERE id = auth.uid();
  IF v_company IS NULL THEN
    RETURN QUERY SELECT 0::integer, 0::numeric;
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    COUNT(*)::integer AS pending_count,
    COALESCE(SUM(GREATEST(net_amount - paid_amount, 0)), 0)::numeric AS pending_value
  FROM public.financial_entries
  WHERE company_id = v_company
    AND kind = 'receivable'
    AND status NOT IN ('paid', 'canceled', 'void');
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_finance_pending_receivables() TO authenticated;