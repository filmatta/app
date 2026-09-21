-- Operational state is independent of publication/archive. No RLS or ledger changes.
begin;
alter table public.projects add column operational_status text not null default 'active'
 check(operational_status in ('active','pending_confirmation','inactive'));
create or replace function public.save_my_networking_project(p_id uuid,p_data jsonb) returns uuid
language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); result uuid; project_slug text; req jsonb; title_value text;
begin
 if actor is null then raise exception 'Authentication required' using errcode='42501'; end if;
 if jsonb_typeof(p_data) is distinct from 'object' or exists(select 1 from jsonb_object_keys(p_data) k where k not in ('title','summary','project_type','client_name','client_type','city','work_area','shooting_schedule','economic_mode','date_window','roles','requirements','status','operational_status')) then raise exception 'Invalid project' using errcode='22023'; end if;
 title_value:=btrim(p_data->>'title');req:=p_data->'requirements';
 if title_value is null or length(title_value) not between 1 and 160 or jsonb_typeof(p_data->'roles') is distinct from 'array' or not private.project_requirements_valid(req) or coalesce(p_data->>'status','draft') not in ('draft','archived') then raise exception 'Invalid project' using errcode='22023'; end if;
 if coalesce(p_data->>'operational_status','active') not in ('active','pending_confirmation','inactive') or jsonb_array_length(p_data->'roles') < 1 then raise exception 'Select at least one role and a valid operational status' using errcode='22023'; end if;
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
  roles=array(select distinct jsonb_array_elements_text(p_data->'roles')),requirements=req,status=coalesce(p_data->>'status','draft'),
  operational_status=coalesce(p_data->>'operational_status',operational_status)
 where id=result;
 return result;
end $$;
revoke all on function public.save_my_networking_project(uuid,jsonb) from public,anon;
grant execute on function public.save_my_networking_project(uuid,jsonb) to authenticated;
create or replace function public.get_my_network_notifications(p_page integer default 1) returns jsonb
language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null then raise exception 'Authentication required' using errcode='42501';end if;
 perform public.refresh_my_contact_requests();
 return coalesce((select jsonb_agg(to_jsonb(x)) from (
  select n.id,n.type,n.created_at,n.read_at,coalesce(p.display_name,'Un miembro de FILMATTA') actor_name,
   case when n.type <> 'contact_request_expiring' then p.presentation->>'portrait_media_id' end portrait_media_id,
   case when n.type <> 'contact_request_expiring' then p.presentation->>'portrait_url' end portrait_url,
   n.actor_user_id is not null and n.type <> 'contact_request_expiring' as has_actor,
   case when q.sender_id=auth.uid() or q.recipient_id=auth.uid() then q.project_snapshot->>'title' end project_title,
   case when n.entity_type='contact_request' then '/cuenta/contactos/'||n.entity_id::text
    when p.slug is not null then '/perfiles/'||p.slug else '/mi-red' end href
  from public.notifications n left join public.professional_profiles p on p.user_id=n.actor_user_id and p.is_public
  left join public.catalog_inquiries q on n.entity_type='contact_request' and q.id=n.entity_id
  where n.user_id=auth.uid() order by n.created_at desc,n.id limit 25 offset (greatest(1,least(coalesce(p_page,1),1000))-1)*24
 ) x),'[]'::jsonb);
end $$;
revoke all on function public.get_my_network_notifications(integer) from public,anon;
grant execute on function public.get_my_network_notifications(integer) to authenticated;
commit;
