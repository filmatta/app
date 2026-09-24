begin;

-- Account deletion must be able to remove its owned locations and associated
-- private request data. Ordinary archive/unpublish operations do not delete
-- rows and continue to preserve accepted history.
alter table public.location_contact_requests
  drop constraint location_contact_requests_owner_id_fkey,
  add constraint location_contact_requests_owner_id_fkey
    foreign key(owner_id) references auth.users(id) on delete cascade,
  drop constraint location_contact_requests_location_id_fkey,
  add constraint location_contact_requests_location_id_fkey
    foreign key(location_id) references public.locations(id) on delete cascade;

alter table private.location_credit_ledger
  drop constraint location_credit_ledger_request_id_fkey,
  add constraint location_credit_ledger_request_id_fkey
    foreign key(request_id) references public.location_contact_requests(id) on delete cascade;

commit;
