# Ingredient save behavior

Editing an ingredient now sends one matched `UPDATE` to `drug_contents`, setting
`generic_code`, `amount` and `unit` together. The match includes the drug code
and the original generic code. PostgreSQL commits the entire statement or rolls
it back, including audit trigger changes. The former delete-then-upsert branch
has been removed. No database migration or new function is needed.

The current editor already disables the Generic selector while editing. The
old key-change deletion path was therefore not reachable through normal edits;
this fix removes that unsafe latent path without enabling a new UI feature.
If a different key is supplied programmatically, it is still changed by one
UPDATE. A target-key collision fails rather than overwriting another ingredient.

Existing edits never fall back to upsert: if the original row was removed or
RLS prevents updating it, the editor reports failure and retains its inputs.
The existing add-mode upsert behavior is preserved. Both modes request the
saved key with `.select(...).single()` and clear the form only after confirming
that key. Blank quantities/units remain null, and zero remains zero.

While saving, modal controls are disabled and repeated submissions are ignored.
On error, inputs and edit identity are retained and errors are displayed as text.
A lost network response can occur after commit, so users are prompted to inspect
the latest records before manually retrying; writes are not automatically retried.
Concurrent valid edits still use last-save-wins.

Browser regression tests intercept all requests and cover matched updates,
key-change failure, missing rows, network errors, duplicate submissions, success
reset, and null/zero values. No production ingredient records are used in tests.

Reference: https://supabase.com/docs/reference/javascript/update
