-- Extend the historical Projects identity. Existing Opportunities/Jobs are preserved.
begin;
alter table public.projects
 add column networking_private boolean not null default false,
 add column project_type text not null default 'Otro',
 add column client_name text not null default '',
 add column client_type text not null default 'Otro',
 add column city text not null default '',
 add column work_area text not null default '',
 add column shooting_schedule text not null default 'day',
 add column economic_mode text not null default 'undecided',
 add column date_window text not null default '',
 add column roles text[] not null default '{}',
 add column requirements jsonb not null default '{"themes":[],"participation":[],"conditions":[]}',
 add constraint projects_v0_fields check (
   project_type in ('Cortometraje','Largometraje','Series','Documental','Publicidad','Videoclip','Contenido digital','Eventos','Fotografía','Live session','Otro')
   and client_type in ('Artista','Marca','Agencia','Productora','Proyecto personal','Institución','Otro')
   and length(client_name)<=120 and length(city)<=80 and length(work_area)<=80 and length(date_window)<=100
   and shooting_schedule in ('day','night','mixed') and economic_mode in ('paid','collaboration','undecided')
   and cardinality(roles)<=16 and roles<@array['Dirección','Producción','Dirección de fotografía','Cámara','Iluminación','Sonido','Dirección de arte','Edición','Color','VFX','Animación','Actuación','Modelaje','Guion','Música','Foto fija']::text[]
   and (not networking_private or status in ('draft','archived'))
 );
create function private.project_requirements_valid(v jsonb) returns boolean
language plpgsql immutable security definer set search_path='' as $$
declare g text; p jsonb:='{"formats":[],"open_formats":false}';
begin
 if jsonb_typeof(v) is distinct from 'object' or exists(select 1 from jsonb_object_keys(v) k where k not in ('themes','participation','conditions')) then return false; end if;
 foreach g in array array['themes','participation','conditions'] loop
  if jsonb_typeof(v->g) is distinct from 'array' or jsonb_array_length(v->g)>10 then return false; end if;
  if exists(select 1 from jsonb_array_elements(v->g) x where jsonb_typeof(x)<>'string') then return false; end if;
  p:=p||jsonb_build_object(g,coalesce((select jsonb_object_agg(x,'accept') from jsonb_array_elements_text(v->g) x),'{}'::jsonb));
 end loop;
 return private.project_preferences_valid(p);
end $$;
revoke all on function private.project_requirements_valid(jsonb) from public,anon,authenticated;
grant execute on function private.project_requirements_valid(jsonb) to authenticated;
alter table public.projects add constraint projects_requirements_valid check(private.project_requirements_valid(requirements));
alter policy projects_public_read on public.projects using(status='published' and not networking_private);
create function private.keep_project_identity() returns trigger language plpgsql set search_path='' as $$
begin
 if old.networking_private and (new.owner_id<>old.owner_id or new.slug<>old.slug or new.networking_private<>old.networking_private) then
  raise exception 'Project identity is immutable' using errcode='42501';
 end if;return new;
end $$;
revoke all on function private.keep_project_identity() from public,anon,authenticated;
create trigger projects_keep_identity before update on public.projects for each row execute function private.keep_project_identity();

create function public.save_my_networking_project(p_id uuid,p_data jsonb) returns uuid
language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); result uuid; project_slug text; req jsonb; title_value text;
begin
 if actor is null then raise exception 'Authentication required' using errcode='42501'; end if;
 if jsonb_typeof(p_data) is distinct from 'object' or exists(select 1 from jsonb_object_keys(p_data) k where k not in ('title','summary','project_type','client_name','client_type','city','work_area','shooting_schedule','economic_mode','date_window','roles','requirements','status')) then raise exception 'Invalid project' using errcode='22023'; end if;
 title_value:=btrim(p_data->>'title');req:=p_data->'requirements';
 if title_value is null or length(title_value) not between 1 and 160 or jsonb_typeof(p_data->'roles') is distinct from 'array' or not private.project_requirements_valid(req) or coalesce(p_data->>'status','draft') not in ('draft','archived') then raise exception 'Invalid project' using errcode='22023'; end if;
 -- Shared preference key: a night/mixed schedule explicitly requires night work.
 if p_data->>'shooting_schedule' in ('night','mixed') and not (req->'conditions' ? 'night') then
  req:=jsonb_set(req,'{conditions}',(req->'conditions')||'"night"'::jsonb);
 end if;
 perform pg_advisory_xact_lock(hashtextextended(actor::text,0));
 if p_id is null then
  if (select count(*) from public.projects where owner_id=actor and networking_private and status<>'archived')>=50 then raise exception 'Project limit' using errcode='22023'; end if;
  result:=gen_random_uuid();
  project_slug:=left(trim(both '-' from regexp_replace(lower(translate(title_value,'ÁÉÍÓÚÜÑáéíóúüñ','AEIOUUNaeiouun')),'[^a-z0-9]+','-','g')),100);
  if project_slug='' then project_slug:='proyecto';end if;
  insert into public.projects(id,owner_id,title,slug,networking_private) values(result,actor,title_value,project_slug||'-'||left(result::text,8),true);
 else
  select id into result from public.projects where id=p_id and owner_id=actor and networking_private for update;
  if result is null then raise exception 'Project unavailable' using errcode='42501'; end if;
 end if;
 update public.projects set title=title_value,summary=nullif(btrim(p_data->>'summary'),''),
  project_type=p_data->>'project_type',client_name=btrim(coalesce(p_data->>'client_name','')),client_type=p_data->>'client_type',
  city=btrim(coalesce(p_data->>'city','')),work_area=btrim(coalesce(p_data->>'work_area','')),
  shooting_schedule=p_data->>'shooting_schedule',economic_mode=p_data->>'economic_mode',date_window=btrim(coalesce(p_data->>'date_window','')),
  roles=array(select distinct jsonb_array_elements_text(p_data->'roles')),requirements=req,status=coalesce(p_data->>'status','draft')
 where id=result;
 return result;
end $$;
revoke all on function public.save_my_networking_project(uuid,jsonb) from public,anon;
grant execute on function public.save_my_networking_project(uuid,jsonb) to authenticated;

alter table public.profile_private_settings
 add column contact_email text not null default '' check(contact_email='' or (length(contact_email)<=254 and contact_email ~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$')),
 add column phone_e164 text not null default '' check(phone_e164='' or phone_e164 ~ '^[+][1-9][0-9]{6,14}$'),
 add column share_instagram boolean not null default false,
 add column share_whatsapp boolean not null default false,
 add column share_email boolean not null default false,
 add column share_phone boolean not null default false;
create function public.save_my_contact_channels(p_data jsonb) returns void
language plpgsql security definer set search_path='' as $$
declare k text;
begin
 if auth.uid() is null then raise exception 'Authentication required' using errcode='42501';end if;
 if jsonb_typeof(p_data) is distinct from 'object' or exists(select 1 from jsonb_object_keys(p_data) x where x not in ('instagram_username','whatsapp_e164','preferred_contact','contact_visibility','contact_email','phone_e164','share_instagram','share_whatsapp','share_email','share_phone')) then raise exception 'Invalid contact' using errcode='22023';end if;
 foreach k in array array['share_instagram','share_whatsapp','share_email','share_phone'] loop
  if jsonb_typeof(p_data->k) is distinct from 'boolean' then raise exception 'Invalid sharing consent' using errcode='22023';end if;
 end loop;
 perform public.save_my_private_contact(jsonb_build_object('instagram_username',p_data->'instagram_username','whatsapp_e164',p_data->'whatsapp_e164','preferred_contact',p_data->'preferred_contact','contact_visibility','private'));
 update public.profile_private_settings set contact_email=btrim(coalesce(p_data->>'contact_email','')),phone_e164=coalesce(p_data->>'phone_e164',''),
  share_instagram=(p_data->>'share_instagram')::boolean,share_whatsapp=(p_data->>'share_whatsapp')::boolean,
  share_email=(p_data->>'share_email')::boolean,share_phone=(p_data->>'share_phone')::boolean,updated_at=now()
 where owner_id=auth.uid();
end $$;
revoke all on function public.save_my_contact_channels(jsonb) from public,anon;
grant execute on function public.save_my_contact_channels(jsonb) to authenticated;
commit;
