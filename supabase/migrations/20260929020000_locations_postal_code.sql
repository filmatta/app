begin;

alter table public.locations
  add column postal_code text null;

comment on column public.locations.postal_code is
  'Structured postal code kept as text; null preserves historical locations without backfill.';

commit;
