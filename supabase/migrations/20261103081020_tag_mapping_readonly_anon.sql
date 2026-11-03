BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

ALTER TABLE public.drug_tag_mapping ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow All Tag Map" ON public.drug_tag_mapping;

-- Remove both direct and PUBLIC-inherited write privileges. RLS alone does not
-- guard TRUNCATE; grants are also required for an unsigned read-only client.
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
    ON TABLE public.drug_tag_mapping FROM anon, PUBLIC;
-- Table-level revocation does not remove independently granted column access.
REVOKE INSERT (drug_code, tag_name), UPDATE (drug_code, tag_name), REFERENCES (drug_code, tag_name)
    ON TABLE public.drug_tag_mapping FROM anon, PUBLIC;
GRANT SELECT ON TABLE public.drug_tag_mapping TO anon;

-- Existing public SELECT and authenticated CRUD policies/grants remain active.
NOTIFY pgrst, 'reload schema';
COMMIT;
