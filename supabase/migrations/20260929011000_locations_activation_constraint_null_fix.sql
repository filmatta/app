begin;

alter table public.locations
  drop constraint locations_onboarding_state_check;

alter table public.locations
  add constraint locations_onboarding_state_check check (
    (onboarding_step is null and onboarding_completed_at is null)
    or (
      onboarding_step is not null
      and (
        (onboarding_step between 1 and 7 and onboarding_completed_at is null)
        or (onboarding_step = 8 and onboarding_completed_at is not null)
      )
    )
  );

commit;
