begin;

alter table public.locations
  add column rate_mode text not null default 'legacy',
  add column rate_tiers jsonb not null default '[]'::jsonb,
  add column minimum_hours numeric(6,2);

create function private.location_attendee_pricing_valid(
  p_characteristics jsonb,
  p_mode text,
  p_tiers jsonb
) returns boolean
language plpgsql immutable set search_path = '' as $$
declare
  capacity numeric;
  tier jsonb;
  tier_count integer;
  tier_index integer := 0;
  tier_min numeric;
  tier_max numeric;
  tier_price numeric;
  tier_currency text;
  expected_min numeric := 1;
  common_currency text;
begin
  if p_mode is null or p_tiers is null
    or p_mode not in ('legacy','tiers','inquire')
    or jsonb_typeof(p_tiers) is distinct from 'array'
  then
    return false;
  end if;
  if p_mode <> 'tiers' then
    return jsonb_array_length(p_tiers) = 0;
  end if;
  if p_characteristics is null
    or jsonb_typeof(p_characteristics -> 'declared_capacity') is distinct from 'number'
  then
    return false;
  end if;
  capacity := (p_characteristics ->> 'declared_capacity')::numeric;
  if capacity < 1 or capacity > 1000000 or capacity <> trunc(capacity) then
    return false;
  end if;
  tier_count := jsonb_array_length(p_tiers);
  if tier_count < 1 or tier_count > 3 or tier_count > capacity then
    return false;
  end if;
  for tier in select value from jsonb_array_elements(p_tiers)
  loop
    tier_index := tier_index + 1;
    if jsonb_typeof(tier) is distinct from 'object'
      or (select count(*) from jsonb_object_keys(tier)) <> 4
      or exists (select 1 from jsonb_object_keys(tier) key where key not in ('min','max','price','currency'))
      or jsonb_typeof(tier -> 'min') is distinct from 'number'
      or jsonb_typeof(tier -> 'max') is distinct from 'number'
      or jsonb_typeof(tier -> 'price') is distinct from 'number'
      or jsonb_typeof(tier -> 'currency') is distinct from 'string'
    then return false;
    end if;
    tier_min := (tier ->> 'min')::numeric;
    tier_max := (tier ->> 'max')::numeric;
    tier_price := (tier ->> 'price')::numeric;
    tier_currency := tier ->> 'currency';
    if tier_min <> trunc(tier_min) or tier_max <> trunc(tier_max)
      or tier_min <> expected_min or tier_max < tier_min or tier_max > capacity
      or tier_price < 0 or tier_price > 9999999999.99 or tier_price <> round(tier_price, 2)
      or tier_currency !~ '^[A-Z]{3}$'
    then return false;
    end if;
    if common_currency is null then common_currency := tier_currency;
    elsif common_currency <> tier_currency then return false;
    end if;
    expected_min := tier_max + 1;
  end loop;
  return coalesce(expected_min = capacity + 1, false);
exception when others then
  return false;
end;
$$;

alter table public.locations
  add constraint locations_rate_mode_check check (rate_mode in ('legacy','tiers','inquire')),
  add constraint locations_minimum_hours_check check (
    minimum_hours is null or (
      minimum_hours > 0 and minimum_hours <= 1000
      and minimum_hours = round(minimum_hours, 2)
    )
  ),
  add constraint locations_attendee_pricing_check check (
    private.location_attendee_pricing_valid(characteristics, rate_mode, rate_tiers)
    and (rate_mode = 'tiers' or minimum_hours is null)
  );

revoke all on function private.location_attendee_pricing_valid(jsonb,text,jsonb) from public, anon, authenticated;

drop function public.list_public_locations(text,text,text,integer,integer);
create function public.list_public_locations(
  p_query text default null,
  p_city text default null,
  p_environment text default null,
  p_limit integer default 25,
  p_offset integer default 0
) returns table (
  id uuid,title text,slug text,summary text,city text,area text,space_type text,
  environment text,price_amount numeric,price_currency text,price_unit text,
  rate_mode text,rate_tiers jsonb,minimum_hours numeric,
  published_at timestamptz,photos jsonb
)
language sql stable security definer set search_path = '' as $$
  select l.id,l.title,l.slug,l.summary,l.city,l.area,l.space_type,l.environment,
    l.price_amount,l.price_currency,l.price_unit,l.rate_mode,l.rate_tiers,l.minimum_hours,l.published_at,
    coalesce((select jsonb_agg(jsonb_build_object('id',p.id,'image_url',p.image_url,'alt_text',p.alt_text,'managed',p.storage_path is not null) order by p.is_cover desc,p.sort_order,p.id)
      from (select p.* from public.location_photos p where p.location_id=l.id and p.status='published' and p.lifecycle_status='ready' order by p.is_cover desc,p.sort_order,p.id limit 1) p),'[]'::jsonb)
  from public.locations l
  where l.status='published'
    and (nullif(btrim(p_query),'') is null or l.title ilike '%'||replace(replace(replace(btrim(p_query),'\','\\'),'%','\%'),'_','\_')||'%' escape '\')
    and (nullif(btrim(p_city),'') is null or l.city ilike '%'||replace(replace(replace(btrim(p_city),'\','\\'),'%','\%'),'_','\_')||'%' escape '\')
    and (p_environment is null or p_environment='' or l.environment=p_environment)
  order by l.published_at desc,l.id
  limit least(greatest(p_limit,1),51) offset greatest(p_offset,0);
$$;

create or replace function public.get_public_location(p_slug text) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'id',l.id,'title',l.title,'slug',l.slug,'summary',l.summary,'description',l.description,
    'city',l.city,'area',l.area,'space_type',l.space_type,'environment',l.environment,
    'price_amount',l.price_amount,'price_currency',l.price_currency,'price_unit',l.price_unit,
    'rate_mode',l.rate_mode,'rate_tiers',l.rate_tiers,'minimum_hours',l.minimum_hours,
    'restrictions',l.restrictions,'characteristics',l.characteristics,
    'shooting_conditions',l.shooting_conditions,'tour_video_url',l.tour_video_url,
    'operational_notes',l.operational_notes,'published_at',l.published_at,
    'photos',coalesce((select jsonb_agg(jsonb_build_object('id',p.id,'image_url',p.image_url,'alt_text',p.alt_text,'managed',p.storage_path is not null) order by p.is_cover desc,p.sort_order,p.id)
      from public.location_photos p where p.location_id=l.id and p.status='published' and p.lifecycle_status='ready'),'[]'::jsonb),
    'contact_available',exists(select 1 from private.location_contact_channels c where c.location_id=l.id and c.owner_id=l.owner_id and (c.email is not null or c.phone is not null or c.whatsapp is not null or c.instagram is not null))
  ) from public.locations l where l.slug=p_slug and l.status='published';
$$;

revoke all on function public.list_public_locations(text,text,text,integer,integer) from public;
grant execute on function public.list_public_locations(text,text,text,integer,integer) to anon, authenticated;

comment on column public.locations.rate_mode is 'legacy preserves historical flat pricing; tiers publishes total hourly attendee ranges; inquire explicitly hides historical pricing.';
comment on column public.locations.rate_tiers is 'At most three consecutive attendee ranges. Prices are total per hour, never per attendee.';
comment on column public.locations.minimum_hours is 'Optional minimum booking duration for attendee-tier hourly pricing; informational only.';

commit;
