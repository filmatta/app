begin;

alter table public.locations
  add column country_code text,
  add column region_code text,
  add column region_name text,
  add column municipality_code text,
  add column municipality_name text,
  add column locality_code text,
  add column geography_source text,
  add column creation_key uuid;

alter table public.locations
  add constraint locations_country_code_check check (
    country_code is null or country_code ~ '^[A-Z]{2}$'
  ),
  add constraint locations_region_code_check check (
    region_code is null or region_code ~ '^[0-9]{2}$'
  ),
  add constraint locations_municipality_code_check check (
    municipality_code is null or municipality_code ~ '^[0-9]{3}$'
  ),
  add constraint locations_locality_code_check check (
    locality_code is null or locality_code ~ '^[0-9A-Z]{4}$'
  ),
  add constraint locations_geography_names_check check (
    (region_name is null or (region_name=btrim(region_name) and char_length(region_name) between 1 and 120))
    and (municipality_name is null or (municipality_name=btrim(municipality_name) and char_length(municipality_name) between 1 and 120))
  ),
  add constraint locations_geography_source_check check (
    geography_source is null or geography_source='inegi-catalogo-unico-v2'
  ),
  add constraint locations_normalized_geography_check check (
    geography_source is null
    or (
      country_code='MX'
      and region_code is not null
      and region_name is not null
      and municipality_code is not null
      and municipality_name is not null
      and locality_code is not null
    )
  );

create unique index locations_owner_creation_key_unique
  on public.locations(owner_id,creation_key)
  where creation_key is not null;

comment on column public.locations.geography_source is
  'Null preserves historical free-text geography. inegi-catalogo-unico-v2 identifies an owner-validated Mexico selection.';
comment on column public.locations.creation_key is
  'Owner-scoped idempotency key for the short location creation flow.';

commit;
