BEGIN;
SET LOCAL lock_timeout = '5s';
ALTER TABLE public.drug_for_iv_compat
    ADD COLUMN display_order integer NOT NULL DEFAULT 1000
    CONSTRAINT drug_for_iv_compat_display_order_nonnegative CHECK (display_order >= 0);
COMMENT ON COLUMN public.drug_for_iv_compat.display_order IS
    'Smaller values appear first in IV suggestions and drug selectors; ties sort by drug_name.';
UPDATE public.drug_for_iv_compat
SET display_order = 900
WHERE drug_name = 'Hydrocortisone Sodium Succinate';
COMMIT;
