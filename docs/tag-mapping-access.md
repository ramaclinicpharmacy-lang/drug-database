# Tag-mapping access

The `tag_mapping_readonly_anon` migration removes the pre-existing
`Allow All Tag Map` policy, which permitted every operation to PUBLIC. It also
revokes INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES and TRIGGER table privileges
from both `anon` and PUBLIC, including any independently granted column-level
INSERT, UPDATE or REFERENCES privileges on the two columns.

Unsigned requests (`anon` database role) retain SELECT, backed by the existing
public-read policies. Existing authenticated CRUD policies and direct grants
are unchanged, so the deployed `save_drug_with_tags` invoker-rights RPC and the
current signed-in editing workflow continue to work. No records are rewritten
and no frontend deployment is needed for enforcement once the migration applies.

This preserves the app's current model of trusting authenticated accounts for
editing. It does not introduce an administrator allowlist, change signup
settings, or audit access to other tables/functions. Supabase Auth anonymous
sign-in accounts use the authenticated database role; they are distinct from
unsigned requests and are outside this specific fix.

Regression tests recreate the former anonymous-write exploit in an isolated
PostgreSQL database, then apply the migration and assert that SELECT still
returns the original rows while INSERT/UPDATE/DELETE/TRUNCATE fail with 42501.
They also cover explicit column grants, inherited PUBLIC grants, repeatable
migration application, authenticated CRUD and the deployed atomic save function.
Live verification uses role-based zero-row statements and unchanged data
fingerprints; production tag records are not modified for tests.

References:
- https://supabase.com/docs/guides/database/postgres/row-level-security
- https://www.postgresql.org/docs/current/sql-revoke.html
