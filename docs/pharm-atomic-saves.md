# Atomic generic and pharmacology saves

Two invoker-rights RPCs replace the independent delete/insert sequences:

- `save_generic_with_pharm`: creates or updates the editable generic fields and
  reconciles that generic's class selection in one transaction. Create uses
  INSERT; edit requires an existing writable generic rather than recreating it.
- `save_pharm_class_links`: reconciles all members of one class in one transaction.

Both functions acquire the mapping-table lock first, compare the current links
with the caller's loaded snapshot, delete only deselected links, add only new
links and verify the saved set. A stale snapshot raises 40001 before data changes.
A foreign-key, RLS or audit error rolls back the entire call, including the parent
and audit rows. An empty array explicitly clears the selected axis. Unrelated
class/generic links remain intact; null or blank selections fail.

Both RPCs use a short SHARE ROW EXCLUSIVE lock on generic_pharm_mapping to
serialize the two save paths with each other and with legacy direct writes.
Reads remain available. Lock waits time out after 5 seconds. The lock lasts only
for database work, never during UI interaction. Reassess this coarse lock if
write volume grows substantially. Concurrent changes to parent generic fields
without link changes still use last-save-wins; the snapshot covers class links,
not every generic field.

Browser execution is restricted to authenticated. SECURITY INVOKER preserves
existing RLS and table grants. The fixed public,pg_temp search path supports
legacy audit triggers with unqualified audit_logs references. No RLS policies,
existing rows, clinical rules or formulas are rewritten by this migration.

The generic editor loads its complete class list directly before allowing saves.
Reloading classes preserves the other draft fields. Bulk membership is loaded
from the mapping table rather than cached nested generic records. Both reads
are paginated; late responses from a previous bulk class are ignored. Both forms
retain failed drafts, display errors as text and guard against duplicate submits.
The bulk form confirms clearing a populated class. Neither path falls back to
separate table writes if the RPC is unavailable. A lost response can follow a
successful commit, so the user is prompted to check current data before retrying.

Apply the migration before deploying index.html. Already-open pages must refresh
to load the new save path; older pages still contain the old independent writes.
Tests use synthetic PostgreSQL schemas/records and intercepted browser requests.
They cover rollback including audit writes, create/edit/clear, missing and
conflicting records, cross-path stale snapshots, anonymous RPC denial, restrictive
RLS, failed reads, draft retention, pagination, late reads and duplicate submits.
No production schema/policy snapshot is published and no production data is
modified for verification.

References:
- https://supabase.com/docs/guides/database/functions
- https://www.postgresql.org/docs/current/explicit-locking.html
