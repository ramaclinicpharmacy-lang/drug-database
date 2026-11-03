BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

CREATE OR REPLACE FUNCTION public.save_drug_with_tags(
    p_drug_code text,
    p_is_edit boolean,
    p_drug_name text,
    p_drug_type text,
    p_trade_name text,
    p_strength text,
    p_dosage_form text,
    p_special_note text,
    p_statuscode text,
    p_remarks text,
    p_is_high_error_risk boolean,
    p_tag_names text[]
) RETURNS text
LANGUAGE plpgsql
SECURITY INVOKER
-- Required by existing audit triggers' unqualified audit_logs references.
-- Browser roles cannot create in public; pg_temp is explicitly last.
SET search_path = public, pg_temp
SET lock_timeout = '5s'
AS $function$
DECLARE
    v_code text;
    v_tags text[];
    v_saved_tags text[];
BEGIN
    IF p_drug_code IS NULL OR btrim(p_drug_code) = ''
       OR p_drug_name IS NULL OR btrim(p_drug_name) = ''
       OR p_is_edit IS NULL OR p_is_high_error_risk IS NULL OR p_tag_names IS NULL THEN
        RAISE EXCEPTION 'Drug code, name, save mode, risk flag and explicit tag selection are required'
            USING ERRCODE = '22023';
    END IF;
    IF EXISTS (SELECT 1 FROM unnest(p_tag_names) AS t(name) WHERE t.name IS NULL OR btrim(t.name) = '') THEN
        RAISE EXCEPTION 'Tag names must not be blank' USING ERRCODE = '22023';
    END IF;
    SELECT coalesce(array_agg(DISTINCT t.name ORDER BY t.name), ARRAY[]::text[])
    INTO v_tags FROM unnest(p_tag_names) AS t(name);

    IF p_is_edit THEN
        -- Locks the parent row so two saves cannot interleave their tag sets.
        -- Only editable columns change; image fields and is_active stay intact.
        UPDATE public.drugs
        SET drug_name = p_drug_name, drug_type = p_drug_type,
            trade_name = p_trade_name, strength = p_strength,
            dosage_form = p_dosage_form, special_note = p_special_note,
            statuscode = p_statuscode, remarks = p_remarks,
            is_high_error_risk = p_is_high_error_risk
        WHERE drug_code = p_drug_code
        RETURNING drug_code INTO v_code;
        IF NOT FOUND THEN
            RAISE EXCEPTION 'Drug no longer exists or is not writable; reload before editing'
                USING ERRCODE = 'P0002';
        END IF;
    ELSE
        -- INSERT, never UPSERT: a concurrent duplicate must fail, not overwrite.
        INSERT INTO public.drugs
            (drug_code, drug_name, drug_type, trade_name, strength, dosage_form,
             special_note, statuscode, remarks, is_high_error_risk, updated_by)
        VALUES
            (p_drug_code, p_drug_name, p_drug_type, p_trade_name, p_strength,
             p_dosage_form, p_special_note, p_statuscode, p_remarks,
             p_is_high_error_risk, auth.jwt() ->> 'email')
        RETURNING drug_code INTO v_code;
    END IF;

    DELETE FROM public.drug_tag_mapping AS m
    WHERE m.drug_code = v_code AND NOT (m.tag_name = ANY(v_tags));
    INSERT INTO public.drug_tag_mapping (drug_code, tag_name)
    SELECT v_code, t.name FROM unnest(v_tags) AS t(name)
    WHERE NOT EXISTS (SELECT 1 FROM public.drug_tag_mapping AS m WHERE m.drug_code = v_code AND m.tag_name = t.name);
    SELECT coalesce(array_agg(m.tag_name ORDER BY m.tag_name), ARRAY[]::text[])
    INTO v_saved_tags FROM public.drug_tag_mapping AS m WHERE m.drug_code = v_code;
    IF v_saved_tags IS DISTINCT FROM v_tags THEN
        RAISE EXCEPTION 'Tag selection could not be fully saved' USING ERRCODE = '42501';
    END IF;
    RETURN v_code;
END;
$function$;

REVOKE ALL ON FUNCTION public.save_drug_with_tags(text,boolean,text,text,text,text,text,text,text,text,boolean,text[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.save_drug_with_tags(text,boolean,text,text,text,text,text,text,text,text,boolean,text[]) TO authenticated;
COMMENT ON FUNCTION public.save_drug_with_tags(text,boolean,text,text,text,text,text,text,text,text,boolean,text[]) IS
'Atomically insert or update a drug and reconcile its complete tag selection. Invoker RLS applies; any failure rolls back parent, tags and audit changes.';
NOTIFY pgrst, 'reload schema';
COMMIT;
