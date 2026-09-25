begin;

alter table public.locations
  add column onboarding_step smallint,
  add column onboarding_completed_at timestamptz;

alter table public.locations
  add constraint locations_onboarding_state_check check (
    (onboarding_step is null and onboarding_completed_at is null)
    or (onboarding_step between 1 and 7 and onboarding_completed_at is null)
    or (onboarding_step = 8 and onboarding_completed_at is not null)
  );

comment on column public.locations.onboarding_step is
  'Null identifies historical/non-walkthrough locations; 1-7 is in progress; 8 is completed.';
comment on column public.locations.onboarding_completed_at is
  'Set only when the eight-step Locations activation walkthrough is complete.';

commit;
