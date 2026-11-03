BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

DO $migration$
DECLARE
    target_table text;
    write_policy record;
    column_list text;
BEGIN
    -- Closed allowlist: public log INSERT and conditional app_settings policies
    -- are intentionally outside this change.
    FOREACH target_table IN ARRAY ARRAY[
        'drug_label_mapping', 'drug_links', 'drug_nlem_mapping', 'drug_tags',
        'generic_adjustments', 'generic_links', 'generic_pharm_mapping', 'labels',
        'med_error_knowledge', 'nlem_categories', 'nutrition_configs', 'pharm_classes'
    ] LOOP
        EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', target_table);
        -- Keep each policy's USING/WITH CHECK logic but restrict its recipients.
        -- Some tables have no other authenticated write policy, so dropping
        -- these policies outright would also disable legitimate editing.
        FOR write_policy IN
            SELECT policyname FROM pg_policies
            WHERE schemaname = 'public' AND tablename = target_table
              AND cmd IN ('ALL', 'INSERT', 'UPDATE', 'DELETE')
              AND (roles @> ARRAY['public']::name[] OR roles @> ARRAY['anon']::name[])
        LOOP
            EXECUTE format('ALTER POLICY %I ON public.%I TO authenticated', write_policy.policyname, target_table);
        END LOOP;
        EXECUTE format('REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE public.%I FROM anon, PUBLIC', target_table);
        SELECT string_agg(quote_ident(column_name), ', ' ORDER BY ordinal_position)
        INTO column_list FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = target_table;
        EXECUTE format('REVOKE INSERT (%s), UPDATE (%s), REFERENCES (%s) ON TABLE public.%I FROM anon, PUBLIC', column_list, column_list, column_list, target_table);
        EXECUTE format('GRANT SELECT ON TABLE public.%I TO anon', target_table);
    END LOOP;
END;
$migration$;

NOTIFY pgrst, 'reload schema';
COMMIT;
