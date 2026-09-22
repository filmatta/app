-- Nine-step activation. Preserve prior confirmed progress and historical identity values.
-- Existing media storage, identity-image lifecycle and publication policies are reused.
begin;
alter table public.profile_private_settings drop constraint profile_private_settings_onboarding_step_check;
alter table public.profile_private_settings add constraint profile_private_settings_onboarding_step_check check(onboarding_step between 1 and 9);
update public.profile_private_settings set onboarding_step=case onboarding_step when 4 then 5 when 5 then 6 when 6 then 7 when 7 then 9 else onboarding_step end;
-- New RPC leaves the prior RPC available to older clients; no public projection additions.
create function public.save_my_profile_activation_step(p_step integer,p_patch jsonb)
returns void language plpgsql security definer set search_path='' as $$
declare s public.profile_private_settings; p public.professional_profiles; d text[]; allowed text[]; v text; result text;
begin
 if auth.uid() is null then raise exception 'Authentication required' using errcode='42501'; end if;
 if p_step is null or p_step not between 1 and 9 or jsonb_typeof(p_patch) is distinct from 'object' then raise exception 'Invalid step' using errcode='22023'; end if;
 insert into public.profile_private_settings(owner_id) values(auth.uid()) on conflict do nothing;
 select * into s from public.profile_private_settings where owner_id=auth.uid() for update;
 select * into p from public.professional_profiles where user_id=auth.uid() for update;
 if p_step>s.onboarding_step then raise exception 'Complete previous step' using errcode='22023'; end if;
 allowed:=case p_step when 1 then array['name'] when 2 then array['disciplines'] when 4 then array['city','work_area'] when 5 then array['bio'] when 6 then array['availability'] when 7 then array['conditions','formats'] when 9 then array['publish'] else array[]::text[] end;
 if exists(select 1 from jsonb_object_keys(p_patch) k where not(k=any(allowed))) then raise exception 'Invalid patch' using errcode='22023'; end if;
 if p_step=1 then
  if jsonb_typeof(p_patch->'name') is distinct from 'string' or length(btrim(p_patch->>'name')) not between 1 and 80 then raise exception 'Name required' using errcode='22023'; end if;
  update public.profile_private_settings set onboarding_identity=onboarding_identity||jsonb_build_object('name',btrim(p_patch->>'name')) where owner_id=auth.uid();
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
  if p_step=4 then
   if jsonb_typeof(p_patch->'city') is distinct from 'string' or length(btrim(p_patch->>'city')) not between 1 and 80 then raise exception 'City required' using errcode='22023'; end if;
   if p_patch ? 'work_area' and (jsonb_typeof(p_patch->'work_area') is distinct from 'string' or length(p_patch->>'work_area')>80) then raise exception 'Invalid area' using errcode='22023'; end if;
   update public.professional_profiles set city=btrim(p_patch->>'city'),presentation=case when p_patch ? 'work_area' then jsonb_set(presentation,'{work_area}',to_jsonb(btrim(p_patch->>'work_area'))) else presentation end where user_id=auth.uid();
  elsif p_step=5 and p_patch ? 'bio' then
   if jsonb_typeof(p_patch->'bio') is distinct from 'string' or length(p_patch->>'bio')>1200 then raise exception 'Invalid bio' using errcode='22023'; end if;
   update public.professional_profiles set bio=nullif(btrim(p_patch->>'bio'),'') where user_id=auth.uid();
  elsif p_step=6 then
   if coalesce(p_patch->>'availability','') not in ('available','limited','unavailable') then raise exception 'Availability required' using errcode='22023'; end if;
   update public.professional_profiles set availability=p_patch->>'availability' where user_id=auth.uid();
  elsif p_step=7 then
   if p_patch ? 'conditions' then
    if jsonb_typeof(p_patch->'conditions') is distinct from 'object' then raise exception 'Invalid conditions' using errcode='22023'; end if;
    for v in select jsonb_object_keys(p_patch->'conditions') loop
     if v<>all(array['action','prop_weapons','water_heights','animals','night','travel']) or jsonb_typeof(p_patch->'conditions'->v) is distinct from 'string' or p_patch->'conditions'->>v not in ('accept','unspecified') then raise exception 'Invalid quick preference' using errcode='22023'; end if;
    end loop;
    s.project_preferences:=jsonb_set(s.project_preferences,'{conditions}',coalesce(s.project_preferences->'conditions','{}')||(p_patch->'conditions'));
   end if;
   if p_patch ? 'formats' then s.project_preferences:=jsonb_set(s.project_preferences,'{formats}',p_patch->'formats'); end if;
   perform public.save_my_project_preferences_visibility(s.project_preferences,s.publish_project_preferences);
  elsif p_step=9 then
   if p_patch->'publish' is distinct from 'true'::jsonb then raise exception 'Explicit publication required' using errcode='22023'; end if;
  end if;
 end if;
 if p_step>=8 then
  select * into p from public.professional_profiles where user_id=auth.uid();
  if nullif(btrim(p.presentation->>'stage_name'),'') is null or cardinality(p.disciplines)<1 or p.city is null or p.availability='not_specified' then raise exception 'Minimum profile required' using errcode='22023'; end if;
  if p_step=9 then update public.professional_profiles set is_public=true where user_id=auth.uid(); end if;
 end if;
 update public.profile_private_settings set onboarding_started_at=coalesce(onboarding_started_at,now()),
  onboarding_completed_at=case when p_step>=8 then coalesce(onboarding_completed_at,now()) else onboarding_completed_at end,
  onboarding_step=greatest(onboarding_step,least(9,p_step+1)),updated_at=now() where owner_id=auth.uid();
end $$;
revoke all on function public.save_my_profile_activation_step(integer,jsonb) from public,anon;
grant execute on function public.save_my_profile_activation_step(integer,jsonb) to authenticated;

commit;
