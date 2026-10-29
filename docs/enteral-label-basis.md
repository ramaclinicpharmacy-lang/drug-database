# Nutrient quantities on their label energy basis

`enteral_nutrients.base_kcal` records the energy basis of `macros`, `vitamins`, `minerals`, and `specials`. Those JSON fields retain the values entered from the label, including units and inequality operators.

Example: protein `10` with `base_kcal = 250` is stored unchanged. At a comparison energy of 100 kcal, the table displays `10 × 100 / 250 = 4`.

## Enable storage

1. Apply `supabase/migrations/20261028235956_enteral_label_basis.sql` in the correct Supabase project. The migration leaves all nutrient quantities unchanged and gives existing rows a basis of 100 kcal.
2. Deploy the updated `enteral_compare.html` and have editors refresh pages that were already open. Do not keep editing from an older version: it assumes all stored quantities are per 100 kcal.
3. Verify a new 250 kcal label record saves, reopens with the same quantities and basis, and displays the expected ratio at 100 kcal.

The frontend can read legacy records before the migration. While the column is unavailable, it preserves legacy 100 kcal saves and refuses non-100 kcal saves instead of silently storing mislabeled quantities. No write fallback removes `base_kcal` after a failed non-100 kcal save.

Existing normalized data cannot be assumed to reproduce the exact original label quantities, because the previous editor rounded values. Re-enter the original label values once when changing an existing record's basis. Merely changing 100 to 250 does not rescale the editor fields, and the editor requires confirmation for that change.

The comparison factor is calculated separately for each product: `comparison_kcal / base_kcal`. Invalid bases do not produce numeric results. Values with `<`, `>`, `≤`, or `≥` retain their operators and are excluded from exact min/max ranking. Text that cannot be parsed as a number is marked as not proportionally converted when the comparison basis differs.
