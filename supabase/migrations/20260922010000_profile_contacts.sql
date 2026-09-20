-- Contacto Operativo V1 for Professional Profiles and Talent.
-- Extends the shared Services/Jobs inquiry foundation without exposing contact data.

begin;

alter table public.catalog_inquiries
  add column profile_id uuid references public.professional_profiles(user_id) on delete cascade,
  add column source_type text,
  add column contact_type text,
  add column sender_display_name text,
  add column read_at timestamptz,
  add column response_message text,
  add column responded_at timestamptz,
  add column sender_archived_at timestamptz,
  add column recipient_archived_at timestamptz;

alter table public.catalog_inquiries
  drop constraint inquiry_one_target,
  drop constraint catalog_inquiries_status_check,
  add constraint inquiry_one_target
    check (num_nonnulls(service_id, opportunity_id, profile_id) = 1),
  add constraint inquiry_profile_recipient
    check (profile_id is null or profile_id = recipient_id),
  add constraint inquiry_profile_source
    check (
      (profile_id is null and source_type is null and contact_type is null and sender_display_name is null)
      or
      (profile_id is not null
       and source_type in ('profile','talent')
       and contact_type in ('professional_interest','project_invitation','casting','service','other')
       and sender_display_name = btrim(sender_display_name)
       and char_length(sender_display_name) between 1 and 90)
    ),
  add constraint catalog_inquiries_status_check
    check (status in ('pending','accepted','declined','sent','read','archived','reported')),
  add constraint inquiry_response_check
    check (
      (response_message is null and responded_at is null)
      or
      (profile_id is not null
       and response_message = btrim(response_message)
       and char_length(response_message) between 20 and 3000
       and responded_at is not null)
    );

create index catalog_inquiries_profile_recipient_idx
  on public.catalog_inquiries(profile_id, created_at desc, id)
  where profile_id is not null;

create unique index catalog_inquiries_profile_active_sender_idx
  on public.catalog_inquiries(profile_id, sender_id)
  where profile_id is not null and status not in ('archived','reported');

create table public.catalog_inquiry_reports (
  id uuid primary key default gen_random_uuid(),
  inquiry_id uuid not null references public.catalog_inquiries(id) on delete cascade,
  reporter_user_id uuid not null references auth.users(id) on delete cascade,
  reason text not null check(reason = btrim(reason) and char_length(reason) between 3 and 500),
  created_at timestamptz not null default now(),
  unique(inquiry_id, reporter_user_id)
);

create index catalog_inquiry_reports_created_idx
  on public.catalog_inquiry_reports(created_at desc, id);

alter table public.catalog_inquiry_reports enable row level security;
revoke all on public.catalog_inquiry_reports from public, anon, authenticated;
grant select on public.catalog_inquiry_reports to authenticated;
create policy inquiry_report_owner_read on public.catalog_inquiry_reports
  for select to authenticated
  using (reporter_user_id = (select auth.uid()) or (select private.is_admin()));

create function private.profile_contact_sender_name(p_actor uuid)
returns text
language sql stable security definer set search_path = '' as $$
  select coalesce(
    (select p.display_name from public.professional_profiles p where p.user_id = p_actor),
    (select private.professional_profile_public_display_name(
      coalesce(nullif(btrim(u.raw_user_meta_data->>'full_name'),''),
               nullif(btrim(u.raw_user_meta_data->>'name'),''),
               'Miembro FILMATTA'))
     from auth.users u where u.id = p_actor),
    'Miembro FILMATTA'
  );
$$;

create function public.send_profile_contact(
  p_slug text,
  p_contact_type text,
  p_message text
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  actor uuid := auth.uid();
  target public.professional_profiles;
  target_id uuid;
  sender_name text;
  source text;
  clean_message text := btrim(coalesce(p_message,''));
begin
  if actor is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  if p_slug is null or p_slug !~ '^[a-z0-9]+(-[a-z0-9]+)*$'
     or char_length(p_slug) > 120 then
    raise exception 'Profile unavailable for contact' using errcode = '42501';
  end if;
  if p_contact_type not in ('professional_interest','project_invitation','casting','service','other') then
    raise exception 'Invalid contact type' using errcode = '22023';
  end if;
  if char_length(clean_message) not between 20 and 3000 then
    raise exception 'Message length invalid' using errcode = '22023';
  end if;

  select * into target
  from public.professional_profiles
  where slug = p_slug and is_public and contact_policy = 'members_only'
  for share;
  if not found or target.user_id = actor then
    raise exception 'Profile unavailable for contact' using errcode = '42501';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(actor::text, 0));
  if (select count(*) from public.catalog_inquiries
      where sender_id = actor and created_at > now() - interval '24 hours') >= 10 then
    raise exception 'Daily inquiry limit reached' using errcode = '22023';
  end if;
  if exists(select 1 from public.catalog_inquiries
            where sender_id = actor and profile_id = target.user_id
              and created_at > now() - interval '7 days') then
    raise exception 'Profile contact cooldown active' using errcode = '23505';
  end if;
  if exists(select 1 from public.catalog_inquiries
            where sender_id = actor and lower(message) = lower(clean_message)
              and created_at > now() - interval '10 minutes') then
    raise exception 'Duplicate inquiry' using errcode = '23505';
  end if;

  sender_name := private.profile_contact_sender_name(actor);
  source := case when target.disciplines && array[
    'Actuación','Actor','Actriz','Modelaje','Modelo','Modelo/a','Talento','Doblaje'
  ]::text[] then 'talent' else 'profile' end;

  insert into public.catalog_inquiries(
    profile_id, sender_id, recipient_id, message, status,
    source_type, contact_type, sender_display_name
  ) values (
    target.user_id, actor, target.user_id, clean_message, 'sent',
    source, p_contact_type, sender_name
  ) returning id into target_id;
  return target_id;
end;
$$;
revoke all on function public.send_profile_contact(text,text,text) from public,anon,authenticated;
grant execute on function public.send_profile_contact(text,text,text) to authenticated;

create function public.list_my_profile_contacts(
  p_box text default 'received',
  p_page integer default 1
) returns table(
  id uuid, message text, response_message text, status text,
  created_at timestamptz, read_at timestamptz, responded_at timestamptz,
  is_recipient boolean, source_type text, contact_type text,
  counterpart_name text, counterpart_profile_slug text,
  target_name text, target_profile_slug text
)
language sql stable security definer set search_path = '' as $$
  select i.id, i.message, i.response_message, i.status,
    i.created_at, i.read_at, i.responded_at,
    i.recipient_id = auth.uid(), i.source_type, i.contact_type,
    case when i.recipient_id = auth.uid()
      then i.sender_display_name else target.display_name end,
    case when i.recipient_id = auth.uid() and sender.is_public then sender.slug
      when i.sender_id = auth.uid() and target.is_public then target.slug end,
    target.display_name,
    case when target.is_public then target.slug end
  from public.catalog_inquiries i
  join public.professional_profiles target on target.user_id = i.profile_id
  left join public.professional_profiles sender on sender.user_id = i.sender_id
  where i.profile_id is not null
    and ((p_box = 'received' and i.recipient_id = auth.uid() and i.recipient_archived_at is null)
      or (p_box = 'sent' and i.sender_id = auth.uid() and i.sender_archived_at is null))
  order by i.created_at desc, i.id
  limit 25 offset ((greatest(1, least(coalesce(p_page,1),1000))-1)*24);
$$;
revoke all on function public.list_my_profile_contacts(text,integer) from public,anon,authenticated;
grant execute on function public.list_my_profile_contacts(text,integer) to authenticated;

create function public.get_my_profile_contact(p_id uuid)
returns table(
  id uuid, message text, response_message text, status text,
  created_at timestamptz, read_at timestamptz, responded_at timestamptz,
  is_recipient boolean, source_type text, contact_type text,
  counterpart_name text, counterpart_profile_slug text,
  target_name text, target_profile_slug text, reported boolean
)
language sql stable security definer set search_path = '' as $$
  select i.id, i.message, i.response_message, i.status,
    i.created_at, i.read_at, i.responded_at,
    i.recipient_id = auth.uid(), i.source_type, i.contact_type,
    case when i.recipient_id = auth.uid()
      then i.sender_display_name else target.display_name end,
    case when i.recipient_id = auth.uid() and sender.is_public then sender.slug
      when i.sender_id = auth.uid() and target.is_public then target.slug end,
    target.display_name,
    case when target.is_public then target.slug end,
    exists(select 1 from public.catalog_inquiry_reports r
           where r.inquiry_id = i.id and r.reporter_user_id = auth.uid())
  from public.catalog_inquiries i
  join public.professional_profiles target on target.user_id = i.profile_id
  left join public.professional_profiles sender on sender.user_id = i.sender_id
  where i.id = p_id and i.profile_id is not null
    and auth.uid() in (i.sender_id, i.recipient_id);
$$;
revoke all on function public.get_my_profile_contact(uuid) from public,anon,authenticated;
grant execute on function public.get_my_profile_contact(uuid) to authenticated;

create function public.mark_profile_contact_read(p_id uuid) returns boolean
language plpgsql security definer set search_path = '' as $$
begin
  update public.catalog_inquiries set
    read_at = coalesce(read_at, now()),
    status = case when status = 'sent' then 'read' else status end
  where id = p_id and profile_id is not null and recipient_id = auth.uid();
  return found;
end;
$$;
revoke all on function public.mark_profile_contact_read(uuid) from public,anon,authenticated;
grant execute on function public.mark_profile_contact_read(uuid) to authenticated;

create function public.respond_profile_contact(p_id uuid, p_message text) returns boolean
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
    and recipient_id = auth.uid() and response_message is null
    and status not in ('archived','reported');
  return found;
end;
$$;
revoke all on function public.respond_profile_contact(uuid,text) from public,anon,authenticated;
grant execute on function public.respond_profile_contact(uuid,text) to authenticated;

create function public.manage_profile_contact(
  p_id uuid,
  p_action text,
  p_reason text default null
) returns boolean
language plpgsql security definer set search_path = '' as $$
declare actor uuid := auth.uid(); clean_reason text := btrim(coalesce(p_reason,''));
begin
  if actor is null then return false; end if;
  if p_action = 'archive' then
    update public.catalog_inquiries set
      sender_archived_at = case when sender_id = actor then now() else sender_archived_at end,
      recipient_archived_at = case when recipient_id = actor then now() else recipient_archived_at end
    where id = p_id and profile_id is not null and actor in (sender_id,recipient_id);
    return found;
  elsif p_action = 'report' then
    if char_length(clean_reason) not between 3 and 500 then
      raise exception 'Report reason invalid' using errcode = '22023';
    end if;
    if not exists(select 1 from public.catalog_inquiries
                  where id = p_id and profile_id is not null
                    and actor in (sender_id,recipient_id)) then
      return false;
    end if;
    insert into public.catalog_inquiry_reports(inquiry_id,reporter_user_id,reason)
      values(p_id,actor,clean_reason)
      on conflict(inquiry_id,reporter_user_id) do nothing;
    update public.catalog_inquiries set status = 'reported' where id = p_id;
    return true;
  end if;
  return false;
end;
$$;
revoke all on function public.manage_profile_contact(uuid,text,text) from public,anon,authenticated;
grant execute on function public.manage_profile_contact(uuid,text,text) to authenticated;

comment on table public.catalog_inquiry_reports is
  'Participant reports for private catalog/profile contacts. No message is public.';
comment on column public.catalog_inquiries.response_message is
  'Single recipient response for Contacto Operativo V1; not a realtime chat thread.';

commit;
