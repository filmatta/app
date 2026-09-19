begin;

create table private.auth_rate_buckets (
  key text primary key check (char_length(key) <= 180),
  starts_at timestamptz not null,
  attempts integer not null check (attempts > 0)
);
alter table private.auth_rate_buckets enable row level security;
revoke all on private.auth_rate_buckets from public, anon, authenticated;

-- Only the application server may choose Auth identities/limits. Keys are HMACs.
create function public.consume_auth_rate_limit(p_key text, p_limit integer, p_seconds integer)
returns boolean language plpgsql security definer set search_path='' as $$
declare bucket private.auth_rate_buckets; moment timestamptz := clock_timestamp();
begin
  if p_key is null or char_length(p_key) not between 1 and 180
    or p_limit is null or p_limit not between 1 and 1000
    or p_seconds is null or p_seconds not between 60 and 86400 then
    raise exception 'Invalid rate limit' using errcode='22023';
  end if;
  insert into private.auth_rate_buckets(key,starts_at,attempts) values(p_key,moment,1)
  on conflict(key) do update set
    starts_at=case when auth_rate_buckets.starts_at <= moment-make_interval(secs=>p_seconds) then moment else auth_rate_buckets.starts_at end,
    attempts=case when auth_rate_buckets.starts_at <= moment-make_interval(secs=>p_seconds) then 1 else least(auth_rate_buckets.attempts+1,p_limit+1) end
  returning * into bucket;
  -- Bounded cleanup, no raw identities retained. Window resets are atomic.
  delete from private.auth_rate_buckets where key in (
    select key from private.auth_rate_buckets where starts_at < moment-interval '2 days' limit 100
  );
  return bucket.attempts <= p_limit;
end; $$;
revoke all on function public.consume_auth_rate_limit(text,integer,integer) from public,anon,authenticated;
grant execute on function public.consume_auth_rate_limit(text,integer,integer) to service_role;

create table private.publication_limits (
  resource text primary key check(resource in ('locations','opportunities','service_listings','projects')),
  creations_per_day integer not null check(creations_per_day between 1 and 1000),
  publications_per_day integer not null check(publications_per_day between 1 and 1000)
);
insert into private.publication_limits values
  ('locations',50,20),('opportunities',50,20),('service_listings',50,20),('projects',50,20);
create table private.publication_events (
  owner_id uuid not null references auth.users(id) on delete cascade,
  resource text not null references private.publication_limits(resource),
  entity_id uuid not null,
  operation text not null check(operation in ('create','publish')),
  occurred_at timestamptz not null default clock_timestamp(),
  primary key(owner_id,resource,entity_id,operation)
);
create index publication_events_quota on private.publication_events(owner_id,resource,operation,occurred_at);
alter table private.publication_limits enable row level security;
alter table private.publication_events enable row level security;
revoke all on private.publication_limits,private.publication_events from public,anon,authenticated;

create function private.enforce_publication_quota() returns trigger
language plpgsql security definer set search_path='' as $$
declare owner_value uuid; limits private.publication_limits; operation_value text; maximum integer;
begin
  owner_value := (to_jsonb(new)->>tg_argv[0])::uuid;
  -- Serialize by owner across requests, including direct PostgREST and RPCs.
  perform pg_advisory_xact_lock(hashtextextended('publication:'||owner_value::text,0));
  select * into strict limits from private.publication_limits where resource=tg_table_name;
  delete from private.publication_events where owner_id=owner_value and occurred_at < clock_timestamp()-interval '7 days';
  foreach operation_value in array array['create','publish'] loop
    if operation_value='create' and tg_op<>'INSERT' then continue; end if;
    if operation_value='publish' then
      if new.status <> 'published' then continue; end if;
      if tg_op='UPDATE' and old.status='published' then continue; end if;
    end if;
    -- AFTER triggers see an UPSERT's actual INSERT/UPDATE. Existing entities
    -- do not consume another unit on retry or a same-day publication toggle.
    if exists(select 1 from private.publication_events where owner_id=owner_value
      and resource=tg_table_name and entity_id=new.id and operation=operation_value) then continue; end if;
    maximum := case when operation_value='create' then limits.creations_per_day else limits.publications_per_day end;
    if (select count(*) from private.publication_events where owner_id=owner_value
      and resource=tg_table_name and operation=operation_value
      and occurred_at > clock_timestamp()-interval '24 hours') >= maximum then
      raise exception 'PUBLICATION_LIMIT_REACHED' using errcode='P0001';
    end if;
    insert into private.publication_events(owner_id,resource,entity_id,operation)
      values(owner_value,tg_table_name,new.id,operation_value);
  end loop;
  return new;
end; $$;
revoke all on function private.enforce_publication_quota() from public,anon,authenticated;
create trigger security_publication_quota after insert or update on public.locations
  for each row execute function private.enforce_publication_quota('owner_id');
create trigger security_publication_quota after insert or update on public.opportunities
  for each row execute function private.enforce_publication_quota('owner_id');
create trigger security_publication_quota after insert or update on public.projects
  for each row execute function private.enforce_publication_quota('owner_id');
create trigger security_publication_quota after insert or update on public.service_listings
  for each row execute function private.enforce_publication_quota('owner_user_id');

commit;
