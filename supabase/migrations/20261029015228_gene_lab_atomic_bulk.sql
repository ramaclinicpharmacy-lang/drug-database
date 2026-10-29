BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

CREATE OR REPLACE FUNCTION public.save_gene_lab_links(
    p_test_name text,
    p_generic_codes text[],
    p_new_description text,
    p_replace_descriptions boolean,
    p_expected_rows jsonb
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
SET lock_timeout = '5s'
AS $function$
DECLARE
    v_name text := btrim(p_test_name);
    v_codes text[];
    v_actual jsonb;
    v_expected jsonb;
    v_saved_codes text[];
    v_added integer;
    v_removed integer;
    v_updated integer := 0;
    v_update_expected integer;
BEGIN
    IF v_name IS NULL OR v_name = '' OR p_generic_codes IS NULL
       OR p_replace_descriptions IS NULL OR p_expected_rows IS NULL
       OR jsonb_typeof(p_expected_rows) <> 'array' THEN
        RAISE EXCEPTION 'Name, explicit selection, description mode and loaded snapshot are required'
            USING ERRCODE = '22023';
    END IF;
    IF EXISTS (SELECT 1 FROM unnest(p_generic_codes) AS c(code) WHERE c.code IS NULL OR btrim(c.code) = '') THEN
        RAISE EXCEPTION 'Generic codes must not be blank' USING ERRCODE = '22023';
    END IF;
    SELECT coalesce(array_agg(DISTINCT c.code ORDER BY c.code), ARRAY[]::text[])
    INTO v_codes FROM unnest(p_generic_codes) AS c(code);
    SELECT coalesce(jsonb_agg(jsonb_build_object('id', e.id, 'generic_code', e.generic_code, 'description', e.description) ORDER BY e.id), '[]'::jsonb)
    INTO v_expected FROM jsonb_to_recordset(p_expected_rows) AS e(id bigint, generic_code text, description text);

    -- Also excludes single-row editors, which do not participate in advisory
    -- locks. Held only during this short database operation; public reads work.
    LOCK TABLE public.generic_gene_lab IN SHARE ROW EXCLUSIVE MODE;
    SELECT coalesce(jsonb_agg(jsonb_build_object('id', g.id, 'generic_code', g.generic_code, 'description', g.description) ORDER BY g.id), '[]'::jsonb)
    INTO v_actual FROM public.generic_gene_lab AS g WHERE g.test_name = v_name;
    IF v_actual IS DISTINCT FROM v_expected THEN
        RAISE EXCEPTION 'Gene/Lab links changed since loading. Reload before saving.' USING ERRCODE = '40001';
    END IF;

    DELETE FROM public.generic_gene_lab AS g
    WHERE g.test_name = v_name AND NOT (g.generic_code = ANY(v_codes));
    GET DIAGNOSTICS v_removed = ROW_COUNT;

    IF p_replace_descriptions THEN
        SELECT count(*) INTO v_update_expected FROM public.generic_gene_lab AS g
        WHERE g.test_name = v_name AND g.generic_code = ANY(v_codes)
          AND g.description IS DISTINCT FROM p_new_description;
        UPDATE public.generic_gene_lab AS g SET description = p_new_description
        WHERE g.test_name = v_name AND g.generic_code = ANY(v_codes)
          AND g.description IS DISTINCT FROM p_new_description;
        GET DIAGNOSTICS v_updated = ROW_COUNT;
        IF v_updated <> v_update_expected THEN
            RAISE EXCEPTION 'Descriptions could not all be updated' USING ERRCODE = '42501';
        END IF;
    END IF;

    -- Retained links keep IDs, timestamps and descriptions by default. There is
    -- deliberately no delete/reinsert of those links, even for legacy duplicates.
    INSERT INTO public.generic_gene_lab (generic_code, test_name, description)
    SELECT c.code, v_name, p_new_description FROM unnest(v_codes) AS c(code)
    WHERE NOT EXISTS (SELECT 1 FROM public.generic_gene_lab AS g WHERE g.test_name = v_name AND g.generic_code = c.code);
    GET DIAGNOSTICS v_added = ROW_COUNT;

    -- A filtered RLS DELETE must not silently leave deselected links behind.
    SELECT coalesce(array_agg(DISTINCT g.generic_code ORDER BY g.generic_code), ARRAY[]::text[])
    INTO v_saved_codes FROM public.generic_gene_lab AS g WHERE g.test_name = v_name;
    IF v_saved_codes IS DISTINCT FROM v_codes THEN
        RAISE EXCEPTION 'Gene/Lab selection could not be fully saved' USING ERRCODE = '42501';
    END IF;
    RETURN jsonb_build_object('selected_count', cardinality(v_codes), 'added_count', v_added,
        'removed_count', v_removed, 'updated_count', v_updated);
END;
$function$;

REVOKE ALL ON FUNCTION public.save_gene_lab_links(text,text[],text,boolean,jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.save_gene_lab_links(text,text[],text,boolean,jsonb) TO authenticated;
COMMENT ON FUNCTION public.save_gene_lab_links(text,text[],text,boolean,jsonb) IS
'Atomically reconcile one Gene/Lab selection against a loaded snapshot. Preserve retained descriptions unless explicitly replaced; invoker RLS applies.';
NOTIFY pgrst, 'reload schema';
COMMIT;
