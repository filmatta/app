-- REVIEW ONLY. Apply manually after reviewing the Admin Grants Preview.
begin;

create table public.admin_plan_grants (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete restrict,
  plan text not null check (plan in ('plus', 'pro')),
  starts_at timestamptz not null default now(),
  expires_at timestamptz,
  revoked_at timestamptz,
  reason text,
  granted_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint admin_plan_grants_expiry_after_start
    check (expires_at is null or expires_at > starts_at),
  constraint admin_plan_grants_revoke_after_start
    check (revoked_at is null or revoked_at >= starts_at),
  constraint admin_plan_grants_reason_length
    check (reason is null or char_length(reason) <= 500)
);

comment on table public.admin_plan_grants is
  'Audited FILMATTA access grants. These rows are independent from Stripe billing records.';

create index admin_plan_grants_user_id_idx
  on public.admin_plan_grants(user_id);
create index admin_plan_grants_expires_at_idx
  on public.admin_plan_grants(expires_at);
create index admin_plan_grants_revoked_at_idx
  on public.admin_plan_grants(revoked_at);
create index admin_plan_grants_active_lookup_idx
  on public.admin_plan_grants(user_id, plan, starts_at, expires_at)
  where revoked_at is null;

create function private.touch_admin_plan_grant_updated_at() returns trigger
language plpgsql security invoker set search_path = '' as $$
begin
  new.updated_at = now();
  return new;
end;
$$;
revoke all on function private.touch_admin_plan_grant_updated_at()
  from public, anon, authenticated;

create trigger admin_plan_grants_touch_updated_at
before update on public.admin_plan_grants
for each row execute function private.touch_admin_plan_grant_updated_at();

alter table public.admin_plan_grants enable row level security;
revoke all on public.admin_plan_grants from public, anon, authenticated;
grant select, insert, update on public.admin_plan_grants to service_role;

-- Resolve paid access and administrative access independently, then select the
-- highest valid plan. The caller identity always comes from auth.uid().
create function public.get_my_billing_access()
returns table (
  effective_plan text,
  stripe_plan text,
  admin_grant_plan text,
  admin_grant_expires_at timestamptz,
  access_source text
)
language sql stable security definer set search_path = '' as $$
  with settings as (
    select coalesce(
      (select test_access_enabled from public.billing_settings where id),
      false
    ) as enabled
  ),
  stripe_access as (
    select e.plan
    from public.billing_entitlements e
    join public.billing_customers c using (stripe_customer_id)
    cross join settings s
    where s.enabled
      and (select auth.uid()) is not null
      and c.user_id = (select auth.uid())
      and e.valid_until > now()
    order by case e.plan when 'pro' then 2 when 'plus' then 1 else 0 end desc
    limit 1
  ),
  grant_access as (
    select g.plan, g.expires_at
    from public.admin_plan_grants g
    cross join settings s
    where s.enabled
      and (select auth.uid()) is not null
      and g.user_id = (select auth.uid())
      and g.starts_at <= now()
      and g.revoked_at is null
      and (g.expires_at is null or g.expires_at > now())
    order by
      case g.plan when 'pro' then 2 when 'plus' then 1 else 0 end desc,
      (g.expires_at is null) desc,
      g.expires_at desc
    limit 1
  ),
  resolved as (
    select
      (select plan from stripe_access limit 1) as stripe_plan,
      (select plan from grant_access limit 1) as grant_plan,
      (select expires_at from grant_access limit 1) as grant_expires_at
  )
  select
    case
      when r.stripe_plan = 'pro' or r.grant_plan = 'pro' then 'pro'
      when r.stripe_plan = 'plus' or r.grant_plan = 'plus' then 'plus'
      else null
    end as effective_plan,
    r.stripe_plan,
    r.grant_plan as admin_grant_plan,
    r.grant_expires_at as admin_grant_expires_at,
    case
      when r.stripe_plan is not null and r.grant_plan is not null then 'both'
      when r.stripe_plan is not null then 'stripe'
      when r.grant_plan is not null then 'admin_grant'
      else null
    end as access_source
  from resolved r;
$$;
revoke all on function public.get_my_billing_access()
  from public, anon, authenticated;
grant execute on function public.get_my_billing_access() to authenticated;

create or replace function public.get_my_billing_plan() returns text
language sql stable security definer set search_path = '' as $$
  select effective_plan
  from public.get_my_billing_access()
  limit 1;
$$;
revoke all on function public.get_my_billing_plan()
  from public, anon, authenticated;
grant execute on function public.get_my_billing_plan() to authenticated;

commit;
