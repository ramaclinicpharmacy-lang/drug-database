# Atomic bulk Gene/Lab editing

The Bulk Gene/Lab modal loads `id`, `generic_code` and `description` directly
from `generic_gene_lab` for the chosen test name, using ordered pagination.
Cached nested generic data is not used to decide which existing links to remove.
Loading must succeed before saving; changing the test name invalidates the
snapshot, and late responses for previous names are ignored. Existing advice is
shown per generic as escaped text. Reloading resets the draft selection and text.

A save calls `public.save_gene_lab_links` once with the desired generic codes,
the loaded snapshot and an explicit description mode. One database transaction:

1. Validates the request and locks `generic_gene_lab` against concurrent writes.
2. Compares current IDs, generic codes and descriptions with the loaded snapshot.
   A mismatch raises SQLSTATE `40001` before changing any data.
3. Deletes only deselected links; retained links keep IDs, timestamps and advice.
4. Replaces retained descriptions only when explicitly requested.
5. Inserts links for newly selected generics with the supplied new-link advice.
6. Checks that the saved selection matches the requested set, detecting silently
   filtered RLS deletes. Any failure rolls back all data and audit trigger writes.

The table has no unique constraint on `(test_name, generic_code)`. The function
preserves retained legacy duplicate rows instead of discarding their advice.
Selected-count results count distinct generics. A short SHARE ROW EXCLUSIVE lock
also serializes bulk saves with existing single-row editors, which do not use an
advisory lock. Ordinary SELECTs remain available. Lock waits time out after 5s;
the lock is held only for database work, never during UI confirmation or network
requests. This coarse lock suits the current small table (2 rows at deployment);
reassess if write volume grows substantially.

The function is SECURITY INVOKER with an empty search path and fully qualified
relations. Browser execution is granted only to `authenticated`, preserving the
existing table/RLS access model. It does not bypass RLS or change table policies.
The additive migration does not modify any existing rows.

The default mode preserves per-drug advice. The text box applies to new links.
Replacing all selected descriptions requires a separate checkbox and explicit
confirmation; a blank replacement clears descriptions. Clearing every loaded
link also requires confirmation. Controls are disabled while saving, duplicate
submits are ignored and no separate delete/insert fallback exists. On error the
modal retains its draft. A stale-snapshot error disables saving until reloaded.
A lost response can follow a successful commit, so other failures ask the user
to inspect current data before retrying rather than promising rollback.

Apply the migration before publishing the updated page. Refresh already-open
pages to load the new flow. `npm test` covers transaction rollback, audit
rollback, per-generic description preservation, explicit replacement/clearing,
legacy duplicates, stale snapshots, RLS restrictions, anonymous execution denial,
repeatable migrations, failed/late/paginated reads and browser draft retention.
Tests use in-memory PostgreSQL and intercepted browser requests, not production
Gene/Lab edits.

References:
- https://supabase.com/docs/guides/database/functions
- https://www.postgresql.org/docs/current/explicit-locking.html
