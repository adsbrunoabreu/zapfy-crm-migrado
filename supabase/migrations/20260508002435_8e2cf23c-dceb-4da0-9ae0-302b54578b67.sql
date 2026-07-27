CREATE OR REPLACE FUNCTION public.reorder_pipeline_stages(p_ids uuid[])
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company uuid;
  v_distinct_companies int;
BEGIN
  IF p_ids IS NULL OR array_length(p_ids, 1) IS NULL THEN
    RETURN;
  END IF;

  SELECT count(DISTINCT ps.pipeline_id), max(p.company_id)
    INTO v_distinct_companies, v_company
  FROM public.pipeline_stages ps
  JOIN public.pipelines p ON p.id = ps.pipeline_id
  WHERE ps.id = ANY(p_ids);

  IF v_distinct_companies <> 1 THEN
    RAISE EXCEPTION 'Etapas devem pertencer ao mesmo pipeline';
  END IF;

  IF v_company IS NULL OR NOT public.user_belongs_to_company(v_company) THEN
    RAISE EXCEPTION 'Sem permissão para reordenar etapas';
  END IF;

  UPDATE public.pipeline_stages ps
     SET position = sub.idx
    FROM (
      SELECT id, (ord - 1) AS idx
      FROM unnest(p_ids) WITH ORDINALITY AS t(id, ord)
    ) sub
   WHERE ps.id = sub.id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.reorder_pipeline_stages(uuid[]) TO authenticated;