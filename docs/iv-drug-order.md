# IV drug display order

Signed-in editors can open the Y-site management page, edit a drug, and set **ลำดับแสดงผล**. Smaller integers appear first; equal numbers sort by primary drug name. New drugs default to 1000. For example, 900 appears before 1000.

The order is stored on the primary IV drug, so its aliases inherit the same position. It applies to autocomplete results, the administration pair selectors, and the admin drug list. It does not change the canonical name or any compatibility result.

The migration initializes Hydrocortisone Sodium Succinate to 900; Hydrocortisone Sodium Phosphate retains the default 1000. All other existing drugs retain 1000. Editors may subsequently change these values. Existing authenticated-only write policies remain unchanged.

The editor validates integer bounds, prevents repeat submission, retains drafts on failure, and checks the returned row before closing. A successful save refreshes the catalog and the admin list. Open pages on other devices must reload to fetch changes.

Verification covers primary names and aliases, pair selectors, deterministic ties, persistence/refresh, invalid inputs, duplicate submission, failed saves, and guest restrictions. The migration test uses a synthetic database and checks name/alias/timestamp and compatibility preservation, defaults, role grants, and the nonnegative constraint.
