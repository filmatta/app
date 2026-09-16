begin;

-- Public projection only. Keep owner-only table RLS and existing detail/save RPCs.
create function public.list_public_professional_profiles(
  p_page integer default 1,
  p_discipline text default '',
  p_city text default '',
  p_availability text default '',
  p_talent boolean default false
)
returns table (
  slug text, display_name text, disciplines text[], city text, bio text,
  availability text, updated_at timestamptz
)
language sql stable security definer set search_path = ''
as $$
  select p.slug, p.display_name, p.disciplines, p.city, p.bio, p.availability, p.updated_at
  from public.professional_profiles p
  where p.is_public
    and (coalesce(p_discipline, '') = '' or left(p_discipline, 80) = any(p.disciplines))
    and (coalesce(p_city, '') = '' or position(lower(left(p_city, 80)) in lower(p.city)) > 0)
    and (coalesce(p_availability, '') = '' or p.availability = p_availability)
    and (not coalesce(p_talent, false) or p.disciplines && array['Actuación', 'Modelaje']::text[])
  order by p.updated_at desc, p.slug asc
  limit 25 offset ((greatest(1, least(coalesce(p_page, 1), 1000)) - 1) * 24);
$$;

revoke all on function public.list_public_professional_profiles(integer,text,text,text,boolean) from public, anon, authenticated;
grant execute on function public.list_public_professional_profiles(integer,text,text,text,boolean) to anon, authenticated;

create index professional_profiles_public_catalog_order_idx
  on public.professional_profiles (updated_at desc, slug asc) where is_public;
create index professional_profiles_public_disciplines_idx
  on public.professional_profiles using gin (disciplines) where is_public;

commit;
