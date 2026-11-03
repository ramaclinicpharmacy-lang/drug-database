BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

CREATE OR REPLACE FUNCTION public.save_generic_with_pharm(
    p_generic_code text, p_is_edit boolean, p_generic_name text,
    p_special_note text, p_generic_type text,
    p_needs_renal_adj boolean, p_needs_hepatic_adj boolean,
    p_class_names text[], p_expected_classes text[]
) RETURNS text
LANGUAGE plpgsql SECURITY INVOKER
-- Existing audit triggers use an unqualified audit_logs table reference.
SET search_path = public, pg_temp
SET lock_timeout = '5s'
AS $function$
DECLARE
    v_classes text[];
    v_expected text[];
    v_actual text[];
    v_code text;
BEGIN
    IF p_generic_code IS NULL OR btrim(p_generic_code) = ''
       OR p_generic_name IS NULL OR btrim(p_generic_name) = ''
       OR p_is_edit IS NULL OR p_needs_renal_adj IS NULL OR p_needs_hepatic_adj IS NULL
       OR p_class_names IS NULL OR p_expected_classes IS NULL THEN
        RAISE EXCEPTION 'Code, name, mode, alert flags and explicit class selections are required' USING ERRCODE = '22023';
    END IF;
    IF EXISTS (SELECT 1 FROM unnest(p_class_names || p_expected_classes) AS x(name) WHERE x.name IS NULL OR btrim(x.name) = '') THEN
        RAISE EXCEPTION 'Class names must not be blank' USING ERRCODE = '22023';
    END IF;
    SELECT coalesce(array_agg(DISTINCT x.name ORDER BY x.name),ARRAY[]::text[]) INTO v_classes FROM unnest(p_class_names) AS x(name);
    SELECT coalesce(array_agg(DISTINCT x.name ORDER BY x.name),ARRAY[]::text[]) INTO v_expected FROM unnest(p_expected_classes) AS x(name);
    -- Both RPCs lock the same mapping table first. This also excludes legacy
    -- direct writes, not just clients participating in an advisory-lock scheme.
    LOCK TABLE public.generic_pharm_mapping IN SHARE ROW EXCLUSIVE MODE;
    IF NOT p_is_edit AND EXISTS (SELECT 1 FROM public.generics WHERE generic_code = p_generic_code) THEN
        RAISE EXCEPTION 'Generic code already exists; edit the existing generic' USING ERRCODE = '23505';
    END IF;
    SELECT coalesce(array_agg(class_name ORDER BY class_name),ARRAY[]::text[]) INTO v_actual
    FROM public.generic_pharm_mapping WHERE generic_code = p_generic_code;
    IF v_actual IS DISTINCT FROM v_expected THEN
        RAISE EXCEPTION 'Pharmacology links changed since loading; reload before saving' USING ERRCODE = '40001';
    END IF;
    IF p_is_edit THEN
        UPDATE public.generics SET generic_name = p_generic_name, special_note = p_special_note,
            generic_type = p_generic_type, needs_renal_adj = p_needs_renal_adj, needs_hepatic_adj = p_needs_hepatic_adj
        WHERE generic_code = p_generic_code RETURNING generic_code INTO v_code;
        IF NOT FOUND THEN
            RAISE EXCEPTION 'Generic no longer exists or is not writable; reload the list' USING ERRCODE = 'P0002';
        END IF;
    ELSE
        INSERT INTO public.generics (generic_code,generic_name,special_note,generic_type,needs_renal_adj,needs_hepatic_adj)
        VALUES (p_generic_code,p_generic_name,p_special_note,p_generic_type,p_needs_renal_adj,p_needs_hepatic_adj)
        RETURNING generic_code INTO v_code;
    END IF;
    DELETE FROM public.generic_pharm_mapping WHERE generic_code = v_code AND NOT (class_name = ANY(v_classes));
    INSERT INTO public.generic_pharm_mapping (generic_code,class_name)
    SELECT v_code,x.name FROM unnest(v_classes) AS x(name)
    WHERE NOT EXISTS (SELECT 1 FROM public.generic_pharm_mapping m WHERE m.generic_code = v_code AND m.class_name = x.name);
    SELECT coalesce(array_agg(class_name ORDER BY class_name),ARRAY[]::text[]) INTO v_actual
    FROM public.generic_pharm_mapping WHERE generic_code = v_code;
    IF v_actual IS DISTINCT FROM v_classes THEN
        RAISE EXCEPTION 'Class selection could not be fully saved' USING ERRCODE = '42501';
    END IF;
    RETURN v_code;
END;
$function$;

CREATE OR REPLACE FUNCTION public.save_pharm_class_links(
    p_class_name text, p_generic_codes text[], p_expected_codes text[]
) RETURNS integer
LANGUAGE plpgsql SECURITY INVOKER
SET search_path = public, pg_temp
SET lock_timeout = '5s'
AS $function$
DECLARE
    v_codes text[];
    v_expected text[];
    v_actual text[];
BEGIN
    IF p_class_name IS NULL OR btrim(p_class_name) = '' OR p_generic_codes IS NULL OR p_expected_codes IS NULL THEN
        RAISE EXCEPTION 'Class name, explicit selection and loaded snapshot are required' USING ERRCODE = '22023';
    END IF;
    IF EXISTS (SELECT 1 FROM unnest(p_generic_codes || p_expected_codes) AS x(code) WHERE x.code IS NULL OR btrim(x.code) = '') THEN
        RAISE EXCEPTION 'Generic codes must not be blank' USING ERRCODE = '22023';
    END IF;
    SELECT coalesce(array_agg(DISTINCT x.code ORDER BY x.code),ARRAY[]::text[]) INTO v_codes FROM unnest(p_generic_codes) AS x(code);
    SELECT coalesce(array_agg(DISTINCT x.code ORDER BY x.code),ARRAY[]::text[]) INTO v_expected FROM unnest(p_expected_codes) AS x(code);
    LOCK TABLE public.generic_pharm_mapping IN SHARE ROW EXCLUSIVE MODE;
    IF NOT EXISTS (SELECT 1 FROM public.pharm_classes WHERE class_name = p_class_name) THEN
        RAISE EXCEPTION 'Class no longer exists; reload the list' USING ERRCODE = 'P0002';
    END IF;
    SELECT coalesce(array_agg(generic_code ORDER BY generic_code),ARRAY[]::text[]) INTO v_actual
    FROM public.generic_pharm_mapping WHERE class_name = p_class_name;
    IF v_actual IS DISTINCT FROM v_expected THEN
        RAISE EXCEPTION 'Class membership changed since loading; reload before saving' USING ERRCODE = '40001';
    END IF;
    DELETE FROM public.generic_pharm_mapping WHERE class_name = p_class_name AND NOT (generic_code = ANY(v_codes));
    INSERT INTO public.generic_pharm_mapping (generic_code,class_name)
    SELECT x.code,p_class_name FROM unnest(v_codes) AS x(code)
    WHERE NOT EXISTS (SELECT 1 FROM public.generic_pharm_mapping m WHERE m.generic_code = x.code AND m.class_name = p_class_name);
    SELECT coalesce(array_agg(generic_code ORDER BY generic_code),ARRAY[]::text[]) INTO v_actual
    FROM public.generic_pharm_mapping WHERE class_name = p_class_name;
    IF v_actual IS DISTINCT FROM v_codes THEN
        RAISE EXCEPTION 'Class membership could not be fully saved' USING ERRCODE = '42501';
    END IF;
    RETURN cardinality(v_codes);
END;
$function$;

REVOKE ALL ON FUNCTION public.save_generic_with_pharm(text,boolean,text,text,text,boolean,boolean,text[],text[]) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.save_generic_with_pharm(text,boolean,text,text,text,boolean,boolean,text[],text[]) TO authenticated;
REVOKE ALL ON FUNCTION public.save_pharm_class_links(text,text[],text[]) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.save_pharm_class_links(text,text[],text[]) TO authenticated;
NOTIFY pgrst, 'reload schema';
COMMIT;
