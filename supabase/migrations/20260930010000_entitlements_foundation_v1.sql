-- Entitlements Foundation V1. Additive only: Stripe history remains untouched and
-- becomes one possible source of an effective product plan.
begin;

create table public.subscription_plans (
  code text primary key check (code in ('free', 'starter', 'plus', 'pro', 'pro_plus')),
  label text not null check (char_length(label) between 1 and 40),
  current_price_mxn integer not null check (current_price_mxn >= 0),
  sort_order integer not null unique,
  active boolean not null default true,
  badge_variant text not null
    check (badge_variant in ('baseline', 'starter', 'plus', 'pro', 'pro_plus')),
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.subscription_plans is
  'Product plan catalog. Payment providers are not capability sources of truth.';

insert into public.subscription_plans
  (code, label, current_price_mxn, sort_order, badge_variant, metadata)
values
  ('free', 'Baseline', 0, 0, 'baseline',
    '{"audience":"Participación profesional básica","legacy_aliases":[]}'::jsonb),
  ('starter', 'Starter', 139, 10, 'starter',
    '{"audience":"Learner y creador inicial","legacy_aliases":[]}'::jsonb),
  ('plus', 'Plus', 299, 20, 'plus',
    '{"audience":"Profesional que busca más capacidad","legacy_aliases":[]}'::jsonb),
  ('pro', 'Pro', 599, 30, 'pro',
    '{"audience":"Profesional audiovisual activo","legacy_aliases":[]}'::jsonb),
  ('pro_plus', 'Pro+', 999, 40, 'pro_plus',
    '{"audience":"Productor, productora, estudio o negocio","legacy_aliases":["business"]}'::jsonb);

create table public.plan_entitlements (
  plan_code text not null references public.subscription_plans(code) on delete restrict,
  entitlement_key text not null
    check (entitlement_key ~ '^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$'),
  access_value boolean,
  allowance_value numeric(14, 2) check (allowance_value is null or allowance_value >= 0),
  allowance_unit text check (allowance_unit is null or char_length(allowance_unit) between 1 and 40),
  unlimited boolean not null default false,
  fair_use boolean not null default false,
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (plan_code, entitlement_key),
  constraint plan_entitlements_has_value check (
    access_value is not null or allowance_value is not null or unlimited
  ),
  constraint plan_entitlements_unlimited_allowance check (
    not unlimited or allowance_value is null
  )
);

comment on table public.plan_entitlements is
  'Sparse entitlement overrides. Missing rows inherit from the previous product tier.';

create index plan_entitlements_key_idx
  on public.plan_entitlements(entitlement_key, plan_code);

insert into public.plan_entitlements
  (plan_code, entitlement_key, access_value, allowance_value, allowance_unit, unlimited, fair_use)
values
  ('starter', 'learn.full_access', true, null, null, false, false),
  ('free', 'profiles.base', true, null, null, false, false),
  ('free', 'profiles.reels', null, 1, 'reels', false, false),
  ('free', 'profiles.complementary_videos', null, 2, 'videos', false, false),
  ('free', 'profiles.photos', null, 6, 'fotos', false, false),
  ('plus', 'profiles.extra_storage', true, null, null, false, false),
  ('plus', 'profiles.extra_videos', true, null, null, false, false),
  ('plus', 'profiles.extra_photos', true, null, null, false, false),
  ('plus', 'profiles.collections', true, null, null, false, false),
  ('pro_plus', 'profiles.verification', true, null, null, false, false),
  ('free', 'search.basic', true, null, null, false, false),
  ('plus', 'search.advanced_filters', true, null, null, false, false),
  ('pro', 'search.special_filters', true, null, null, false, false),
  ('pro', 'search.project_matchmaking', true, null, null, false, false),
  ('free', 'search.monthly_allowance', null, 25, 'búsquedas', false, false),
  ('starter', 'search.monthly_allowance', null, 50, 'búsquedas', false, false),
  ('plus', 'search.monthly_allowance', null, 100, 'búsquedas', false, false),
  ('pro', 'search.monthly_allowance', null, 250, 'búsquedas', false, true),
  ('pro_plus', 'search.monthly_allowance', null, 500, 'búsquedas', false, true),
  ('starter', 'writer.entry', true, null, null, false, false),
  ('free', 'writer.ai_credits', null, 0, 'AI Credits', false, false),
  ('starter', 'writer.ai_credits', null, 50, 'AI Credits', false, false),
  ('plus', 'writer.ai_credits', null, 200, 'AI Credits', false, false),
  ('pro', 'writer.ai_credits', null, 500, 'AI Credits', false, true),
  ('pro_plus', 'writer.ai_credits', null, 1000, 'AI Credits', false, true),
  ('pro', 'production.assistant', true, null, null, false, true),
  ('pro', 'production.director_assistant', true, null, null, false, true),
  ('pro', 'production.scene_assistant', true, null, null, false, true),
  ('pro', 'production.light_assistant', true, null, null, false, true),
  ('pro', 'production.storyboard_gen', true, null, null, false, true),
  ('pro_plus', 'services.business_profile', true, null, null, false, true),
  ('pro_plus', 'services.business_verification', true, null, null, false, true),
  ('pro_plus', 'services.advanced_listing', true, null, null, false, true);

create table public.entitlement_usage (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  entitlement_key text not null
    check (entitlement_key ~ '^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$'),
  period_starts_at timestamptz not null,
  period_ends_at timestamptz not null,
  quantity numeric(14, 2) not null default 0 check (quantity >= 0),
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint entitlement_usage_period_valid check (period_ends_at > period_starts_at),
  constraint entitlement_usage_period_unique
    unique (user_id, entitlement_key, period_starts_at, period_ends_at)
);

comment on table public.entitlement_usage is
  'Plan allowance usage. Contact Credits remain a separate economy.';

create index entitlement_usage_current_idx
  on public.entitlement_usage(user_id, entitlement_key, period_ends_at desc);

create function private.touch_entitlements_updated_at() returns trigger
language plpgsql security invoker set search_path = '' as $$
begin
  new.updated_at = now();
  return new;
end;
$$;
revoke all on function private.touch_entitlements_updated_at()
  from public, anon, authenticated;

create trigger subscription_plans_touch_updated_at
before update on public.subscription_plans
for each row execute function private.touch_entitlements_updated_at();

create trigger plan_entitlements_touch_updated_at
before update on public.plan_entitlements
for each row execute function private.touch_entitlements_updated_at();

create trigger entitlement_usage_touch_updated_at
before update on public.entitlement_usage
for each row execute function private.touch_entitlements_updated_at();

alter table public.subscription_plans enable row level security;
alter table public.plan_entitlements enable row level security;
alter table public.entitlement_usage enable row level security;

revoke all on public.subscription_plans, public.plan_entitlements,
  public.entitlement_usage from public, anon, authenticated;
grant select on public.subscription_plans, public.plan_entitlements to anon, authenticated;
grant select on public.entitlement_usage to authenticated;
grant all on public.subscription_plans, public.plan_entitlements,
  public.entitlement_usage to service_role;

create policy subscription_plans_public_read
  on public.subscription_plans for select to anon, authenticated
  using (active);

create policy plan_entitlements_public_read
  on public.plan_entitlements for select to anon, authenticated
  using (exists (
    select 1 from public.subscription_plans p
    where p.code = plan_code and p.active
  ));

create policy entitlement_usage_own_read
  on public.entitlement_usage for select to authenticated
  using (user_id = (select auth.uid()));

-- Reuse the audited Admin Grants table as the canonical explicit-plan source.
-- Its name remains for compatibility; the additional fields make sources and
-- status explicit without copying historical records to a second grant table.
alter table public.admin_plan_grants
  drop constraint if exists admin_plan_grants_plan_check;
alter table public.admin_plan_grants
  add constraint admin_plan_grants_plan_check
    check (plan in ('free', 'starter', 'plus', 'pro', 'pro_plus', 'business'));
alter table public.admin_plan_grants
  add column source text not null default 'admin'
    check (source in ('admin', 'test', 'promo', 'migration', 'future_billing')),
  add column status text not null default 'active'
    check (status in ('active', 'revoked')),
  add column metadata jsonb not null default '{}'::jsonb
    check (jsonb_typeof(metadata) = 'object');

update public.admin_plan_grants
set status = 'revoked'
where revoked_at is not null;

alter table public.admin_plan_grants
  add constraint admin_plan_grants_status_matches_revocation
    check (
      (status = 'active' and revoked_at is null)
      or (status = 'revoked' and revoked_at is not null)
    );

create index admin_plan_grants_effective_v1_idx
  on public.admin_plan_grants(user_id, created_at desc, starts_at, expires_at)
  where status = 'active' and revoked_at is null;

-- One authoritative plan resolver. A valid explicit grant wins, then a valid
-- historical Billing entitlement, then baseline. Expired or invalid data never
-- produces a premium plan.
create function public.get_my_entitlement_context()
returns table (
  effective_plan text,
  billing_plan text,
  grant_plan text,
  grant_expires_at timestamptz,
  access_source text
)
language sql stable security definer set search_path = '' as $$
  with settings as (
    select coalesce(
      (select test_access_enabled from public.billing_settings where id),
      false
    ) as billing_enabled
  ),
  grant_access as (
    select
      case when g.plan = 'business' then 'pro_plus' else g.plan end as plan,
      g.expires_at,
      g.source
    from public.admin_plan_grants g
    where (select auth.uid()) is not null
      and g.user_id = (select auth.uid())
      and g.status = 'active'
      and g.starts_at <= now()
      and g.revoked_at is null
      and (g.expires_at is null or g.expires_at > now())
    order by g.created_at desc, g.starts_at desc, g.id desc
    limit 1
  ),
  billing_access as (
    select e.plan
    from public.billing_entitlements e
    join public.billing_customers c using (stripe_customer_id)
    cross join settings s
    where s.billing_enabled
      and (select auth.uid()) is not null
      and c.user_id = (select auth.uid())
      and e.valid_until > now()
      and e.plan in ('plus', 'pro')
    order by case e.plan when 'pro' then 2 when 'plus' then 1 else 0 end desc
    limit 1
  ),
  resolved as (
    select
      (select plan from grant_access limit 1) as grant_plan,
      (select expires_at from grant_access limit 1) as grant_expires_at,
      (select source from grant_access limit 1) as grant_source,
      (select plan from billing_access limit 1) as billing_plan
  )
  select
    coalesce(r.grant_plan, r.billing_plan, 'free') as effective_plan,
    r.billing_plan,
    r.grant_plan,
    r.grant_expires_at,
    coalesce(r.grant_source, case when r.billing_plan is not null then 'billing' end, 'baseline')
      as access_source
  from resolved r;
$$;
revoke all on function public.get_my_entitlement_context()
  from public, anon, authenticated;
grant execute on function public.get_my_entitlement_context() to anon, authenticated;

-- Compatibility for existing Learn/Billing callers during gradual migration.
create or replace function public.get_my_billing_access()
returns table (
  effective_plan text,
  stripe_plan text,
  admin_grant_plan text,
  admin_grant_expires_at timestamptz,
  access_source text
)
language sql stable security definer set search_path = '' as $$
  select
    case when c.effective_plan = 'free' then null else c.effective_plan end,
    c.billing_plan,
    c.grant_plan,
    c.grant_expires_at,
    case
      when c.grant_plan is not null and c.billing_plan is not null then 'both'
      when c.grant_plan is not null then 'admin_grant'
      when c.billing_plan is not null then 'stripe'
      else null
    end
  from public.get_my_entitlement_context() c;
$$;
revoke all on function public.get_my_billing_access()
  from public, anon, authenticated;
grant execute on function public.get_my_billing_access() to authenticated;

create or replace function public.get_my_billing_plan() returns text
language sql stable security definer set search_path = '' as $$
  select case when effective_plan = 'free' then null else effective_plan end
  from public.get_my_entitlement_context()
  limit 1;
$$;
revoke all on function public.get_my_billing_plan()
  from public, anon, authenticated;
grant execute on function public.get_my_billing_plan() to authenticated;

commit;
