-- Private account contacts are intentionally separate from public professional profiles.
begin;
create table public.profile_private_settings (
 owner_id uuid primary key references auth.users(id) on delete cascade,
 instagram_username text not null default '' check(instagram_username='' or (instagram_username ~ '^[a-z0-9_][a-z0-9._]{0,29}$' and instagram_username !~ '[.]$|[.][.]' and instagram_username not in ('p','reel','reels','stories','explore','accounts','direct'))),
 whatsapp_e164 text not null default '' check(whatsapp_e164='' or whatsapp_e164 ~ '^[+][1-9][0-9]{6,14}$'),
 preferred_contact text not null default 'none' check(preferred_contact in ('none','instagram','whatsapp')),
 contact_visibility text not null default 'private' check(contact_visibility='private'),
 updated_at timestamptz not null default now(),
 check((preferred_contact<>'instagram' or instagram_username<>'') and (preferred_contact<>'whatsapp' or whatsapp_e164<>''))
);
alter table public.profile_private_settings enable row level security;
revoke all on public.profile_private_settings from public,anon,authenticated;
grant select on public.profile_private_settings to authenticated;
create policy profile_private_settings_owner_read on public.profile_private_settings for select to authenticated using(owner_id=(select auth.uid()));
create function public.save_my_private_contact(p_data jsonb) returns void language plpgsql security definer set search_path='' as $$
declare ig text; wa text; pref text;
begin
 if auth.uid() is null then raise exception 'Authentication required' using errcode='42501'; end if;
 if jsonb_typeof(p_data) is distinct from 'object' then raise exception 'Invalid contact'; end if;
 if exists(select 1 from jsonb_object_keys(p_data) k where k not in ('instagram_username','whatsapp_e164','preferred_contact','contact_visibility')) or
 p_data->>'contact_visibility' is distinct from 'private' or jsonb_typeof(p_data->'instagram_username') is distinct from 'string' or jsonb_typeof(p_data->'whatsapp_e164') is distinct from 'string' or jsonb_typeof(p_data->'preferred_contact') is distinct from 'string' then raise exception 'Invalid private contact' using errcode='22023'; end if;
 ig:=p_data->>'instagram_username'; wa:=p_data->>'whatsapp_e164'; pref:=p_data->>'preferred_contact';
 if (pref='instagram' and ig='') or (pref='whatsapp' and wa='') then pref:='none'; end if;
 insert into public.profile_private_settings(owner_id,instagram_username,whatsapp_e164,preferred_contact) values(auth.uid(),ig,wa,pref)
 on conflict(owner_id) do update set instagram_username=excluded.instagram_username,whatsapp_e164=excluded.whatsapp_e164,preferred_contact=excluded.preferred_contact,updated_at=now();
end $$;
revoke all on function public.save_my_private_contact(jsonb) from public,anon;
grant execute on function public.save_my_private_contact(jsonb) to authenticated;

-- Analyze a normalized copy only. No existing biography is rewritten or rejected at migration time.
create function private.profile_bio_has_contact(p_text text) returns boolean language plpgsql immutable set search_path='' as $$
declare v text; pattern text;
begin
 v:=lower(pg_catalog.normalize(left(coalesce(p_text,''),1201),'NFKC'));
 v:=regexp_replace(v,'['||chr(8203)||'-'||chr(8207)||chr(8234)||'-'||chr(8238)||chr(8288)||'-'||chr(8303)||chr(65279)||']','','g');
 v:=translate(v,'áéíóúüñ','aeiouun');
 v:=regexp_replace(v,'[[:space:]]+',' ','g');
 v:=regexp_replace(v,'[a-z0-9._%+-]+@[a-z0-9.-]+[.][a-z]{2,63}',' correo-permitido ','g');
 foreach pattern in array array['(^|[^a-z0-9._%+-])@[a-z0-9_][a-z0-9._]*',
'(^|[^a-z0-9_])(ig|instagram)[ ]*[:=][ ]*[@a-z0-9_]',
'(^|[^a-z0-9_])(mi[ ]+)?ig[ ]+es[ ]+[@a-z0-9_]',
'(me encuentras|buscame|sigueme|contactame)[ ]+(en[ ]+)?instagram',
'mi usuario( de instagram)?[ ]+(es|:)',
'(^|[^a-z0-9_])(www[.])?instagram[.]com/[a-z0-9_.]+',
'(^|[^a-z0-9_])(wa[.]me/|api[.]whatsapp[.]com/|chat[.]whatsapp[.]com/|whatsapp://)',
'(escribeme|contactame|hablame)[ ]+(por|al|en)[ ]+whatsapp',
'whatsapp[ ]*[:=][ ]*[+0-9(]',
'(llamame[ ]+al|telefono([ ]+de[ ]+contacto)?[ ]*[:=]|contacto[ ]*[:=])[ ]*[+0-9(][+0-9() .-]{5,}',
'(^|[^a-z0-9_])arroba[ ]+[a-z0-9_]+'] loop
  if v ~ pattern then return true; end if;
 end loop;
 return false;
end $$;
revoke all on function private.profile_bio_has_contact(text) from public,anon,authenticated;
create function private.validate_profile_bio_contact() returns trigger language plpgsql security definer set search_path='' as $$
declare previous_bio text;
begin
 if tg_op='INSERT' then
  select bio into previous_bio from public.professional_profiles where user_id=new.user_id for update;
  if found and new.bio is not distinct from previous_bio then return new; end if;
 end if;
 if tg_op='UPDATE' and new.bio is not distinct from old.bio then return new; end if;
 if private.profile_bio_has_contact(new.bio) then raise exception 'BIO_CONTACT_BLOCKED' using errcode='22023'; end if;
 return new;
end $$;
revoke all on function private.validate_profile_bio_contact() from public,anon,authenticated;
create trigger professional_profile_bio_contact before insert or update of bio on public.professional_profiles for each row execute function private.validate_profile_bio_contact();
commit;
