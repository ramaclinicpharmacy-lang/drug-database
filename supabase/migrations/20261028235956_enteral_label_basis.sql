-- Preserve label quantities; existing rows remain on their original 100 kcal basis.
-- Run once in the project's Supabase SQL Editor, then refresh the application.
begin;
set local lock_timeout = '5s';
set local statement_timeout = '30s';

alter table public.enteral_nutrients
    add column if not exists base_kcal numeric not null default 100;

alter table public.enteral_nutrients alter column base_kcal set default 100;
update public.enteral_nutrients set base_kcal = 100 where base_kcal is null;
alter table public.enteral_nutrients alter column base_kcal set not null;

do $migration$
begin
    if not exists (
        select 1 from pg_constraint
        where conname = 'enteral_nutrients_base_kcal_positive'
          and conrelid = 'public.enteral_nutrients'::regclass
    ) then
        alter table public.enteral_nutrients
            add constraint enteral_nutrients_base_kcal_positive
            check (base_kcal > 0 and base_kcal::text not in ('NaN', 'Infinity', '-Infinity'));
    end if;
end
$migration$;

comment on column public.enteral_nutrients.base_kcal is
    'Energy basis for the stored, unscaled label nutrient quantities. Legacy normalized rows use 100 kcal.';
notify pgrst, 'reload schema';
commit;
