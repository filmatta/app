-- Additive presentation on the existing identity. Existing RLS is unchanged.
begin;
alter table public.professional_profiles add column presentation jsonb not null default
  '{"portrait_url":"","stage_name":"","work_area":"","rate_range":"","book":[],"credits":[]}';

create function private.profile_presentation_is_valid(p jsonb)
returns boolean language plpgsql immutable set search_path = '' as $$
declare item jsonb; k text;
begin
  if jsonb_typeof(p) is distinct from 'object' then return false; end if;
  if exists(select 1 from jsonb_object_keys(p) key where key not in ('portrait_url','stage_name','work_area','rate_range','book','credits')) then return false; end if;
  foreach k in array array['portrait_url','stage_name','work_area','rate_range'] loop
    if jsonb_typeof(p->k) is distinct from 'string' then return false; end if;
  end loop;
  if length(p->>'portrait_url') > 500 or length(p->>'stage_name') > 80
     or length(p->>'work_area') > 80 or length(p->>'rate_range') > 100 then return false; end if;
  if p->>'portrait_url' <> '' and p->>'portrait_url' !~ '^https://[^/@[:space:]]+([/?#]|$)' then return false; end if;
  if jsonb_typeof(p->'book') is distinct from 'array' or jsonb_typeof(p->'credits') is distinct from 'array' then return false; end if;
  if jsonb_array_length(p->'book') > 6 or jsonb_array_length(p->'credits') > 12 then return false; end if;
  for item in select value from jsonb_array_elements(p->'book') loop
    if jsonb_typeof(item) is distinct from 'object' then return false; end if;
    if exists(select 1 from jsonb_object_keys(item) key where key not in ('url','caption')) then return false; end if;
    if jsonb_typeof(item->'url') is distinct from 'string' or jsonb_typeof(item->'caption') is distinct from 'string' then return false; end if;
    if length(item->>'url') > 500 or item->>'url' !~ '^https://[^/@[:space:]]+([/?#]|$)' or length(item->>'caption') > 120 then return false; end if;
  end loop;
  for item in select value from jsonb_array_elements(p->'credits') loop
    if jsonb_typeof(item) is distinct from 'object' then return false; end if;
    if exists(select 1 from jsonb_object_keys(item) key where key not in ('title','role','year')) then return false; end if;
    if jsonb_typeof(item->'title') is distinct from 'string' or jsonb_typeof(item->'role') is distinct from 'string' or jsonb_typeof(item->'year') is distinct from 'string' then return false; end if;
    if length(btrim(item->>'title')) not between 1 and 100 or length(btrim(item->>'role')) not between 1 and 80 or item->>'year' !~ '^(|19[0-9]{2}|20[0-9]{2})$' then return false; end if;
  end loop;
  return true;
end $$;
alter table public.professional_profiles add constraint professional_profiles_presentation_check check(private.profile_presentation_is_valid(presentation));
revoke all on function private.profile_presentation_is_valid(jsonb) from public,anon,authenticated;

-- Atomic wrapper reuses the existing save implementation, identity and validation.
create function public.save_my_professional_portfolio(
  p_disciplines text[], p_city text, p_bio text, p_availability text,
  p_skills text[], p_equipment text[], p_portfolio_items jsonb,
  p_is_public boolean, p_contact_policy text, p_presentation jsonb
) returns text language plpgsql security definer set search_path = '' as $$
declare result text;
begin
  if (select auth.uid()) is null then raise exception 'Authentication required' using errcode='42501'; end if;
  if not private.profile_presentation_is_valid(p_presentation) then raise exception 'Invalid presentation' using errcode='22023'; end if;
  result := public.save_my_professional_profile(p_disciplines,p_city,p_bio,p_availability,p_skills,p_equipment,p_portfolio_items,p_is_public,p_contact_policy);
  update public.professional_profiles set presentation=p_presentation where user_id=(select auth.uid());
  return result;
end $$;
revoke all on function public.save_my_professional_portfolio(text[],text,text,text,text[],text[],jsonb,boolean,text,jsonb) from public,anon,authenticated;
grant execute on function public.save_my_professional_portfolio(text[],text,text,text,text[],text[],jsonb,boolean,text,jsonb) to authenticated;

-- Keep previous RPC contracts intact for existing consumers.
create function public.get_public_professional_portfolio(p_slug text)
returns table(slug text,display_name text,disciplines text[],city text,bio text,availability text,
  skills text[],equipment text[],portfolio_items jsonb,contact_policy text,is_public boolean,updated_at timestamptz,presentation jsonb)
language sql stable security definer set search_path='' as $$
  select p.slug,p.display_name,p.disciplines,p.city,p.bio,p.availability,p.skills,p.equipment,
    p.portfolio_items,p.contact_policy,p.is_public,p.updated_at,p.presentation
  from public.professional_profiles p where p.slug=p_slug and p.is_public limit 1;
$$;
revoke all on function public.get_public_professional_portfolio(text) from public,anon,authenticated;
grant execute on function public.get_public_professional_portfolio(text) to anon,authenticated;

create function public.list_public_professional_portfolios(
  p_page integer default 1,p_discipline text default '',p_city text default '',
  p_availability text default '',p_talent boolean default false)
returns table(slug text,display_name text,disciplines text[],city text,bio text,availability text,updated_at timestamptz,portfolio_items jsonb,presentation jsonb)
language sql stable security definer set search_path='' as $$
  select p.slug,p.display_name,p.disciplines,p.city,p.bio,p.availability,p.updated_at,
    p.portfolio_items,jsonb_build_object('portrait_url',p.presentation->'portrait_url','stage_name',p.presentation->'stage_name',
      'work_area',p.presentation->'work_area','rate_range','','book',p.presentation->'book','credits','[]'::jsonb)
  from public.list_public_professional_profiles(p_page,p_discipline,p_city,p_availability,p_talent) summary
  join public.professional_profiles p on p.slug=summary.slug and p.is_public
  order by p.updated_at desc,p.slug asc;
$$;
revoke all on function public.list_public_professional_portfolios(integer,text,text,text,boolean) from public,anon,authenticated;
grant execute on function public.list_public_professional_portfolios(integer,text,text,text,boolean) to anon,authenticated;
commit;
