-- Activation state is private. Existing profile, publication and media policies stay intact.
begin;
alter table public.profile_private_settings
 add column onboarding_started_at timestamptz,
 add column onboarding_completed_at timestamptz,
 add column profile_tour_completed_at timestamptz,
 add column onboarding_step smallint not null default 1 check(onboarding_step between 1 and 7),
 add column onboarding_identity jsonb not null default '{}' check(jsonb_typeof(onboarding_identity)='object' and octet_length(onboarding_identity::text)<1000);

-- An atomic, owner-scoped patch, never a client-supplied full profile snapshot.
-- Step 1 is private until a discipline exists; the existing profile constraint is retained.
create function public.save_my_profile_onboarding(p_step integer,p_patch jsonb)
returns void language plpgsql security definer set search_path='' as $$
declare s public.profile_private_settings; p public.professional_profiles; d text[]; allowed text[]; v text; result text;
begin
 if auth.uid() is null then raise exception 'Authentication required' using errcode='42501'; end if;
 if p_step is null or p_step not between 1 and 7 or jsonb_typeof(p_patch) is distinct from 'object' then raise exception 'Invalid step' using errcode='22023'; end if;
 insert into public.profile_private_settings(owner_id) values(auth.uid()) on conflict do nothing;
 select * into s from public.profile_private_settings where owner_id=auth.uid() for update;
 select * into p from public.professional_profiles where user_id=auth.uid() for update;
 if p_step>s.onboarding_step then raise exception 'Complete previous step' using errcode='22023'; end if;
 allowed:=case p_step when 1 then array['name','alias'] when 2 then array['disciplines'] when 3 then array['city','work_area'] when 4 then array['bio'] when 5 then array['availability'] when 6 then array['night','travel'] else array['publish'] end;
 if exists(select 1 from jsonb_object_keys(p_patch) k where not(k=any(allowed))) then raise exception 'Invalid patch' using errcode='22023'; end if;
 if p_step=1 then
  if jsonb_typeof(p_patch->'name') is distinct from 'string' or length(btrim(p_patch->>'name')) not between 1 and 80 then raise exception 'Name required' using errcode='22023'; end if;
  if p_patch ? 'alias' and (jsonb_typeof(p_patch->'alias') is distinct from 'string' or length(p_patch->>'alias')>80) then raise exception 'Invalid alias' using errcode='22023'; end if;
  update public.profile_private_settings set onboarding_identity=jsonb_build_object('name',btrim(p_patch->>'name'),'alias',coalesce(p_patch->>'alias','')) where owner_id=auth.uid();
  if p.user_id is not null then update public.professional_profiles set presentation=jsonb_set(presentation,'{stage_name}',to_jsonb(btrim(p_patch->>'name'))) where user_id=auth.uid(); end if;
 elsif p_step=2 then
  if jsonb_typeof(p_patch->'disciplines') is distinct from 'array' then raise exception 'Discipline required' using errcode='22023'; end if;
  select array_agg(value) into d from jsonb_array_elements_text(p_patch->'disciplines');
  if coalesce(cardinality(d),0) not between 1 and 5 or exists(select 1 from unnest(d) t where t<>all(array['Dirección','Producción','Dirección de fotografía','Cámara','Iluminación','Sonido','Dirección de arte','Edición','Color','VFX','Animación','Actuación','Modelaje','Guion','Música','Foto fija']) and not(t=any(coalesce(p.disciplines,'{}')))) then raise exception 'Invalid disciplines' using errcode='22023'; end if;
  if p.user_id is null then
   if nullif(s.onboarding_identity->>'name','') is null then raise exception 'Name required' using errcode='22023'; end if;
   result:=public.save_my_professional_profile(d,null,null,'not_specified','{}','{}','[]',false,'members_only');
   update public.professional_profiles set presentation=jsonb_set(presentation,'{stage_name}',s.onboarding_identity->'name') where user_id=auth.uid();
  else update public.professional_profiles set disciplines=d where user_id=auth.uid(); end if;
 else
  if p.user_id is null then raise exception 'Profile required' using errcode='22023'; end if;
  if p_step=3 then
   if jsonb_typeof(p_patch->'city') is distinct from 'string' or length(btrim(p_patch->>'city')) not between 1 and 80 then raise exception 'City required' using errcode='22023'; end if;
   if p_patch ? 'work_area' and (jsonb_typeof(p_patch->'work_area') is distinct from 'string' or length(p_patch->>'work_area')>80) then raise exception 'Invalid area' using errcode='22023'; end if;
   update public.professional_profiles set city=btrim(p_patch->>'city'),presentation=case when p_patch ? 'work_area' then jsonb_set(presentation,'{work_area}',to_jsonb(btrim(p_patch->>'work_area'))) else presentation end where user_id=auth.uid();
  elsif p_step=4 and p_patch ? 'bio' then
   if jsonb_typeof(p_patch->'bio') is distinct from 'string' or length(p_patch->>'bio')>1200 then raise exception 'Invalid bio' using errcode='22023'; end if;
   update public.professional_profiles set bio=nullif(btrim(p_patch->>'bio'),'') where user_id=auth.uid();
  elsif p_step=5 then
   if coalesce(p_patch->>'availability','') not in ('available','limited','unavailable') then raise exception 'Availability required' using errcode='22023'; end if;
   update public.professional_profiles set availability=p_patch->>'availability' where user_id=auth.uid();
  elsif p_step=6 then
   for v in select jsonb_object_keys(p_patch) loop
    if p_patch->>v not in ('unspecified','accept','consult','decline') or jsonb_typeof(p_patch->v) is distinct from 'string' then raise exception 'Invalid preference' using errcode='22023'; end if;
   end loop;
   perform public.save_my_project_preferences_visibility(jsonb_set(s.project_preferences,'{conditions}',coalesce(s.project_preferences->'conditions','{}')||p_patch),s.publish_project_preferences);
  elsif p_step=7 then
   if p_patch->'publish' is distinct from 'true'::jsonb then raise exception 'Explicit publication required' using errcode='22023'; end if;
  end if;
 end if;
 if p_step>=6 then
  select * into p from public.professional_profiles where user_id=auth.uid();
  if nullif(btrim(p.presentation->>'stage_name'),'') is null or cardinality(p.disciplines)<1 or p.city is null or p.availability='not_specified' then raise exception 'Minimum profile required' using errcode='22023'; end if;
  if p_step=7 then update public.professional_profiles set is_public=true where user_id=auth.uid(); end if;
 end if;
 update public.profile_private_settings set onboarding_started_at=coalesce(onboarding_started_at,now()),
  onboarding_completed_at=case when p_step>=6 then coalesce(onboarding_completed_at,now()) else onboarding_completed_at end,
  onboarding_step=greatest(onboarding_step,least(7,p_step+1)),updated_at=now() where owner_id=auth.uid();
end $$;
revoke all on function public.save_my_profile_onboarding(integer,jsonb) from public,anon;
grant execute on function public.save_my_profile_onboarding(integer,jsonb) to authenticated;

create function public.finish_my_profile_tour() returns void language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null then raise exception 'Authentication required' using errcode='42501'; end if;
 insert into public.profile_private_settings(owner_id,profile_tour_completed_at) values(auth.uid(),now())
 on conflict(owner_id) do update set profile_tour_completed_at=coalesce(profile_private_settings.profile_tour_completed_at,now());
end $$;
revoke all on function public.finish_my_profile_tour() from public,anon;
grant execute on function public.finish_my_profile_tour() to authenticated;
commit;
