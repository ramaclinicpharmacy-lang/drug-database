BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

-- One RPC call is one transaction: an error in either table also rolls back
-- the parent change and all audit rows written by existing triggers.
CREATE OR REPLACE FUNCTION public.save_administration_with_fluids(
    p_administration_id bigint,
    p_drug_code text,
    p_route_code text,
    p_instructions text,
    p_min_conc numeric,
    p_max_conc numeric,
    p_conc_unit text,
    p_fluid_names text[]
) RETURNS bigint
LANGUAGE plpgsql
SECURITY INVOKER
-- Existing audit triggers refer to audit_logs without a schema prefix.
-- public is not writable by anon/authenticated; pg_temp is explicitly last.
SET search_path = public, pg_temp
AS $function$
DECLARE
    v_id bigint;
    v_fluids text[];
BEGIN
    IF p_drug_code IS NULL OR btrim(p_drug_code) = '' THEN
        RAISE EXCEPTION 'Drug code is required' USING ERRCODE = '22023';
    END IF;
    IF p_fluid_names IS NULL OR EXISTS (
        SELECT 1 FROM unnest(p_fluid_names) AS f(name)
        WHERE f.name IS NULL OR btrim(f.name) = ''
    ) THEN
        RAISE EXCEPTION 'Fluid selection must be an explicit array of names (empty is allowed)' USING ERRCODE = '22023';
    END IF;
    IF p_min_conc::text IN ('NaN', 'Infinity', '-Infinity')
       OR p_max_conc::text IN ('NaN', 'Infinity', '-Infinity') THEN
        RAISE EXCEPTION 'Concentration must be finite' USING ERRCODE = '22023';
    END IF;
    SELECT coalesce(array_agg(DISTINCT f.name ORDER BY f.name), ARRAY[]::text[])
    INTO v_fluids FROM unnest(p_fluid_names) AS f(name);

    IF p_administration_id IS NULL THEN
        INSERT INTO public.drug_administrations
            (drug_code, route_code, instructions, min_conc, max_conc, conc_unit, updated_at, updated_by)
        VALUES
            (p_drug_code, p_route_code, p_instructions, p_min_conc, p_max_conc, p_conc_unit,
             now(), auth.jwt() ->> 'email')
        RETURNING id INTO v_id;
    ELSE
        -- UPDATE locks the parent row, serializing saves of the same method.
        -- Match drug_code too: a stale/wrong ID must never change another drug.
        UPDATE public.drug_administrations
        SET route_code = p_route_code, instructions = p_instructions,
            min_conc = p_min_conc, max_conc = p_max_conc, conc_unit = p_conc_unit,
            updated_at = now(), updated_by = auth.jwt() ->> 'email'
        WHERE id = p_administration_id AND drug_code = p_drug_code
        RETURNING id INTO v_id;
        IF NOT FOUND THEN
            RAISE EXCEPTION 'Administration no longer exists or is not writable; reload the list'
                USING ERRCODE = 'P0002';
        END IF;
    END IF;

    DELETE FROM public.administration_fluids WHERE administration_id = v_id;
    -- RLS can silently filter DELETE; never report a partial replacement as saved.
    IF EXISTS (SELECT 1 FROM public.administration_fluids WHERE administration_id = v_id) THEN
        RAISE EXCEPTION 'Existing fluids could not be replaced' USING ERRCODE = '42501';
    END IF;
    INSERT INTO public.administration_fluids (administration_id, fluid_short_name)
    SELECT v_id, f.name FROM unnest(v_fluids) AS f(name);
    RETURN v_id;
END;
$function$;

REVOKE ALL ON FUNCTION public.save_administration_with_fluids(bigint,text,text,text,numeric,numeric,text,text[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.save_administration_with_fluids(bigint,text,text,text,numeric,numeric,text,text[]) TO authenticated;
COMMENT ON FUNCTION public.save_administration_with_fluids(bigint,text,text,text,numeric,numeric,text,text[]) IS
'Atomically save one administration and its complete fluid selection. Invoker rights preserve existing RLS; an error rolls back both tables and audit trigger writes.';
NOTIFY pgrst, 'reload schema';
COMMIT;
