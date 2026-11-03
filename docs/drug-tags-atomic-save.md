# Atomic drug and tag saves

`saveDrug()` sends one `save_drug_with_tags` RPC containing the editable drug
fields, explicit create/edit mode and complete selected tag list. The function
inserts or updates the parent, removes only deselected tags, adds only new tags
and checks the saved tag set in one PostgreSQL transaction. An error rolls back
the drug, tags and existing audit-trigger writes together.

Edit mode updates only editable fields and requires an existing writable parent.
It never recreates a removed drug. Existing images and `is_active` are untouched.
Create mode uses INSERT, so an exact primary-key collision fails instead of
silently overwriting an existing drug. The existing frontend case-insensitive
cached duplicate check remains; the database primary key is case-sensitive.
Empty tag arrays explicitly clear tags; null arrays and blank tag names fail.
Parent row locking serializes saves of the same drug through this RPC. Other
valid edits still use last-save-wins; this change adds no stale-form detection.

The SECURITY INVOKER function uses the caller's existing table/RLS permissions.
Browser EXECUTE is granted only to `authenticated`. Its fixed `public, pg_temp`
search path supports legacy audit functions that reference `audit_logs` without
a schema prefix. Neither browser role can create objects in `public`.
The migration adds only a function and its grants; existing data and table
policies are not rewritten.

The form captures edit mode before disabling controls, ignores repeat submits,
and reports success only after receiving the expected drug code. Errors remain
visible as text while retaining all fields and selected tags. Missing RPCs and
permission failures never fall back to separate table writes. A lost response
can follow commit, so ambiguous errors prompt checking current records before
retrying instead of claiming rollback or automatically retrying writes.

Apply the migration before deploying the page; refresh already-open pages.
`npm test` covers create/edit, tag failures and audit rollback, empty selections,
non-editable field preservation, duplicate creation, removed rows, restrictive
RLS scenarios, anonymous RPC denial, form retention and duplicate-submit guards.
Database tests use in-memory PostgreSQL; browser tests intercept all requests.
Production drug records are not edited for verification.

## Access-control follow-up

The pre-existing `Allow All Tag Map` policy and anonymous write grants are
removed by the subsequent `tag_mapping_readonly_anon` migration. Unsigned
clients retain SELECT only; existing authenticated CRUD and the atomic save RPC
continue to work. See [tag-mapping-access.md](tag-mapping-access.md) for scope
and verification.

Reference: https://supabase.com/docs/guides/database/functions
