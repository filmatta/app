-- Logical sequence follows the already applied 20260924 reel dependencies.
-- Test/Preview only until reviewed. No billing changes or automatic credit reset.
begin;

alter table public.profile_private_settings
  add column publish_project_preferences boolean not null default false;

create function public.save_my_project_preferences_visibility(p_preferences jsonb, p_publish boolean)
returns void language plpgsql security definer set search_path='' as $$
begin
  if auth.uid() is null then raise exception 'Authentication required' using errcode='42501'; end if;
  if p_publish is null or not private.project_preferences_valid(p_preferences) then
    raise exception 'Invalid preferences' using errcode='22023';
  end if;
  insert into public.profile_private_settings(owner_id,project_preferences,publish_project_preferences)
  values(auth.uid(),p_preferences,p_publish)
  on conflict(owner_id) do update set project_preferences=excluded.project_preferences,
    publish_project_preferences=excluded.publish_project_preferences,updated_at=now();
end $$;
revoke all on function public.save_my_project_preferences_visibility(jsonb,boolean) from public,anon;
grant execute on function public.save_my_project_preferences_visibility(jsonb,boolean) to authenticated;

-- Older clients explicitly promised private preferences. Preserve that contract.
create or replace function public.save_my_project_preferences(p_preferences jsonb)
returns void language sql security definer set search_path='' as $$
  select public.save_my_project_preferences_visibility(p_preferences,false);
$$;

create function public.get_public_project_preferences(p_slug text) returns jsonb
language sql stable security definer set search_path='' as $$
  select s.project_preferences from public.profile_private_settings s
  join public.professional_profiles p on p.user_id=s.owner_id
  where p.slug=p_slug and p.is_public and s.publish_project_preferences;
$$;
revoke all on function public.get_public_project_preferences(text) from public;
grant execute on function public.get_public_project_preferences(text) to anon,authenticated;

create function private.profile_is_published(p_id uuid) returns boolean
language sql stable security definer set search_path='' as $$
  select exists(select 1 from public.professional_profiles where user_id=p_id and is_public);
$$;
revoke all on function private.profile_is_published(uuid) from public,anon;
grant execute on function private.profile_is_published(uuid) to authenticated;

create table public.profile_follows (
  follower_id uuid not null references auth.users(id) on delete cascade,
  profile_id uuid not null references public.professional_profiles(user_id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key(follower_id,profile_id),
  check(follower_id<>profile_id)
);
create index profile_follows_recent_idx on public.profile_follows(profile_id,created_at desc,follower_id);
alter table public.profile_follows enable row level security;
revoke all on public.profile_follows from public,anon,authenticated;
grant select,insert,delete on public.profile_follows to authenticated;
create policy follow_own_read on public.profile_follows for select to authenticated using(follower_id=(select auth.uid()));
create policy follow_own_insert on public.profile_follows for insert to authenticated
  with check(follower_id=(select auth.uid()) and follower_id<>profile_id and private.profile_is_published(profile_id));
create policy follow_own_delete on public.profile_follows for delete to authenticated using(follower_id=(select auth.uid()));

create function public.set_profile_follow(p_slug text,p_follow boolean) returns boolean
language plpgsql security definer set search_path='' as $$
declare target uuid; actor uuid:=auth.uid();
begin
  if actor is null or p_follow is null then raise exception 'Authentication required' using errcode='42501'; end if;
  select user_id into target from public.professional_profiles where slug=p_slug and is_public for share;
  if target is null or target=actor then raise exception 'Profile unavailable' using errcode='42501'; end if;
  if p_follow then
    insert into public.profile_follows(follower_id,profile_id) values(actor,target) on conflict do nothing;
  else
    delete from public.profile_follows where follower_id=actor and profile_id=target;
  end if;
  return p_follow;
end $$;
revoke all on function public.set_profile_follow(text,boolean) from public,anon;
grant execute on function public.set_profile_follow(text,boolean) to authenticated;

create function public.am_i_following_profile(p_slug text) returns boolean
language sql stable security definer set search_path='' as $$
  select exists(select 1 from public.profile_follows f join public.professional_profiles p on p.user_id=f.profile_id
    where p.slug=p_slug and p.is_public and f.follower_id=auth.uid());
$$;
revoke all on function public.am_i_following_profile(text) from public,anon;
grant execute on function public.am_i_following_profile(text) to authenticated;

create function public.get_profile_followers(p_slug text)
returns table(slug text,display_name text,portrait_media_id text,portrait_url text)
language sql stable security definer set search_path='' as $$
  select p.slug,coalesce(nullif(p.presentation->>'stage_name',''),p.display_name),
    p.presentation->>'portrait_media_id',p.presentation->>'portrait_url'
  from public.profile_follows f
  join public.professional_profiles target on target.user_id=f.profile_id and target.is_public
  join public.professional_profiles p on p.user_id=f.follower_id and p.is_public
  where target.slug=p_slug
  order by f.created_at desc,f.follower_id limit 3;
$$;
revoke all on function public.get_profile_followers(text) from public;
grant execute on function public.get_profile_followers(text) to anon,authenticated;

create table private.profile_contact_policy (
  id boolean primary key default true check(id),
  free_contact_limit integer not null default 5 check(free_contact_limit>=0),
  credit_period text not null default 'lifetime_v1' check(credit_period='lifetime_v1')
);
insert into private.profile_contact_policy(id) values(true);
revoke all on private.profile_contact_policy from public,anon,authenticated;

create table public.profile_contact_relationships (
  sender_id uuid not null references auth.users(id) on delete cascade,
  profile_id uuid not null references public.professional_profiles(user_id) on delete cascade,
  first_contact_at timestamptz not null default now(),
  charged boolean not null,
  credit_period text not null default 'lifetime_v1',
  primary key(sender_id,profile_id),
  check(sender_id<>profile_id)
);
create index profile_contact_relationship_target_idx on public.profile_contact_relationships(profile_id);
alter table public.profile_contact_relationships enable row level security;
revoke all on public.profile_contact_relationships from public,anon,authenticated;
grant select on public.profile_contact_relationships to authenticated;
create policy contact_relationship_own_read on public.profile_contact_relationships
  for select to authenticated using(sender_id=(select auth.uid()));
-- Preserve existing relationships without retroactively charging users.
insert into public.profile_contact_relationships(sender_id,profile_id,first_contact_at,charged)
  select sender_id,profile_id,min(created_at),false from public.catalog_inquiries
  where profile_id is not null group by sender_id,profile_id;

create function private.charge_new_profile_contact() returns trigger
language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); is_pro boolean; allowance integer; period text;
begin
  if new.profile_id is null then return new; end if;
  if actor is null or actor<>new.sender_id then raise exception 'Authentication required' using errcode='42501'; end if;
  -- Same actor lock as send_profile_contact: serialize distinct recipients too.
  perform pg_advisory_xact_lock(hashtextextended(actor::text,0));
  if exists(select 1 from public.profile_contact_relationships where sender_id=actor and profile_id=new.profile_id) then return new; end if;
  is_pro:=coalesce(public.get_my_billing_plan()='pro',false);
  select free_contact_limit,credit_period into strict allowance,period from private.profile_contact_policy where id;
  if not is_pro and (select count(*) from public.profile_contact_relationships
      where sender_id=actor and charged and credit_period=period)>=allowance then
    raise exception 'No new contact credits remaining' using errcode='PCC01';
  end if;
  insert into public.profile_contact_relationships(sender_id,profile_id,charged,credit_period)
    values(actor,new.profile_id,not is_pro,period);
  return new;
end $$;
revoke all on function private.charge_new_profile_contact() from public,anon,authenticated;
create trigger charge_new_profile_contact before insert on public.catalog_inquiries
  for each row execute function private.charge_new_profile_contact();

create function public.get_my_profile_contact_access(p_slug text)
returns table(is_pro boolean,free_contact_limit integer,remaining_contacts integer,already_contacted boolean,thread_id uuid)
language sql stable security definer set search_path='' as $$
  select coalesce(public.get_my_billing_plan()='pro',false),c.free_contact_limit,
    greatest(0,c.free_contact_limit-(select count(*)::integer from public.profile_contact_relationships r
      where r.sender_id=auth.uid() and r.charged and r.credit_period=c.credit_period)),
    exists(select 1 from public.profile_contact_relationships r join public.professional_profiles p on p.user_id=r.profile_id
      where r.sender_id=auth.uid() and p.slug=p_slug and p.is_public),
    (select i.id from public.catalog_inquiries i join public.professional_profiles p on p.user_id=i.profile_id
      where i.sender_id=auth.uid() and p.slug=p_slug and p.is_public and i.status not in ('archived','reported')
      order by i.created_at desc,i.id limit 1)
  from private.profile_contact_policy c where c.id and auth.uid() is not null;
$$;
revoke all on function public.get_my_profile_contact_access(text) from public,anon;
grant execute on function public.get_my_profile_contact_access(text) to authenticated;

commit;
