# Atomic administration and fluid saves

The administration editor in `index.html` calls
`public.save_administration_with_fluids` once for each save. The function creates
or updates the parent `drug_administrations` row and replaces its complete
`administration_fluids` selection in a single PostgreSQL transaction. Any error
(including a fluid foreign-key or RLS error) rolls back both tables and audit
rows created by existing triggers. Updating requires both the administration ID
and the matching drug code. Existing rank is retained; new rows use the table's
rank default. Parent row locking serializes concurrent edits of the same method.

The function uses `SECURITY INVOKER`, so the caller's existing table privileges
and RLS continue to apply. Only `authenticated` receives execution permission;
`PUBLIC` and `anon` do not. This preserves the project's current access model
and does not introduce a new administrator role or bypass RLS. The search path
is fixed to `public, pg_temp` for compatibility with existing audit triggers
that refer to `audit_logs` without a schema. Neither browser role can create
objects in `public`. Identity and timestamp fields come from the database/JWT,
not caller-supplied audit fields.

An empty fluid array explicitly clears the selection. A null array or invalid
fluid name fails rather than silently clearing it. Opening an existing method
or copying it into the editor must successfully load its fluid selection before
replacing the form's values. A read failure preserves the current form.

The editor disables its controls during saving and prevents duplicate submits.
It clears the form only after receiving a valid success response. Errors are
rendered as text in a prominent inline message; the inputs remain available.
There is no fallback to the old sequence of separate table writes if the RPC
is unavailable.

Bulk copy uses the same transaction **per destination drug**, not one transaction
for the entire batch. Only complete saves count as successes. Successful targets
are deselected; failed targets remain selected. A source fluid-read failure
aborts copying rather than interpreting missing data as an empty selection.

## Deployment and verification

Apply the `administration_atomic_save` migration before deploying `index.html`.
Refresh already-open pages to load the new save path. The migration only adds a
function and its grants; it does not rewrite existing administration/fluid rows
or modify their RLS policies.

`npm test` includes an in-memory PostgreSQL test with representative schemas,
audit triggers, identity IDs and RLS. It covers creation, editing, clearing,
rank preservation, missing/wrong IDs, fluid-insert rollback, denied reads/writes,
anonymous execution denial and repeatable migration application. Browser tests
intercept all network traffic and verify RPC payloads, duplicate-submit guards,
error input retention, source-read failures and partial bulk-copy reporting.

If a network response is lost **after commit**, the client cannot know whether
the operation succeeded. It retains the form and tells the user to inspect the
latest destination records before manually retrying. It does not automatically
retry writes or promise rollback on an ambiguous network failure. Repeated
manual creation/copy can still create duplicates; durable request-id-based
idempotency is outside this change. Concurrent valid edits use last-save-wins;
this change does not add optimistic conflict detection.

References:
- https://supabase.com/docs/guides/database/functions
- https://supabase.com/docs/reference/javascript/rpc
