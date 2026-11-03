# Unsigned read-only access for clinical reference tables

The `clinical_tables_readonly_anon` migration restricts unsigned writes on this
closed allowlist:

- drug_label_mapping
- drug_links
- drug_nlem_mapping
- drug_tags
- generic_adjustments
- generic_links
- generic_pharm_mapping
- labels
- med_error_knowledge
- nlem_categories
- nutrition_configs
- pharm_classes

For each table, existing ALL/INSERT/UPDATE/DELETE policies addressed to PUBLIC
or anon are retargeted to authenticated. Their names and USING/WITH CHECK
expressions are retained. Some tables have no independent authenticated write
policy, so simply dropping the public policy would break signed-in editing.
Existing SELECT policies and authenticated grants are preserved.

The migration also removes INSERT/UPDATE/DELETE/TRUNCATE/REFERENCES/TRIGGER table
grants from anon and PUBLIC, removes independently granted column-level
INSERT/UPDATE/REFERENCES access on every current column, retains anon SELECT,
and keeps RLS enabled. No rows, clinical recommendations, formulas, labels,
links, FK constraints or audit functions are rewritten. All twelve changes
commit together, with short lock/statement timeouts; a migration failure rolls
back the entire batch.

Securing master tables matters too: an unsigned delete of a tag, label or
category can otherwise cascade into its mapping table even when that child is
already read-only. The previous tag-mapping migration remains in place.

## Verification and scope

`clinical-access.test.cjs` builds synthetic populated permission fixtures for
each table name, covering public ALL and separate public write policies, with
and without pre-existing authenticated policies. It contains no exported
production schema/policy snapshot or production rows. It verifies all
12 tables with populated rows: unsigned SELECT succeeds; unsigned INSERT,
UPDATE, DELETE and TRUNCATE fail with 42501; signed-in SELECT/INSERT/UPDATE/DELETE
still work. It exercises explicit column and inherited PUBLIC grants, migration
repeatability, a cascading master-tag deletion, and an intentional public log
INSERT left outside this allowlist. These permission fixtures do not reproduce
all production FK/check constraints or audit triggers.

Live verification uses unsigned and authenticated role-based zero-row statements,
per-table grants/policy checks, SELECT counts and unchanged content fingerprints.
It does not perform real production edits. Database enforcement takes effect
when the migration commits; no frontend deployment is needed.

This preserves the existing trusted-authenticated-account model, including
Supabase Auth anonymous sign-ins if enabled. It does not introduce an admin
allowlist or change signup settings. Intentional public visitor/IV log INSERT
policies and the conditional authenticated app_settings policy are unchanged.
It is not a claim that all tables, functions or authentication settings have
received a complete security audit.

References:
- https://supabase.com/docs/guides/database/postgres/row-level-security
- https://www.postgresql.org/docs/current/sql-alterpolicy.html
- https://www.postgresql.org/docs/current/sql-revoke.html
