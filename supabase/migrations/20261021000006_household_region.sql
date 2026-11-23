-- Household region metadata captured during onboarding.
-- `cambridge_admin_zone` drives past-paper variant selection (_1, _2, _3) for private candidates.

alter table public.households
  add column if not exists country_code text,
  add column if not exists cambridge_admin_zone smallint;

alter table public.households
  drop constraint if exists households_admin_zone_check;

alter table public.households
  add constraint households_admin_zone_check
  check (cambridge_admin_zone is null or cambridge_admin_zone between 1 and 6);

comment on column public.households.country_code is 'ISO 3166-1 alpha-2 country of residence, used to resolve the Cambridge administrative zone.';
comment on column public.households.cambridge_admin_zone is 'Cambridge administrative zone 1-6 for past paper variant selection.';
