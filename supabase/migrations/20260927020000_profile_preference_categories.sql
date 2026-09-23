-- Extend the existing project-preferences JSON contract without changing historical keys or values.
begin;

create or replace function private.project_preferences_valid(p jsonb)
returns boolean language plpgsql immutable set search_path='' as $$
declare group_key text; field_key text; choice text; allowed text[];
begin
 if jsonb_typeof(p) is distinct from 'object' then return false; end if;
 if exists(select 1 from jsonb_object_keys(p) k where k not in ('formats','open_formats','themes','participation','conditions')) then return false; end if;
 if jsonb_typeof(p->'formats') is distinct from 'array' or jsonb_typeof(p->'open_formats') is distinct from 'boolean' then return false; end if;
 if jsonb_array_length(p->'formats')>12 or exists(
  select 1 from jsonb_array_elements(p->'formats') f
  where jsonb_typeof(f)<>'string' or f#>>'{}' not in (
   'Cortometraje','Largometraje','Series','Documental','Publicidad','Videoclip',
   'Contenido digital','Institucional','Educativo','Proyecto estudiantil','Eventos','Fotografía'
  )
 ) then return false; end if;
 if (select count(distinct value) from jsonb_array_elements(p->'formats'))<>jsonb_array_length(p->'formats') then return false; end if;
 foreach group_key in array array['themes','participation','conditions'] loop
  if jsonb_typeof(p->group_key) is distinct from 'object' then return false; end if;
  allowed:=case group_key
   when 'themes' then array['romance','comedy','drama','horror','violence','gore']
   when 'participation' then array[
    'kissing','contact','intimacy_without_contact','intimacy_with_contact','partial_nudity','nudity',
    'dialogue_roles','non_dialogue_roles','brief_appearances','recurring_roles','background_extra','script_readings','camera_rehearsals','stand_in',
    'camera_presenting','interview_hosting','event_hosting','product_demos','camera_tutorials','live_streaming','ad_performance','ugc_brand_content','institutional_content',
    'editorial_photography','fashion_campaigns','catalog_ecommerce','beauty_hair','hands_product_modeling','runway','creative_photo_tests',
    'commercial_voiceover','narration','dubbing','animation_game_characters','audiobooks','onstage_singing','onstage_dance','instrument_performance','improvisation','physical_comedy','choreographed_movement','motion_capture',
    'character_haircut','temporary_hair_color','permanent_hair_color','facial_hair_shaving','grow_hair_or_beard','wigs',
    'beauty_makeup','period_makeup','special_effects_makeup','character_prosthetics','simulated_wounds','temporary_tattoos','cover_visible_tattoos',
    'period_costume','uniforms','bulky_stage_costume','masks','character_mascot_suits','special_footwear','no_makeup_appearance','major_appearance_change'
   ]
   else array[
    'action','prop_weapons','water_heights','animals','night','travel',
    'day_shoots','early_morning_calls','weekends','holidays','consecutive_days','short_notice_calls',
    'within_city','metro_area','same_day_travel','overnight_travel','other_states','international_projects','temporary_relocation',
    'onsite_work','remote_work','hybrid_work','one_off_collaborations','multiweek_projects','recurring_collaborations','paid_work','unpaid_collaboration','portfolio_exchange','revenue_share',
    'studio','location_interiors','urban_exteriors','nature','beach','mountain','industrial_spaces','boats','grounded_aircraft','in_flight','confined_spaces','filming_at_height',
    'argument_scenes','emotionally_intense_scenes','horror_scenes','real_public_interaction','minors','large_groups','simulated_rain','water_scenes','underwater_scenes','prepared_falls','scene_driving',
    'creative_development','preproduction','production','postproduction','multiple_stages','individual_work','join_existing_team','department_lead','day_reinforcement','second_unit','replacements_reliefs',
    'production_equipment','own_equipment_quote','own_studio','client_facilities','technical_advice','material_review','mentoring_workshops'
   ]
  end;
  for field_key,choice in select key,value from jsonb_each_text(p->group_key) loop
   if not field_key=any(allowed) or choice is null or choice not in ('unspecified','accept','consult','decline') then return false; end if;
  end loop;
 end loop;
 return true;
end $$;

create function public.save_my_profile_quick_preferences(p_patch jsonb)
returns void language plpgsql security definer set search_path='' as $$
declare settings public.profile_private_settings; merged jsonb; group_key text; field_key text; choice text;
begin
 if auth.uid() is null then raise exception 'Authentication required' using errcode='42501'; end if;
 if jsonb_typeof(p_patch) is distinct from 'object' or exists(
  select 1 from jsonb_object_keys(p_patch) key where key not in ('formats','themes','participation','conditions')
 ) then raise exception 'Invalid quick preferences' using errcode='22023'; end if;
 insert into public.profile_private_settings(owner_id) values(auth.uid()) on conflict do nothing;
 select * into settings from public.profile_private_settings where owner_id=auth.uid() for update;
 merged:=settings.project_preferences;
 if p_patch ? 'formats' then merged:=jsonb_set(merged,'{formats}',p_patch->'formats'); end if;
 foreach group_key in array array['themes','participation','conditions'] loop
  if p_patch ? group_key then
   if jsonb_typeof(p_patch->group_key) is distinct from 'object' then raise exception 'Invalid quick preferences' using errcode='22023'; end if;
   for field_key,choice in select key,value from jsonb_each_text(p_patch->group_key) loop
    if choice not in ('accept','unspecified') then raise exception 'Invalid quick preference' using errcode='22023'; end if;
   end loop;
   merged:=jsonb_set(merged,array[group_key],coalesce(merged->group_key,'{}'::jsonb)||(p_patch->group_key));
  end if;
 end loop;
 if not private.project_preferences_valid(merged) then raise exception 'Invalid quick preferences' using errcode='22023'; end if;
 perform public.save_my_project_preferences_visibility(merged,settings.publish_project_preferences);
end $$;

revoke all on function public.save_my_profile_quick_preferences(jsonb) from public,anon;
grant execute on function public.save_my_profile_quick_preferences(jsonb) to authenticated;

commit;
