-- Only authorized Project read projection; existing RLS and immutable snapshots remain unchanged.
begin;
alter table public.projects add column share_client_name boolean not null default false;

-- Narrow authorization derived from a real request, never caller-provided ownership.
create function private.can_view_networking_project(p_id uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select auth.uid() is not null and exists(select 1 from public.projects p
 where p.id=p_id and p.networking_private and (p.owner_id=auth.uid() or exists(
 select 1 from public.catalog_inquiries q where q.attached_project_id=p.id
 and q.sender_id=p.owner_id and q.recipient_id=auth.uid()
 and (q.request_state='accepted' or (q.request_state='pending' and q.expires_at>now())))));
$$;
revoke all on function private.can_view_networking_project(uuid) from public,anon,authenticated;
create index if not exists inquiries_project_recipient_access on public.catalog_inquiries(attached_project_id,recipient_id)
 where attached_project_id is not null and request_state in ('pending','accepted');
create function public.get_authorized_networking_project(p_slug text) returns jsonb
language plpgsql stable security definer set search_path='' as $$
begin
 if auth.uid() is null then raise exception 'Authentication required' using errcode='42501';end if;
 return (select jsonb_build_object(
 'id',p.id,'slug',p.slug,'title',p.title,'summary',p.summary,'project_type',p.project_type,
 'client_name',case when p.owner_id=auth.uid() or p.share_client_name then p.client_name else '' end,
 'share_client_name',p.share_client_name,'client_type',p.client_type,'city',p.city,'work_area',p.work_area,
 'shooting_schedule',p.shooting_schedule,'economic_mode',p.economic_mode,'date_window',p.date_window,
 'roles',p.roles,'requirements',p.requirements,'status',p.status,'operational_status',p.operational_status,
 'is_owner',p.owner_id=auth.uid(),
 'owner_name',coalesce((select coalesce(nullif(pp.presentation->>'stage_name',''),pp.display_name)
 from public.professional_profiles pp where pp.user_id=p.owner_id and pp.is_public),'Profesional de FILMATTA'))
 from public.projects p where p.slug=p_slug and private.can_view_networking_project(p.id));
end $$;
revoke all on function public.get_authorized_networking_project(text) from public,anon;
grant execute on function public.get_authorized_networking_project(text) to authenticated;
create or replace function public.save_my_networking_project(p_id uuid,p_data jsonb) returns uuid
language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); result uuid; project_slug text; req jsonb; title_value text;
begin
 if actor is null then raise exception 'Authentication required' using errcode='42501'; end if;
 if jsonb_typeof(p_data) is distinct from 'object' or exists(select 1 from jsonb_object_keys(p_data) k where k not in ('title','summary','project_type','client_name','client_type','city','work_area','shooting_schedule','economic_mode','date_window','roles','requirements','status','operational_status','share_client_name')) then raise exception 'Invalid project' using errcode='22023'; end if;
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
  share_client_name=coalesce((p_data->>'share_client_name')::boolean,share_client_name),
  operational_status=coalesce(p_data->>'operational_status',operational_status)
 where id=result;
 return result;
end $$;
revoke all on function public.save_my_networking_project(uuid,jsonb) from public,anon;
grant execute on function public.save_my_networking_project(uuid,jsonb) to authenticated;
create or replace function private.network_request_projection(i public.catalog_inquiries) returns jsonb
language sql stable security definer set search_path='' as $$
 select jsonb_build_object('id',i.id,'is_recipient',i.recipient_id=auth.uid(),'message',i.message,
  'state',i.request_state,'created_at',i.created_at,'expires_at',i.expires_at,'accepted_at',i.accepted_at,
  'contact_unlocked_at',i.contact_unlocked_at,'shared_contact_snapshot',i.shared_contact_snapshot,
  'project_snapshot',i.project_snapshot,'project_slug',(select p.slug from public.projects p where p.id=i.attached_project_id and private.can_view_networking_project(p.id)),'credit_required',coalesce(r.credit_required,false),
  'counterpart_name',coalesce(p.display_name,case when i.recipient_id=auth.uid() then i.sender_display_name end,'Miembro de FILMATTA'),
  'counterpart_slug',p.slug,'discipline',p.disciplines[1],'city',p.city,
  'portrait_media_id',p.presentation->>'portrait_media_id','portrait_url',p.presentation->>'portrait_url')
 from (values(1)) v(x)
 left join public.professional_profiles p on p.user_id=case when i.recipient_id=auth.uid() then i.sender_id else i.recipient_id end and p.is_public
 left join public.contact_credit_reservations r on r.request_id=i.id;
$$;
revoke all on function private.network_request_projection(public.catalog_inquiries) from public,anon,authenticated;
commit;
