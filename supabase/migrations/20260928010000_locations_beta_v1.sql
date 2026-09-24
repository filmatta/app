begin;

alter table public.locations
  add column characteristics jsonb not null default '{}'::jsonb,
  add column shooting_conditions jsonb not null default '{}'::jsonb,
  add column tour_video_url text,
  add column operational_notes text;

alter table public.locations drop constraint locations_price_fields_check;
alter table public.locations add constraint locations_price_fields_check check (
  (price_amount is null and price_currency is null and price_unit is null)
  or (
    price_amount is not null and price_currency ~ '^[A-Z]{3}$'
    and price_unit in ('hour', 'half_day', 'day', 'project')
  )
);

create function private.location_characteristics_valid(value jsonb)
returns boolean language sql immutable set search_path = '' as $$
  select jsonb_typeof(value) = 'object'
    and not exists (
      select 1 from jsonb_object_keys(value) as key
      where key not in (
        'surface_m2','ceiling_height_m','declared_capacity','natural_light','blackout',
        'bathrooms','kitchen','dressing_room','makeup_wardrobe','loading_access',
        'street_level','freight_elevator','parking','wifi','climate_control','water_showers',
        'storage','garden_patio','rooftop','pool','cyclorama','sound_insulation',
        'exterior_noise','accessibility','electrical_supply'
      )
    )
    and not exists (
      select 1 from jsonb_each(value) entry
      where case
        when entry.key in ('surface_m2','ceiling_height_m','declared_capacity') then
          jsonb_typeof(entry.value) <> 'number' or (entry.value #>> '{}')::numeric < 0
        when entry.key in (
          'natural_light','blackout','bathrooms','kitchen','dressing_room','makeup_wardrobe',
          'loading_access','street_level','freight_elevator','parking','wifi','climate_control',
          'water_showers','storage','garden_patio','rooftop','pool','cyclorama','sound_insulation'
        ) then jsonb_typeof(entry.value) <> 'boolean'
        else jsonb_typeof(entry.value) <> 'string' or char_length(entry.value #>> '{}') > 1000
      end
    );
$$;

create function private.location_conditions_valid(value jsonb)
returns boolean language sql immutable set search_path = '' as $$
  select jsonb_typeof(value) = 'object'
    and not exists (
      select 1 from jsonb_each_text(value) entry
      where entry.value not in ('yes','consult','no')
        or entry.key not in (
          'day_shoots','night_shoots','dawn_shoots','weekends','holidays','over_eight_hours','consecutive_days','early_setup','late_strike','crew_up_to_5','crew_6_to_15','crew_over_15','large_extras','audience','events',
          'light_equipment','dolly_sliders','large_lighting','grip_stands','cranes_jib','heavy_equipment','set_design','temporary_backdrops','production_furniture','external_generator',
          'temporary_decor','rearrange_furniture','remove_furniture','temporary_paint','permanent_paint','drill_walls','wall_ceiling_mounts','tapes_adhesives','cover_windows','blackout_space','modify_signage',
          'haze','stage_fog','simulated_rain','indoor_water','soil_sand','stage_dust','confetti','artificial_snow','stage_liquids','candles','controlled_flame','pyrotechnics','practical_effects','prop_weapons',
          'direct_sound','moderate_music','loud_music','instruments','drums','playback','loud_scenes','night_noise',
          'cars_inside','motorcycles','bicycles','equipment_vans','trucks','production_parking','picture_vehicles','driving_scene','indoor_engines',
          'cats_dogs','other_pets','farm_animals','horses','trained_animals','minors','babies','school_groups','makeup_area_use','wardrobe_area_use','catering','food_consumption','drink_consumption','kitchen_use','food_refrigeration',
          'facade','garden_patio','rooftop','balconies','work_at_height','drones','night_exterior_lighting','access_area_setup',
          'photography','advertising','music_videos','films','series','documentaries','social_media','corporate','student','live_streaming','horror','simulated_violence','intimacy','nudity','political_content','religious_content','alcohol_scene','simulated_tobacco'
        )
    );
$$;

alter table public.locations
  add constraint locations_beta_v1_characteristics_check check (private.location_characteristics_valid(characteristics)),
  add constraint locations_beta_v1_conditions_check check (private.location_conditions_valid(shooting_conditions)),
  add constraint locations_beta_v1_video_check check (
    tour_video_url is null or (
      tour_video_url = btrim(tour_video_url) and char_length(tour_video_url) <= 500
      and tour_video_url ~ '^https://(www\.)?(youtube\.com/watch\?v=[A-Za-z0-9_-]{11}|vimeo\.com/[0-9]{1,15}(/[A-Za-z0-9]{1,64})?)$'
    )
  ),
  add constraint locations_beta_v1_operational_notes_check check (
    operational_notes is null or (operational_notes ~ '[^[:space:]]' and char_length(operational_notes) <= 5000)
  );

create table public.location_public_contacts (
  location_id uuid primary key,
  owner_id uuid not null,
  email text,
  phone text,
  whatsapp text,
  website text,
  is_public boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint location_public_contacts_location_owner_fk foreign key(location_id, owner_id)
    references public.locations(id, owner_id) on update restrict on delete cascade,
  constraint location_public_contacts_channel_check check (
    email is not null or phone is not null or whatsapp is not null or website is not null
  ),
  constraint location_public_contacts_email_check check (
    email is null or (char_length(email) <= 254 and email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$')
  ),
  constraint location_public_contacts_phone_check check (
    phone is null or (char_length(phone) between 7 and 40 and phone ~ '^\+?[0-9 ()-]+$')
  ),
  constraint location_public_contacts_whatsapp_check check (
    whatsapp is null or (char_length(whatsapp) between 7 and 20 and whatsapp ~ '^\+?[1-9][0-9]+$')
  ),
  constraint location_public_contacts_website_check check (
    website is null or (char_length(website) <= 500 and website ~ '^https://[^[:space:]@]+$')
  )
);

create trigger location_public_contacts_set_timestamps before insert or update on public.location_public_contacts
for each row execute function private.set_vertical_foundation_timestamps();

alter table public.location_public_contacts enable row level security;
revoke all on public.location_public_contacts from public, anon, authenticated;
grant select, insert, update, delete on public.location_public_contacts to authenticated;
create policy location_public_contacts_owner_all on public.location_public_contacts for all to authenticated
  using ((select auth.uid()) = owner_id) with check ((select auth.uid()) = owner_id);
create policy location_public_contacts_admin_all on public.location_public_contacts for all to authenticated
  using ((select private.is_admin())) with check ((select private.is_admin()));

-- Public catalog access moves to explicit projections. This prevents direct reads of
-- owner_id, storage_path, unpublished contact channels, and future private columns.
drop policy locations_public_read on public.locations;
drop policy location_photos_public_read on public.location_photos;
revoke select on public.locations, public.location_photos from anon;

create function public.list_public_locations(
  p_query text default null,
  p_city text default null,
  p_environment text default null,
  p_limit integer default 25,
  p_offset integer default 0
) returns table (
  id uuid, title text, slug text, summary text, city text, area text, space_type text,
  environment text, price_amount numeric, price_currency text, price_unit text,
  published_at timestamptz, photos jsonb
)
language sql stable security definer set search_path = '' as $$
  select l.id,l.title,l.slug,l.summary,l.city,l.area,l.space_type,l.environment,
    l.price_amount,l.price_currency,l.price_unit,l.published_at,
    coalesce((select jsonb_agg(jsonb_build_object('id',p.id,'image_url',p.image_url,'alt_text',p.alt_text) order by p.sort_order,p.id)
      from (select p.* from public.location_photos p where p.location_id=l.id and p.status='published' order by p.sort_order,p.id limit 1) p),'[]'::jsonb)
  from public.locations l
  where l.status='published'
    and (nullif(btrim(p_query),'') is null or l.title ilike '%'||replace(replace(replace(btrim(p_query),'\','\\'),'%','\%'),'_','\_')||'%' escape '\')
    and (nullif(btrim(p_city),'') is null or l.city ilike '%'||replace(replace(replace(btrim(p_city),'\','\\'),'%','\%'),'_','\_')||'%' escape '\')
    and (p_environment is null or p_environment='' or l.environment=p_environment)
  order by l.published_at desc,l.id
  limit least(greatest(p_limit,1),51) offset greatest(p_offset,0);
$$;

create function public.get_public_location(p_slug text) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'id',l.id,'title',l.title,'slug',l.slug,'summary',l.summary,'description',l.description,
    'city',l.city,'area',l.area,'space_type',l.space_type,'environment',l.environment,
    'price_amount',l.price_amount,'price_currency',l.price_currency,'price_unit',l.price_unit,
    'restrictions',l.restrictions,'characteristics',l.characteristics,
    'shooting_conditions',l.shooting_conditions,'tour_video_url',l.tour_video_url,
    'operational_notes',l.operational_notes,'published_at',l.published_at,
    'photos',coalesce((select jsonb_agg(jsonb_build_object('id',p.id,'image_url',p.image_url,'alt_text',p.alt_text) order by p.sort_order,p.id)
      from public.location_photos p where p.location_id=l.id and p.status='published'),'[]'::jsonb),
    'contact',(select case when c.is_public then jsonb_build_object('email',c.email,'phone',c.phone,'whatsapp',c.whatsapp,'website',c.website) else null end
      from public.location_public_contacts c where c.location_id=l.id)
  ) from public.locations l where l.slug=p_slug and l.status='published';
$$;

revoke all on function private.location_characteristics_valid(jsonb), private.location_conditions_valid(jsonb) from public, anon, authenticated;
grant execute on function private.location_characteristics_valid(jsonb), private.location_conditions_valid(jsonb) to authenticated;
revoke all on function public.list_public_locations(text,text,text,integer,integer), public.get_public_location(text) from public;
grant execute on function public.list_public_locations(text,text,text,integer,integer), public.get_public_location(text) to anon, authenticated;

comment on table public.location_public_contacts is 'Explicit, location-specific contact channels. Public projection includes only rows opted in by the owner.';
comment on column public.locations.shooting_conditions is 'Public answers explicitly declared by the owner; omitted keys mean unspecified.';

commit;
