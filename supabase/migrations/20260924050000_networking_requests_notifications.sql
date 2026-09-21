begin;
-- Extend existing private inquiries; retain legacy service/job/contact history.
alter table public.catalog_inquiries
 add column request_state text check(request_state in ('pending','accepted','rejected','expired','cancelled')),
 add column expires_at timestamptz,
 add column accepted_at timestamptz,
 add column contact_unlocked_at timestamptz,
 add column shared_contact_snapshot jsonb,
 add column attached_project_id uuid references public.projects(id) on delete set null,
 add column project_snapshot jsonb,
 add constraint networking_request_shape check(request_state is null or (
   profile_id is not null and expires_at is not null and expires_at=created_at+interval '48 hours'
   and ((request_state='accepted' and accepted_at is not null and contact_unlocked_at is not null and shared_contact_snapshot is not null and jsonb_typeof(shared_contact_snapshot)='object')
     or (request_state<>'accepted' and accepted_at is null and contact_unlocked_at is null and shared_contact_snapshot is null))
 ));
create unique index networking_pending_pair on public.catalog_inquiries(sender_id,profile_id) where request_state='pending';
create index networking_pending_expiry on public.catalog_inquiries(expires_at,sender_id) where request_state='pending';

create table public.contact_credit_reservations (
 request_id uuid primary key references public.catalog_inquiries(id) on delete cascade,
 sender_id uuid not null references auth.users(id) on delete cascade,
 state text not null check(state in ('reserved','consumed','released')),
 credit_required boolean not null,
 created_at timestamptz not null default now(),
 settled_at timestamptz
);
create index contact_reservations_sender on public.contact_credit_reservations(sender_id,state);
alter table public.contact_credit_reservations enable row level security;
revoke all on public.contact_credit_reservations from public,anon,authenticated;
grant select on public.contact_credit_reservations to authenticated;
create policy reservation_own_read on public.contact_credit_reservations for select to authenticated using(sender_id=(select auth.uid()));
drop trigger charge_new_profile_contact on public.catalog_inquiries;

create table public.notifications (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references auth.users(id) on delete cascade,
 actor_user_id uuid references auth.users(id) on delete set null,
 type text not null check(type in ('contact_request_received','contact_request_accepted','contact_request_rejected','contact_request_expiring','follow_received')),
 entity_type text not null check(entity_type in ('contact_request','profile')),
 entity_id uuid not null,
 payload jsonb not null default '{}' check(jsonb_typeof(payload)='object'),
 read_at timestamptz,
 created_at timestamptz not null default now(),
 unique(user_id,type,entity_id)
);
create index notifications_owner_recent on public.notifications(user_id,created_at desc,id);
create index notifications_owner_unread on public.notifications(user_id) where read_at is null;
alter table public.notifications enable row level security;
revoke all on public.notifications from public,anon,authenticated;
grant select on public.notifications to authenticated;
create policy notification_own_read on public.notifications for select to authenticated using(user_id=(select auth.uid()));

-- No Test mail provider: trusted outbox events, no client delivery or recipient data.
create table private.network_email_outbox (
 notification_id uuid primary key references public.notifications(id) on delete cascade,
 state text not null default 'pending' check(state in ('pending','delivered','failed')),
 attempts integer not null default 0,
 created_at timestamptz not null default now(),
 delivered_at timestamptz
);
revoke all on private.network_email_outbox from public,anon,authenticated;
create function private.enqueue_network_email() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.type in ('contact_request_received','contact_request_expiring') then
  insert into private.network_email_outbox(notification_id) values(new.id) on conflict do nothing;
 end if;return new;
end $$;
revoke all on function private.enqueue_network_email() from public,anon,authenticated;
create trigger notification_email_outbox after insert on public.notifications for each row execute function private.enqueue_network_email();

create function private.notify_new_profile_follow() returns trigger language plpgsql security definer set search_path='' as $$
begin
 insert into public.notifications(user_id,actor_user_id,type,entity_type,entity_id)
 values(new.profile_id,new.follower_id,'follow_received','profile',new.follower_id) on conflict do nothing;
 return new;
end $$;
revoke all on function private.notify_new_profile_follow() from public,anon,authenticated;
create trigger profile_follow_notification after insert on public.profile_follows for each row execute function private.notify_new_profile_follow();

create function private.guard_network_request_mutation() returns trigger language plpgsql set search_path='' as $$
begin
 if old.request_state is not null and current_user in ('anon','authenticated') then
  raise exception 'Use request transition' using errcode='42501';
 end if;
 if old.request_state='accepted' and (new.shared_contact_snapshot is distinct from old.shared_contact_snapshot or new.contact_unlocked_at is distinct from old.contact_unlocked_at or new.accepted_at is distinct from old.accepted_at) then
  raise exception 'Contact snapshot is immutable' using errcode='42501';
 end if;
 if new.project_snapshot is distinct from old.project_snapshot then raise exception 'Project snapshot is immutable' using errcode='42501';end if;
 return new;
end $$;
revoke all on function private.guard_network_request_mutation() from public,anon,authenticated;
create trigger networking_request_guard before update on public.catalog_inquiries for each row execute function private.guard_network_request_mutation();

-- Acquire sender locks in one deterministic order BEFORE row locks. All writers
-- use this order; it prevents accept/send/expire from double spending or racing.
create function public.refresh_my_contact_requests() returns void
language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); sender uuid;
begin
 if actor is null then raise exception 'Authentication required' using errcode='42501';end if;
 for sender in select distinct sender_id from public.catalog_inquiries
  where request_state='pending' and actor in (sender_id,recipient_id) order by sender_id loop
  perform pg_advisory_xact_lock(hashtextextended(sender::text,0));
 end loop;
 with expired as (
  update public.catalog_inquiries set request_state='expired',status='archived'
  where request_state='pending' and actor in (sender_id,recipient_id) and expires_at<=clock_timestamp() returning id
 ) update public.contact_credit_reservations set state='released',settled_at=now()
   where request_id in (select id from expired) and state='reserved';
 insert into public.notifications(user_id,actor_user_id,type,entity_type,entity_id)
 select u.user_id,case when u.user_id=i.sender_id then i.recipient_id else i.sender_id end,'contact_request_expiring','contact_request',i.id
 from public.catalog_inquiries i cross join lateral (values(i.sender_id),(i.recipient_id)) u(user_id)
 where i.request_state='pending' and actor in (i.sender_id,i.recipient_id)
   and i.expires_at>clock_timestamp() and i.expires_at<=clock_timestamp()+interval '6 hours'
 on conflict do nothing;
end $$;
revoke all on function public.refresh_my_contact_requests() from public,anon;
grant execute on function public.refresh_my_contact_requests() to authenticated;

create function public.get_my_contact_wallet(p_slug text default null) returns jsonb
language plpgsql security definer set search_path='' as $$
declare allowance integer; used integer; held integer; pro boolean; period text; target uuid; thread uuid;
begin
 if auth.uid() is null then raise exception 'Authentication required' using errcode='42501';end if;
 perform public.refresh_my_contact_requests();
 select free_contact_limit,credit_period into strict allowance,period from private.profile_contact_policy where id;
 select count(*)::int into used from public.profile_contact_relationships where sender_id=auth.uid() and charged and credit_period=period;
 select count(*)::int into held from public.contact_credit_reservations r join public.catalog_inquiries i on i.id=r.request_id
  where r.sender_id=auth.uid() and r.credit_required and r.state='reserved' and i.request_state='pending' and i.expires_at>clock_timestamp();
 pro:=coalesce(public.get_my_billing_plan()='pro',false);
 select user_id into target from public.professional_profiles where slug=p_slug and is_public;
 select id into thread from public.catalog_inquiries where sender_id=auth.uid() and profile_id=target
  and (request_state='accepted' or (request_state='pending' and expires_at>clock_timestamp()) or (request_state is null and status not in ('archived','reported')))
  order by created_at desc,id limit 1;
 return jsonb_build_object('is_pro',pro,'free_contact_limit',allowance,'consumed_contacts',used,'reserved_contacts',held,
  'remaining_contacts',greatest(0,allowance-used-held),'already_contacted',exists(select 1 from public.profile_contact_relationships where sender_id=auth.uid() and profile_id=target),'thread_id',thread);
end $$;
revoke all on function public.get_my_contact_wallet(text) from public,anon;
grant execute on function public.get_my_contact_wallet(text) to authenticated;

create function public.send_profile_contact_request(p_slug text,p_contact_type text,p_message text,p_project_id uuid default null) returns uuid
language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); target public.professional_profiles; project public.projects; snapshot jsonb;
 result uuid; required boolean; allowance integer; used integer; held integer; period text; clean text:=btrim(coalesce(p_message,''));
begin
 if actor is null then raise exception 'Authentication required' using errcode='42501';end if;
 if length(clean) not between 20 and 200 or p_contact_type is null or p_contact_type not in ('professional_interest','project_invitation','casting','service','other') then raise exception 'Invalid request' using errcode='22023';end if;
 select * into target from public.professional_profiles where slug=p_slug and is_public and contact_policy='members_only' for share;
 if not found or target.user_id=actor then raise exception 'Profile unavailable' using errcode='42501';end if;
 -- Settle this sender's old requests before checking the unique active pair.
 perform pg_advisory_xact_lock(hashtextextended(actor::text,0));
 with expired as (update public.catalog_inquiries set request_state='expired',status='archived'
  where sender_id=actor and request_state='pending' and expires_at<=clock_timestamp() returning id)
 update public.contact_credit_reservations set state='released',settled_at=now() where request_id in (select id from expired) and state='reserved';
 if exists(select 1 from public.catalog_inquiries where sender_id=actor and profile_id=target.user_id and status not in ('archived','reported')) then raise exception 'Existing request or contact' using errcode='23505';end if;
 if (select count(*) from public.catalog_inquiries where sender_id=actor and created_at>now()-interval '24 hours')>=10 then raise exception 'Daily inquiry limit' using errcode='22023';end if;
 if exists(select 1 from public.catalog_inquiries where sender_id=actor and profile_id=target.user_id and created_at>now()-interval '7 days') then raise exception 'Contact cooldown' using errcode='23505';end if;
 if exists(select 1 from public.catalog_inquiries where sender_id=actor and lower(message)=lower(clean) and created_at>now()-interval '10 minutes') then raise exception 'Duplicate message' using errcode='23505';end if;
 if p_project_id is not null then
  select * into project from public.projects where id=p_project_id and owner_id=actor and networking_private and status='draft' for share;
  if not found then raise exception 'Project unavailable' using errcode='42501';end if;
  snapshot:=jsonb_build_object('title',project.title,'project_type',project.project_type,'city',project.city,'work_area',project.work_area,
   'shooting_schedule',project.shooting_schedule,'economic_mode',project.economic_mode,'date_window',project.date_window,'roles',project.roles,'requirements',project.requirements);
 end if;
 required:=not coalesce(public.get_my_billing_plan()='pro',false) and not exists(select 1 from public.profile_contact_relationships where sender_id=actor and profile_id=target.user_id);
 select free_contact_limit,credit_period into strict allowance,period from private.profile_contact_policy where id;
 select count(*)::int into used from public.profile_contact_relationships where sender_id=actor and charged and credit_period=period;
 select count(*)::int into held from public.contact_credit_reservations r join public.catalog_inquiries i on i.id=r.request_id
  where r.sender_id=actor and r.credit_required and r.state='reserved' and i.request_state='pending' and i.expires_at>clock_timestamp();
 if required and used+held>=allowance then raise exception 'No available contact credits' using errcode='PCC01';end if;
 insert into public.catalog_inquiries(profile_id,sender_id,recipient_id,message,status,source_type,contact_type,sender_display_name,
  request_state,expires_at,attached_project_id,project_snapshot)
 values(target.user_id,actor,target.user_id,clean,'sent',case when target.disciplines&&array['Actuación','Modelaje'] then 'talent' else 'profile' end,
  p_contact_type,private.profile_contact_sender_name(actor),'pending',now()+interval '48 hours',p_project_id,snapshot) returning id into result;
 insert into public.contact_credit_reservations(request_id,sender_id,state,credit_required) values(result,actor,'reserved',required);
 insert into public.notifications(user_id,actor_user_id,type,entity_type,entity_id) values(target.user_id,actor,'contact_request_received','contact_request',result);
 return result;
end $$;
revoke all on function public.send_profile_contact_request(text,text,text,uuid) from public,anon;
grant execute on function public.send_profile_contact_request(text,text,text,uuid) to authenticated;
-- Older clients use the same safe reservation flow; there is no immediate-charge bypass.
create or replace function public.send_profile_contact(p_slug text,p_contact_type text,p_message text) returns uuid
language sql security definer set search_path='' as $$select public.send_profile_contact_request(p_slug,p_contact_type,p_message,null);$$;
create or replace function public.get_my_profile_contact_access(p_slug text)
returns table(is_pro boolean,free_contact_limit integer,remaining_contacts integer,already_contacted boolean,thread_id uuid)
language sql volatile security definer set search_path='' as $$
 select (w->>'is_pro')::boolean,(w->>'free_contact_limit')::integer,(w->>'remaining_contacts')::integer,(w->>'already_contacted')::boolean,(w->>'thread_id')::uuid
 from (select public.get_my_contact_wallet(p_slug) w) x;
$$;

create function public.transition_contact_request(p_id uuid,p_action text) returns text
language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); sender uuid; r public.catalog_inquiries; settings public.profile_private_settings; snapshot jsonb:='{}'; required boolean; period text;
begin
 if actor is null then raise exception 'Authentication required' using errcode='42501';end if;
 select sender_id into sender from public.catalog_inquiries where id=p_id and request_state is not null and actor in(sender_id,recipient_id);
 if sender is null then raise exception 'Request unavailable' using errcode='42501';end if;
 perform pg_advisory_xact_lock(hashtextextended(sender::text,0));
 select * into r from public.catalog_inquiries where id=p_id for update;
 if p_action is null or p_action not in ('accept','reject','cancel') or (p_action in ('accept','reject') and actor<>r.recipient_id) or (p_action='cancel' and actor<>r.sender_id) then raise exception 'Not authorized' using errcode='42501';end if;
 if r.request_state<>'pending' then return r.request_state;end if;
 if r.expires_at<=clock_timestamp() then
  update public.catalog_inquiries set request_state='expired',status='archived' where id=p_id;
  update public.contact_credit_reservations set state='released',settled_at=now() where request_id=p_id;
  return 'expired';
 end if;
 if p_action='accept' then
  if r.status='reported' then raise exception 'Request unavailable' using errcode='42501';end if;
  select * into settings from public.profile_private_settings where owner_id=actor for share;
  if settings.share_instagram and settings.instagram_username<>'' then snapshot:=snapshot||jsonb_build_object('instagram',settings.instagram_username);end if;
  if settings.share_whatsapp and settings.whatsapp_e164<>'' then snapshot:=snapshot||jsonb_build_object('whatsapp',settings.whatsapp_e164);end if;
  if settings.share_email and settings.contact_email<>'' then snapshot:=snapshot||jsonb_build_object('email',settings.contact_email);end if;
  if settings.share_phone and settings.phone_e164<>'' then snapshot:=snapshot||jsonb_build_object('phone',settings.phone_e164);end if;
  select credit_required into strict required from public.contact_credit_reservations where request_id=p_id and state='reserved';
  select credit_period into strict period from private.profile_contact_policy where id;
  insert into public.profile_contact_relationships(sender_id,profile_id,charged,credit_period) values(sender,r.profile_id,required,period) on conflict do nothing;
  update public.catalog_inquiries set request_state='accepted',status='accepted',accepted_at=now(),contact_unlocked_at=now(),shared_contact_snapshot=snapshot where id=p_id;
  update public.contact_credit_reservations set state='consumed',settled_at=now() where request_id=p_id;
  insert into public.notifications(user_id,actor_user_id,type,entity_type,entity_id) values(sender,actor,'contact_request_accepted','contact_request',p_id) on conflict do nothing;
  return 'accepted';
 end if;
 update public.catalog_inquiries set request_state=case when p_action='reject' then 'rejected' else 'cancelled' end,status='archived' where id=p_id;
 update public.contact_credit_reservations set state='released',settled_at=now() where request_id=p_id;
 if p_action='reject' then insert into public.notifications(user_id,actor_user_id,type,entity_type,entity_id) values(sender,actor,'contact_request_rejected','contact_request',p_id) on conflict do nothing;end if;
 return case when p_action='reject' then 'rejected' else 'cancelled' end;
end $$;
revoke all on function public.transition_contact_request(uuid,text) from public,anon;
grant execute on function public.transition_contact_request(uuid,text) to authenticated;
create or replace function public.respond_profile_contact(p_id uuid, p_message text) returns boolean
language plpgsql security definer set search_path = '' as $$
declare clean_message text := btrim(coalesce(p_message,''));
begin
  if char_length(clean_message) not between 20 and 3000 then
    raise exception 'Message length invalid' using errcode = '22023';
  end if;
  update public.catalog_inquiries set
    response_message = clean_message,
    responded_at = now(),
    read_at = coalesce(read_at, now()),
    status = 'read'
  where id = p_id and profile_id is not null
    and request_state is null and recipient_id = auth.uid() and response_message is null
    and status not in ('archived','reported');
  return found;
end;
$$;
commit;
